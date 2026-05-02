/**
 * Runs `prisma migrate deploy` during CI/Vercel builds with retries.
 * Supabase pooler / cross-region builds sometimes return P1001 transiently.
 * On total failure, exits non-zero so the deployment does not ship without migrations.
 *
 * IMPORTANT: Must mirror pooler URL handling in lib/prisma.ts — the Prisma CLI does not
 * load lib/prisma.ts, so Session pooler (port 5432) stays broken unless we normalize here.
 *
 * Fallback: Some builders (e.g. Vercel iad1) cannot reach db.<project>.supabase.co:5432 (P1001).
 * Do NOT fall back to DATABASE_URL as-is: that is the **transaction** pooler (6543). Prisma Migrate
 * can **hang** on PgBouncer transaction mode. Use the **session** pooler on port **5432** instead
 * (same host as DATABASE_URL, different port + stripped pgbouncer params).
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

/**
 * Session pooler (5432) from transaction DATABASE_URL (6543) — safe for Prisma Migrate when db.* fails.
 * @param {string | undefined} databaseUrl
 * @returns {string | null}
 */
function sessionPoolerUrlFromTransactionDatabaseUrl(databaseUrl) {
  if (!databaseUrl || !String(databaseUrl).trim()) return null;
  try {
    const u = new URL(String(databaseUrl).replace(/^postgresql:/, 'postgres:'));
    if (!u.hostname.includes('pooler.supabase.com')) return null;
    u.port = '5432';
    u.searchParams.delete('pgbouncer');
    u.searchParams.delete('connection_limit');
    if (!u.searchParams.has('sslmode')) {
      u.searchParams.set('sslmode', 'require');
    }
    return u.toString();
  } catch {
    return null;
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

  let ok = await runMigrateCycle(baseEnv, 'primary (DIRECT_URL from env)');

  const sessionFallbackUrl = sessionPoolerUrlFromTransactionDatabaseUrl(baseEnv.DATABASE_URL);

  const canFallback =
    !ok &&
    baseEnv.DATABASE_URL &&
    baseEnv.DIRECT_URL &&
    baseEnv.DIRECT_URL !== baseEnv.DATABASE_URL &&
    sessionFallbackUrl &&
    process.env.PRISMA_MIGRATE_NO_POOLER_FALLBACK !== '1' &&
    process.env.PRISMA_MIGRATE_NO_POOLER_FALLBACK !== 'true';

  if (canFallback) {
    console.warn('');
    console.warn(
      '[prisma-migrate] ─────────────────────────────────────────────────────────────────────'
    );
    console.warn(
      '[prisma-migrate] Fallback: db.* unreachable — using Supabase **session** pooler :5432 for Migrate.'
    );
    console.warn(
      '[prisma-migrate] (Do not use transaction pooler :6543 for migrate; it can hang indefinitely.)'
    );
    console.warn(
      '[prisma-migrate] Opt out: PRISMA_MIGRATE_NO_POOLER_FALLBACK=1'
    );
    console.warn(
      '[prisma-migrate] ─────────────────────────────────────────────────────────────────────'
    );
    console.warn('');
    const poolerEnv = { ...baseEnv, DIRECT_URL: sessionFallbackUrl };
    logConnectionTarget('DIRECT_URL (fallback: session pooler)', poolerEnv.DIRECT_URL);
    ok = await runMigrateCycle(poolerEnv, 'fallback (session pooler :5432)');
  } else if (!ok && process.env.PRISMA_MIGRATE_NO_POOLER_FALLBACK === '1') {
    console.error('[prisma-migrate] Pooler fallback disabled; exiting.');
  } else if (!ok && !sessionFallbackUrl && baseEnv.DIRECT_URL !== baseEnv.DATABASE_URL) {
    console.error(
      '[prisma-migrate] No session-pooler fallback possible (DATABASE_URL is not a Supabase pooler URL).'
    );
  }

  if (!ok) {
    console.error('[prisma-migrate] migrate deploy failed after all retries (and fallback if applicable)');
    process.exit(1);
  }
  process.exit(0);
})();
