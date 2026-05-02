/**
 * One-off connectivity check for DATABASE_URL and DIRECT_URL (e.g. Supabase + Vercel).
 * Does not read secrets from the repo — set env vars or use a local .env / .env.local (gitignored).
 *
 * Usage:
 *   node bin/test-db-connection.js
 *
 * PowerShell (vars only in this shell session):
 *   $env:DATABASE_URL="postgres://..."
 *   $env:DIRECT_URL="postgres://..."
 *   node bin/test-db-connection.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadDotEnvOptional(filename) {
  const full = path.join(process.cwd(), filename);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnvOptional('.env.local');
loadDotEnvOptional('.env');

function maskUrl(url) {
  return String(url).replace(/:[^:@]+@/, ':****@');
}

async function probe(label, url) {
  if (!url || !String(url).trim()) {
    console.log(`\n[${label}] SKIPPED (not set)`);
    return;
  }

  let connectionString = String(url);
  if (process.env.DB_TEST_STRICT_TLS !== '1') {
    connectionString = connectionString.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/\?&/, '?').replace(/[?&]$/, '');
  }

  console.log(`\n[${label}] ${maskUrl(url)}`);

  if (label === 'DIRECT_URL' && url.includes('pooler.supabase.com')) {
    console.warn(
      `[${label}] Hinweis: DIRECT_URL zeigt auf den Pooler. Für Migrationen empfiehlt Prisma/Supabase db.<project>.supabase.co:5432 (siehe .env.example).`
    );
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 20000,
    ssl:
      process.env.DB_TEST_STRICT_TLS === '1'
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const info = await client.query(
      'SELECT current_database() AS db, current_user AS role, inet_server_addr()::text AS server_addr'
    );
    const row = info.rows[0];
    console.log(`[${label}] OK — db=${row.db} role=${row.role} server_addr=${row.server_addr ?? '(n/a)'}`);

    const migrations = await client.query(
      `SELECT migration_name, finished_at
       FROM "_prisma_migrations"
       ORDER BY finished_at DESC NULLS LAST
       LIMIT 10`
    );
    console.log(`[${label}] Letzte Migrationen (_prisma_migrations):`);
    for (const m of migrations.rows) {
      console.log(`  - ${m.migration_name}`);
    }
  } catch (e) {
    console.error(`[${label}] FEHLGESCHLAGEN:`, e.message);
  } finally {
    try {
      await client.end();
    } catch (_) {
      /* ignore */
    }
  }
}

(async () => {
  if (process.env.DB_TEST_STRICT_TLS !== '1') {
    console.warn(
      '[test-db-connection] Hinweis: TLS mit rejectUnauthorized=false (Diagnose). Streng: DB_TEST_STRICT_TLS=1'
    );
  }
  console.log('[test-db-connection] Prüfe DATABASE_URL und DIRECT_URL …');
  await probe('DATABASE_URL', process.env.DATABASE_URL);
  await probe('DIRECT_URL', process.env.DIRECT_URL);

  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    console.error(
      '\nKeine URLs gesetzt. Bitte .env.local anlegen oder DATABASE_URL / DIRECT_URL in der Shell setzen.'
    );
    process.exit(1);
  }
})();
