/**
 * Runs `prisma migrate deploy` during CI/Vercel builds with retries.
 * Supabase pooler / cross-region builds sometimes return P1001 transiently.
 * On total failure, exits non-zero so the deployment does not ship without migrations.
 *
 * IMPORTANT: Must mirror pooler URL handling in lib/prisma.ts — the Prisma CLI does not
 * load lib/prisma.ts, so Session pooler (port 5432) stays broken unless we normalize here.
 *
 * For migrations, Prisma prefers DIRECT_URL (see prisma/schema.prisma). Set in Vercel to:
 * postgresql://...@db.<project-ref>.supabase.co:5432/postgres
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

(async () => {
  let lastStatus = 1;
  for (let i = 1; i <= attempts; i++) {
    console.log(`[prisma-migrate] attempt ${i}/${attempts}`);
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
      console.log('[prisma-migrate] migrate status (verification):');
      execSync('npx prisma migrate status', { stdio: 'inherit', env: process.env });
      process.exit(0);
    } catch (e) {
      lastStatus = typeof e.status === 'number' ? e.status : 1;
      console.warn(`[prisma-migrate] attempt ${i} failed (exit ${lastStatus})`);
      if (i < attempts) {
        console.warn(`[prisma-migrate] retry in ${delayMs}ms…`);
        await delay(delayMs);
      }
    }
  }
  console.error('[prisma-migrate] migrate deploy failed after all retries');
  process.exit(lastStatus);
})();
