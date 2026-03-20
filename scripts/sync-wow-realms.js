/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env.local');

const REGION_VERSION_NAMESPACE = [
  { region: 'eu', version: 'Classic', namespace: 'dynamic-classic1x-eu' },
  { region: 'eu', version: 'MoP', namespace: 'dynamic-classic-eu' },
  { region: 'eu', version: 'TBC', namespace: 'dynamic-classicann-eu' },
  { region: 'us', version: 'Classic', namespace: 'dynamic-classic1x-us' },
  { region: 'us', version: 'MoP', namespace: 'dynamic-classic-us' },
  { region: 'us', version: 'TBC', namespace: 'dynamic-classicann-us' },
];

const LOCALES = ['de_DE', 'en_US', 'fr_FR', 'es_ES', 'it_IT', 'pt_BR'];

function readEnv() {
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function fetchAccessToken(clientId, clientSecret, region) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`https://${region}.battle.net/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`Battle.net Auth fehlgeschlagen fuer ${region} (${res.status})`);
  }
  const data = await res.json();
  if (!data?.access_token) {
    throw new Error(`Battle.net Access Token fehlt fuer ${region}`);
  }
  return data.access_token;
}

async function fetchConnectedRealmSearchPage({ region, namespace, locale, accessToken, page }) {
  const params = new URLSearchParams({
    namespace,
    orderby: 'id',
    _page: String(page),
    locale,
  });
  const url = `https://${region}.api.blizzard.com/data/wow/search/connected-realm?${params.toString()}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Connected Realm Search fehlgeschlagen (${region}/${namespace}/${locale}/page=${page}) -> ${res.status}`);
  }
  return res.json();
}

function normalizeType(realm) {
  if (typeof realm?.type?.type === 'string') return realm.type.type;
  if (typeof realm?.type?.name === 'string') return realm.type.name;
  return 'unknown';
}

function versionAndNamespaceFromInternal(internalWowVersion, region) {
  const v = String(internalWowVersion || '').toLowerCase();
  if (v === 'anniversary' || v === 'tbc') {
    return { version: 'TBC', namespace: `dynamic-classicann-${region}` };
  }
  if (v === 'progression' || v === 'mop') {
    return { version: 'MoP', namespace: `dynamic-classic-${region}` };
  }
  return { version: 'Classic', namespace: `dynamic-classic1x-${region}` };
}

async function main() {
  const env = readEnv();
  const directUrl = env.DIRECT_URL;
  const clientId = env.BATTLENET_CLIENT_ID;
  const clientSecret = env.BATTLENET_CLIENT_SECRET;
  if (!directUrl) throw new Error('DIRECT_URL fehlt in .env.local');
  if (!clientId || !clientSecret) throw new Error('Battle.net Credentials fehlen in .env.local');

  const tokenByRegion = {};
  for (const region of ['eu', 'us']) {
    tokenByRegion[region] = await fetchAccessToken(clientId, clientSecret, region);
  }

  const merged = new Map();

  for (const entry of REGION_VERSION_NAMESPACE) {
    const accessToken = tokenByRegion[entry.region];
    let namespaceReachable = false;

    for (const locale of LOCALES) {
      try {
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const payload = await fetchConnectedRealmSearchPage({
            region: entry.region,
            namespace: entry.namespace,
            locale,
            accessToken,
            page,
          });
          namespaceReachable = true;
          const results = Array.isArray(payload?.results) ? payload.results : [];
          for (const result of results) {
            const realms = Array.isArray(result?.data?.realms) ? result.data.realms : [];
            for (const realm of realms) {
              if (typeof realm?.id !== 'number' || typeof realm?.slug !== 'string') continue;
              const key = `${entry.region}|${entry.namespace}|${realm.id}`;
              const current = merged.get(key) ?? {
                realmId: realm.id,
                slug: realm.slug,
                region: entry.region,
                namespace: entry.namespace,
                version: entry.version,
                type: normalizeType(realm),
                name: {},
              };
              if (typeof realm?.name === 'string' && realm.name.trim().length > 0) {
                current.name[locale] = realm.name.trim();
              }
              current.slug = realm.slug;
              current.type = normalizeType(realm);
              merged.set(key, current);
            }
          }
          const pageCount =
            typeof payload?.pageCount === 'number'
              ? payload.pageCount
              : typeof payload?.page_count === 'number'
                ? payload.page_count
                : null;
          if (pageCount !== null) {
            hasMore = page < pageCount;
          } else {
            hasMore = results.length > 0;
          }
          page += 1;
        }
      } catch (error) {
        console.warn(
          `Locale-Skip fuer ${entry.region}/${entry.namespace}/${locale}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    if (!namespaceReachable) {
      console.warn(`Skip namespace ${entry.namespace} (${entry.region}) - nicht erreichbar.`);
    }
  }

  const client = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    if (merged.size === 0) {
      const fallbackRows = await client.query(
        `SELECT DISTINCT region, COALESCE(wow_version, 'classic_era') AS wow_version, realm_slug, realm_name
         FROM public.rf_battlenet_character_profile
         WHERE realm_slug IS NOT NULL AND COALESCE(realm_name, '') <> ''`
      );
      for (const row of fallbackRows.rows) {
        const region = String(row.region || 'eu').toLowerCase();
        const wowInfo = versionAndNamespaceFromInternal(row.wow_version, region);
        const syntheticId = BigInt(
          Array.from(String(row.realm_slug)).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7)
        );
        const key = `${region}|${wowInfo.namespace}|${syntheticId.toString()}`;
        merged.set(key, {
          realmId: syntheticId,
          slug: String(row.realm_slug),
          region,
          namespace: wowInfo.namespace,
          version: wowInfo.version,
          type: 'unknown',
          name: {
            de_DE: String(row.realm_name),
            en_US: String(row.realm_name),
          },
        });
      }
      console.warn(`API-Fallback aktiv: ${merged.size} Realm-Eintraege aus Character-Profilen aufgebaut.`);
    }

    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE public.rf_battlenet_realm');

    for (const realm of merged.values()) {
      await client.query(
        `SELECT public.rf_upsert_battlenet_realm($1::bigint, $2::jsonb, $3::text, $4::text, $5::text, $6::text, $7::text)`,
        [
          realm.realmId,
          JSON.stringify(realm.name),
          realm.slug,
          realm.region,
          realm.namespace,
          realm.version,
          realm.type,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`Realm Sync abgeschlossen. ${merged.size} Realm-Eintraege gespeichert.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
