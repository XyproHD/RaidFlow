/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readDirectUrl() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.match(/DIRECT_URL\s*=\s*"([^"]+)"/);
  if (!match) throw new Error('DIRECT_URL fehlt in .env.local');
  return match[1];
}

async function main() {
  const directUrl = readDirectUrl();
  const migrationPath = path.resolve(
    __dirname,
    '..',
    'prisma',
    'migrations',
    '20260320_rebuild_battlenet_realms',
    'migration.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const client = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Realm rebuild migration applied.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
