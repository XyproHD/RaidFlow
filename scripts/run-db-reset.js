/**
 * Liest DIRECT_URL aus .env.local und führt db-reset.sql aus.
 * Vorher: Auflistung der vorhandenen Tabellen (Prüfung).
 * Aufruf: node scripts/run-db-reset.js (aus Projektroot)
 */
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('.env.local nicht gefunden.');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const idx = line.indexOf('=');
    if (idx <= 0 || line.trim().startsWith('#')) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[key] = val;
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const directUrl = env.DIRECT_URL || env.DATABASE_URL;
  if (!directUrl) {
    console.error('Weder DIRECT_URL noch DATABASE_URL in .env.local gefunden.');
    process.exit(1);
  }

  let pg;
  try {
    pg = require('pg');
  } catch {
    console.error('Bitte zuerst ausführen: npm install pg');
    process.exit(1);
  }

  const url = new URL(directUrl);
  url.searchParams.set('sslmode', 'no-verify');
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Verbindung zu Supabase hergestellt.\n');

    const tablesRes = await client.query(`
      SELECT schemaname, tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    if (tablesRes.rows.length === 0) {
      console.log('Öffentliches Schema: keine Tabellen vorhanden.');
    } else {
      console.log('Vorhandene Tabellen (public):');
      tablesRes.rows.forEach((r) => console.log('  -', r.tablename));
      console.log('');
    }

    const sqlPath = path.join(__dirname, 'db-reset.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log('Reset ausgeführt: alle RaidFlow-Tabellen/Views gelöscht.\n');

    const afterRes = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `);
    console.log('Tabellen nach Reset:', afterRes.rows.length === 0 ? '(keine)' : afterRes.rows.map((r) => r.tablename).join(', '));
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
