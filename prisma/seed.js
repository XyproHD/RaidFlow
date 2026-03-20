/**
 * RaidFlow DB-Seed: TBC-Dungeons (Phase 3.5).
 * Ausführung: npx prisma db seed
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TBC_DUNGEONS = [
  { name: 'Karazhan', expansion: 'TBC' },
  { name: "Gruul's Lair", expansion: 'TBC' },
  { name: "Magtheridon's Lair", expansion: 'TBC' },
  { name: 'Serpentshrine Cavern', expansion: 'TBC' },
  { name: 'Tempest Keep', expansion: 'TBC' },
  { name: 'Hyjal Summit', expansion: 'TBC' },
  { name: 'Black Temple', expansion: 'TBC' },
  { name: "Zul'Aman", expansion: 'TBC' },
  { name: 'Sunwell Plateau', expansion: 'TBC' },
];

async function main() {
  const existing = await prisma.rfDungeon.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((e) => e.name));
  for (const d of TBC_DUNGEONS) {
    if (existingNames.has(d.name)) continue;
    await prisma.rfDungeon.create({
      data: {
        name: d.name,
        expansion: d.expansion,
        instanceType: 'raid',
        maxPlayers: 25,
      },
    });
  }
  console.log('Seed: TBC-Dungeons angelegt/geprüft.');

  const battlenetClientId = process.env.BATTLENET_CLIENT_ID;
  const battlenetClientSecret = process.env.BATTLENET_CLIENT_SECRET;

  if (!battlenetClientId || !battlenetClientSecret) {
    console.warn('Seed: Battle.net Konfiguration übersprungen (BATTLENET_CLIENT_ID/SECRET fehlt).');
    return;
  }

  await prisma.rfBattlenetApiConfig.upsert({
    where: { region: 'eu' },
    update: {
      clientId: battlenetClientId,
      clientSecret: battlenetClientSecret,
      locale: 'de_DE',
      namespaceProfile: 'profile-classic-eu',
      namespaceDynamic: 'dynamic-classic-eu',
      oauthTokenUrl: 'https://oauth.battle.net/token',
      apiBaseUrl: 'https://eu.api.blizzard.com',
      searchCharacterPath: '/data/wow/search/character',
      searchGuildPath: '/data/wow/search/guild',
      profileCharacterPath: '/profile/wow/character',
      profileGuildPath: '/data/wow/guild',
      isActive: true,
    },
    create: {
      region: 'eu',
      clientId: battlenetClientId,
      clientSecret: battlenetClientSecret,
      locale: 'de_DE',
      namespaceProfile: 'profile-classic-eu',
      namespaceDynamic: 'dynamic-classic-eu',
      oauthTokenUrl: 'https://oauth.battle.net/token',
      apiBaseUrl: 'https://eu.api.blizzard.com',
      searchCharacterPath: '/data/wow/search/character',
      searchGuildPath: '/data/wow/search/guild',
      profileCharacterPath: '/profile/wow/character',
      profileGuildPath: '/data/wow/guild',
      isActive: true,
    },
  });

  console.log('Seed: Battle.net API Konfiguration (Region EU) angelegt/geprüft.');

  // ---------------------------------------------------------------------------
  // Battle.net Realms (fixed server list)
  // ---------------------------------------------------------------------------

  const existingRealmsCount = await prisma.rfBattlenetRealm.count();
  if (existingRealmsCount > 0) {
    console.log(`Seed: Battle.net Realms übersprungen (bereits vorhanden: ${existingRealmsCount}).`);
    return;
  }

  const wowVersions = ['progression', 'classic_era', 'hardcore', 'season_of_discovery', 'anniversary'];

  const slugifyRealm = (input) =>
    input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const resolveLocalizedName = (nameValue, fallback) => {
    if (typeof nameValue === 'string') return nameValue;
    if (nameValue && typeof nameValue === 'object') {
      const dict = nameValue;
      const preferred = ['de_DE', 'en_GB', 'en_US', 'ko_KR', 'zh_TW'];
      for (const key of preferred) {
        if (typeof dict[key] === 'string' && dict[key]) return dict[key];
      }
      for (const val of Object.values(dict)) {
        if (typeof val === 'string' && val) return val;
      }
    }
    return fallback;
  };

  const parseRealmItems = (payload) => {
    const list = [];

    if (Array.isArray(payload?.realms)) {
      for (const realm of payload.realms) {
        const slug = realm?.slug?.trim();
        const name = resolveLocalizedName(realm?.name, slug || '');
        if (!slug || !name) continue;
        list.push({ slug, name });
      }
    } else if (Array.isArray(payload?.results)) {
      for (const row of payload.results) {
        const slug = row?.data?.slug?.trim();
        const name = resolveLocalizedName(row?.data?.name, slug || '');
        if (!slug || !name) continue;
        list.push({ slug, name });
      }
    }

    // Dedupe by slug (API payload can contain duplicates).
    const seen = new Set();
    const out = [];
    for (const r of list) {
      if (seen.has(r.slug)) continue;
      seen.add(r.slug);
      out.push(r);
    }
    return out;
  };

  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const configs = await prisma.rfBattlenetApiConfig.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { region: true, clientId: true, clientSecret: true, locale: true, oauthTokenUrl: true, apiBaseUrl: true },
  });

  if (!configs.length) {
    console.warn('Seed: Keine aktiven Battle.net API Konfigurationen gefunden.');
    return;
  }

  const getAccessToken = async (cfg) => {
    const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const tokenRes = await fetch(cfg.oauthTokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    });
    if (!tokenRes.ok) {
      let errText = '';
      try {
        errText = await tokenRes.text();
      } catch {
        errText = '';
      }
      console.error('Seed: Battle.net Auth fehlgeschlagen.', {
        status: tokenRes.status,
        body: errText?.slice(0, 600),
      });
      throw new Error('Battle.net Auth fehlgeschlagen.');
    }
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Battle.net Access Token fehlt.');
    return tokenData.access_token;
  };

  console.log('Seed: Battle.net Realms werden initial geladen (dies kann dauern)…');

  for (const cfg of configs) {
    const token = await getAccessToken(cfg);
    for (const wowVersion of wowVersions) {
      const namespace =
        wowVersion === 'progression' ? `dynamic-classic-${cfg.region}` : `dynamic-classic1x-${cfg.region}`;

      const params = new URLSearchParams({
        namespace,
        locale: cfg.locale,
        access_token: token,
      });

      const endpoints = ['/data/wow/realm/index', '/data/wow/search/realm?_page=1&_pageSize=2000'];
      let realms = [];

      for (const endpoint of endpoints) {
        const joiner = endpoint.includes('?') ? '&' : '?';
        const url = `${cfg.apiBaseUrl}${endpoint}${joiner}${params.toString()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const payload = await res.json();
        realms = parseRealmItems(payload);
        if (realms.length > 0) break;
      }

      if (!realms.length) {
        console.warn(`Seed: Realm-Liste leer für region=${cfg.region}, wowVersion=${wowVersion} (API liefert keine Realms).`);
        continue;
      }

      const records = realms.map((r) => ({
        region: cfg.region,
        wowVersion,
        realmSlug: r.slug,
        realmName: r.name,
      }));

      for (const part of chunk(records, 5000)) {
        await prisma.rfBattlenetRealm.createMany({
          data: part,
          skipDuplicates: true,
        });
      }

      console.log(`Seed: Realms geladen: region=${cfg.region} wowVersion=${wowVersion} count=${records.length}`);
    }
  }

  console.log('Seed: Battle.net Realms Tabelle befüllt.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
