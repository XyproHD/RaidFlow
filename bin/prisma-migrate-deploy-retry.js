/**
 * Runs `prisma migrate deploy` during CI/Vercel builds with retries.
 * Supabase pooler / cross-region builds sometimes return P1001 transiently.
 * On total failure, exits non-zero so the deployment does not ship without migrations.
 */
const { execSync } = require('child_process');
const { setTimeout: delay } = require('timers/promises');

const attempts = Math.max(1, parseInt(process.env.PRISMA_MIGRATE_ATTEMPTS || '5', 10));
const delayMs = Math.max(0, parseInt(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS || '10000', 10));

(async () => {
  let lastStatus = 1;
  for (let i = 1; i <= attempts; i++) {
    console.log(`[prisma-migrate] attempt ${i}/${attempts}`);
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
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
