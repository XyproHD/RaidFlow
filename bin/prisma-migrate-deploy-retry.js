/**
 * Runs `prisma migrate deploy` during CI/Vercel builds with retries.
 * Supabase pooler / cross-region builds sometimes return P1001 transiently.
 * On total failure, exits non-zero so the deployment does not ship without migrations.
 *
 * IMPORTANT: Must mirror pooler URL handling in lib/prisma.ts — the Prisma CLI does not
 * load lib/prisma.ts, so Session pooler (port 5432) stays broken unless we normalize here.
 *
 * Fallback: Some builders (e.g. Vercel iad1 → eu-central-1) cannot open TCP to
 * db.<project>.supabase.co:5432 (IPv6 / routing). The transaction pooler on 6543 usually works.
 * If all retries with your real DIRECT_URL fail, we retry with DIRECT_URL := DATABASE_URL
 * (unless PRISMA_MIGRATE_NO_POOLER_FALLBACK=1).
 */
const { execSync } = require('child_process');
const { setTimeout: delay } = require('timers/promises');

const attempts = Math.max(1, parseInt(process.env.PRISMA_MIGRATE_ATTEMPTS || '5', 10));
const delayMs = Math.max(0, parseInt(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS || '10000', 10));

/** @param {string} urlString */
function normalizeSupabasePoolerUrl(urlString) {
  if (!urlString.trim()) return urlString;
  try {
    const u = new URL(urlString);
    if (!u.hostname.includes('pooler.supabase.com')) return urlString;

    const effectivePort = u.port || '5432';
    let portSwitched = false;
    if (effectivePort === '5432') {
      u.port = '6543';
      portSwitched = true;
    }
    if (!u.searchParams.has('pgbouncer')) {
      u.searchParams.set('pgbouncer', 'true');
    }
    if (!u.searchParams.has('connection_limit')) {
      u.searchParams.set('connection_limit', '1');
    }

    if (portSwitched) {
      console.warn(
        '[prisma-migrate] Supabase pooler: Session port 5432 → Transaction port 6543 (same as lib/prisma.ts).'
      );
    }
    return u.toString();
  } catch {
    return urlString;
  }
}

/** @param {string | undefined} label @param {string | undefined} raw */
function logConnectionTarget(label, raw) {
  if (!raw || !String(raw).trim()) {
    console.log(`[prisma-migrate] ${label}: (not set)`);
    return;
  }
  try {
    const u = new URL(String(raw).replace(/^postgresql:/, 'postgres:'));
    const db = (u.pathname || '/postgres').replace(/^\//, '').split('/')[0];
    console.log(`[prisma-migrate] ${label}: ${u.hostname}:${u.port || '5432'} db=${db}`);
  } catch {
    console.log(`[prisma-migrate] ${label}: (could not parse URL)`);
  }
}

function warnEnv() {
  if (process.env.VERCEL) {
    console.log(
      `[prisma-migrate] Vercel: VERCEL_ENV=${process.env.VERCEL_ENV ?? '(unset)'} GIT_COMMIT_REF=${process.env.VERCEL_GIT_COMMIT_REF ?? '(n/a)'}`
    );
  }
  logConnectionTarget('DATABASE_URL (effective)', process.env.DATABASE_URL);
  logConnectionTarget('DIRECT_URL (migrate/introspect)', process.env.DIRECT_URL);

  if (process.env.VERCEL && !process.env.DIRECT_URL) {
    console.warn(
      '[prisma-migrate] WARNING: DIRECT_URL is unset on Vercel. Prisma Migrate should use the direct host db.<project-ref>.supabase.co:5432 (see .env.example). Pooler-only setups can fail with P1001 or drift from the DB you inspect in the Supabase UI.'
    );
  }

  if (process.env.DIRECT_URL && process.env.DIRECT_URL.includes('pooler.supabase.com')) {
    console.warn(
      '[prisma-migrate] WARNING: DIRECT_URL points at the pooler. Prefer db.<project-ref>.supabase.co:5432 for migrations.'
    );
  }
}

warnEnv();

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeSupabasePoolerUrl(process.env.DATABASE_URL);
  logConnectionTarget('DATABASE_URL (after pooler normalize)', process.env.DATABASE_URL);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} phaseLabel
 * @returns {Promise<boolean>}
 */
async function runMigrateCycle(env, phaseLabel) {
  for (let i = 1; i <= attempts; i++) {
    console.log(`[prisma-migrate] ${phaseLabel} — attempt ${i}/${attempts}`);
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
      console.log('[prisma-migrate] migrate status (verification):');
      execSync('npx prisma migrate status', { stdio: 'inherit', env });
      return true;
    } catch (e) {
      const lastStatus = typeof e.status === 'number' ? e.status : 1;
      console.warn(`[prisma-migrate] ${phaseLabel} — attempt ${i} failed (exit ${lastStatus})`);
      if (i < attempts) {
        console.warn(`[prisma-migrate] retry in ${delayMs}ms…`);
        await delay(delayMs);
      }
    }
  }
  return false;
}

(async () => {
  const baseEnv = { ...process.env };

  let ok = await runMigrateCycle(baseEnv, 'direct (DIRECT_URL → db.*.supabase.co)');

  const canFallback =
    !ok &&
    baseEnv.DATABASE_URL &&
    baseEnv.DIRECT_URL &&
    baseEnv.DIRECT_URL !== baseEnv.DATABASE_URL &&
    process.env.PRISMA_MIGRATE_NO_POOLER_FALLBACK !== '1' &&
    process.env.PRISMA_MIGRATE_NO_POOLER_FALLBACK !== 'true';

  if (canFallback) {
    console.warn('');
    console.warn(
      '[prisma-migrate] ─────────────────────────────────────────────────────────────────────'
    );
    console.warn(
      '[prisma-migrate] Fallback phase: db.* host unreachable from this builder (common on Vercel).'
    );
    console.warn(
      '[prisma-migrate] Running migrate with DIRECT_URL := DATABASE_URL (transaction pooler).'
    );
    console.warn(
      '[prisma-migrate] Opt out: PRISMA_MIGRATE_NO_POOLER_FALLBACK=1'
    );
    console.warn(
      '[prisma-migrate] ─────────────────────────────────────────────────────────────────────'
    );
    console.warn('');
    const poolerEnv = { ...baseEnv, DIRECT_URL: baseEnv.DATABASE_URL };
    logConnectionTarget('DIRECT_URL (fallback, same as DATABASE_URL)', poolerEnv.DIRECT_URL);
    ok = await runMigrateCycle(poolerEnv, 'pooler (DIRECT_URL := DATABASE_URL)');
  } else if (!ok && process.env.PRISMA_MIGRATE_NO_POOLER_FALLBACK === '1') {
    console.error('[prisma-migrate] Pooler fallback disabled; exiting.');
  }

  if (!ok) {
    console.error('[prisma-migrate] migrate deploy failed after all retries (and fallback if applicable)');
    process.exit(1);
  }
  process.exit(0);
})();
