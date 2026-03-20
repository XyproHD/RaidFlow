import { prisma } from '@/lib/prisma';
import { TBC_CLASSES, getSpecDisplayName } from '@/lib/wow-tbc-classes';
import type { WowRegion, WowRealm, WowVersion } from '@/lib/wow-classic-realms';

type BattlenetProfile = {
  id?: number;
  name?: string;
  level?: number;
  realm?: { slug?: string; name?: string };
  guild?: { name?: string };
  faction?: { type?: string; name?: string };
  race?: { name?: string };
  character_class?: { name?: string };
  active_spec?: { name?: string };
};

function slugifyRealm(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeName(input: string): string {
  return input.trim().toLowerCase();
}

function mapClassNameToId(className: string | undefined): string | null {
  if (!className) return null;
  const n = className.trim().toLowerCase();
  const map: Record<string, string> = {
    druid: 'druid',
    druide: 'druid',
    hunter: 'hunter',
    jager: 'hunter',
    'jäger': 'hunter',
    mage: 'mage',
    magier: 'mage',
    paladin: 'paladin',
    priest: 'priest',
    priester: 'priest',
    rogue: 'rogue',
    schurke: 'rogue',
    shaman: 'shaman',
    schamane: 'shaman',
    warlock: 'warlock',
    hexenmeister: 'warlock',
    warrior: 'warrior',
    krieger: 'warrior',
  };
  return map[n] ?? null;
}

function mapSpecNameToId(classId: string, specName: string | undefined): string | null {
  if (!specName) return null;
  const normalized = specName.trim().toLowerCase();
  const cls = TBC_CLASSES.find((c) => c.id === classId);
  if (!cls) return null;
  const byExact = cls.specs.find((s) => s.name.toLowerCase() === normalized);
  if (byExact) return byExact.id;
  const byContains = cls.specs.find((s) => normalized.includes(s.name.toLowerCase()));
  return byContains?.id ?? null;
}

export async function fetchClassicCharacterFromBattlenet(server: string, characterName: string) {
  const config = await prisma.rfBattlenetApiConfig.findFirst({
    where: { region: 'eu', isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!config) {
    throw new Error('Keine aktive Battle.net API Konfiguration für Region EU gefunden.');
  }

  const realmSlug = slugifyRealm(server);
  const charName = normalizeName(characterName);
  if (!realmSlug || !charName) {
    throw new Error('Server und Charaktername sind erforderlich.');
  }

  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const tokenRes = await fetch(config.oauthTokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!tokenRes.ok) {
    throw new Error('Battle.net Auth fehlgeschlagen.');
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw new Error('Battle.net Access Token fehlt.');
  }

  const profilePath = `${config.profileCharacterPath}/${realmSlug}/${charName}`;
  const params = new URLSearchParams({
    namespace: config.namespaceProfile,
    locale: config.locale,
    access_token: accessToken,
  });

  const profileRes = await fetch(`${config.apiBaseUrl}${profilePath}?${params.toString()}`, {
    cache: 'no-store',
  });
  if (profileRes.status === 404) {
    throw new Error('Charakter auf dem angegebenen Server nicht gefunden.');
  }
  if (!profileRes.ok) {
    throw new Error('Battle.net Charakterabfrage fehlgeschlagen.');
  }

  const profile = (await profileRes.json()) as BattlenetProfile;
  const classId = mapClassNameToId(profile.character_class?.name);
  if (!classId) {
    throw new Error('Klasse des Charakters konnte nicht zugeordnet werden.');
  }
  const specId = mapSpecNameToId(classId, profile.active_spec?.name) ?? TBC_CLASSES.find((c) => c.id === classId)?.specs[0]?.id;
  if (!specId) {
    throw new Error('Spec des Charakters konnte nicht zugeordnet werden.');
  }

  return {
    configId: config.id,
    region: config.region,
    realmSlug: profile.realm?.slug ?? realmSlug,
    realmName: profile.realm?.name ?? server.trim(),
    characterName: profile.name ?? characterName.trim(),
    characterNameLower: charName,
    battlenetCharacterId: profile.id ? BigInt(profile.id) : null,
    level: profile.level ?? null,
    raceName: profile.race?.name ?? null,
    className: profile.character_class?.name ?? null,
    activeSpecName: profile.active_spec?.name ?? null,
    guildName: profile.guild?.name ?? null,
    faction: profile.faction?.name ?? profile.faction?.type ?? null,
    profileUrl: `${config.apiBaseUrl}${profilePath}`,
    rawProfile: profile,
    mainSpec: getSpecDisplayName(classId, specId),
  };
}
function namespaceForVersion(region: WowRegion, wowVersion: WowVersion | null, fallback: string): string {
  if (!wowVersion) return fallback;
  if (wowVersion === 'progression') return `profile-classic-${region}`;
  return `profile-classic1x-${region}`;
}

function dynamicNamespaceForVersion(region: WowRegion, wowVersion: WowVersion | null): string {
  if (!wowVersion || wowVersion === 'progression') return `dynamic-classic-${region}`;
  return `dynamic-classic1x-${region}`;
}

async function getBattlenetConfigForRegion(region: WowRegion) {
  return (
    (await prisma.rfBattlenetApiConfig.findFirst({
      where: { region, isActive: true },
      orderBy: { createdAt: 'asc' },
    })) ??
    (await prisma.rfBattlenetApiConfig.findFirst({
      where: { region: 'eu', isActive: true },
      orderBy: { createdAt: 'asc' },
    }))
  );
}

async function getAccessToken(config: {
  clientId: string;
  clientSecret: string;
  oauthTokenUrl: string;
}) {
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const tokenRes = await fetch(config.oauthTokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!tokenRes.ok) throw new Error('Battle.net Auth fehlgeschlagen.');
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new Error('Battle.net Access Token fehlt.');
  return tokenData.access_token;
}

function parseRealmItems(payload: unknown, region: WowRegion): WowRealm[] {
  const list: WowRealm[] = [];
  const p = payload as
    | { realms?: Array<{ slug?: string; name?: { en_US?: string; de_DE?: string } | string }> }
    | { results?: Array<{ data?: { slug?: string; name?: { en_US?: string; de_DE?: string } | string } }> };

  if (Array.isArray((p as { realms?: unknown[] }).realms)) {
    for (const realm of (p as { realms: Array<{ slug?: string; name?: { en_US?: string; de_DE?: string } | string }> }).realms) {
      const slug = realm.slug?.trim();
      const nameValue = realm.name;
      const name =
        typeof nameValue === 'string'
          ? nameValue
          : nameValue?.de_DE ?? nameValue?.en_US ?? slug ?? '';
      if (!slug || !name) continue;
      list.push({ slug, name, region });
    }
  }

  if (Array.isArray((p as { results?: unknown[] }).results)) {
    for (const row of (p as { results: Array<{ data?: { slug?: string; name?: { en_US?: string; de_DE?: string } | string } }> }).results) {
      const slug = row.data?.slug?.trim();
      const nameValue = row.data?.name;
      const name =
        typeof nameValue === 'string'
          ? nameValue
          : nameValue?.de_DE ?? nameValue?.en_US ?? slug ?? '';
      if (!slug || !name) continue;
      list.push({ slug, name, region });
    }
  }

  const dedup = new Map<string, WowRealm>();
  for (const realm of list) dedup.set(realm.slug, realm);
  return Array.from(dedup.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchClassicRealmsFromBattlenet(region: WowRegion, wowVersion: WowVersion | null) {
  const config = await getBattlenetConfigForRegion(region);
  if (!config) throw new Error('Keine aktive Battle.net API Konfiguration gefunden.');

  const token = await getAccessToken(config);
  const namespace = dynamicNamespaceForVersion(region, wowVersion);
  const apiBaseUrl = region === config.region ? config.apiBaseUrl : `https://${region}.api.blizzard.com`;

  const params = new URLSearchParams({
    namespace,
    locale: config.locale,
    access_token: token,
  });

  const endpoints = ['/data/wow/realm/index', '/data/wow/search/realm?_page=1&_pageSize=2000'];
  let lastError: string | null = null;

  for (const endpoint of endpoints) {
    const joiner = endpoint.includes('?') ? '&' : '?';
    const res = await fetch(`${apiBaseUrl}${endpoint}${joiner}${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      lastError = `HTTP ${res.status}`;
      continue;
    }
    const payload = await res.json();
    const realms = parseRealmItems(payload, region);
    if (realms.length > 0) return realms;
  }

  throw new Error(`Realm-Liste konnte nicht geladen werden (${lastError ?? 'unknown'}).`);
}

export async function fetchClassicCharacterFromBattlenetWithFilters(
  server: string,
  characterName: string,
  region: WowRegion,
  wowVersion: WowVersion | null
) {
  const config = await getBattlenetConfigForRegion(region);

  if (!config) {
    throw new Error('Keine aktive Battle.net API Konfiguration gefunden.');
  }

  const realmSlug = slugifyRealm(server);
  const charName = normalizeName(characterName);
  if (!realmSlug || !charName) {
    throw new Error('Server und Charaktername sind erforderlich.');
  }

  const accessToken = await getAccessToken(config);

  const namespace = namespaceForVersion(region, wowVersion, config.namespaceProfile);
  const apiBaseUrl = region === config.region ? config.apiBaseUrl : `https://${region}.api.blizzard.com`;
  const profilePath = `${config.profileCharacterPath}/${realmSlug}/${charName}`;
  const params = new URLSearchParams({
    namespace,
    locale: config.locale,
    access_token: accessToken,
  });

  const profileRes = await fetch(`${apiBaseUrl}${profilePath}?${params.toString()}`, { cache: 'no-store' });
  if (profileRes.status === 404) {
    throw new Error('Charakter auf dem angegebenen Server nicht gefunden.');
  }
  if (!profileRes.ok) {
    throw new Error('Battle.net Charakterabfrage fehlgeschlagen.');
  }

  const profile = (await profileRes.json()) as BattlenetProfile;
  const classId = mapClassNameToId(profile.character_class?.name);
  if (!classId) {
    throw new Error('Klasse des Charakters konnte nicht zugeordnet werden.');
  }
  const specId =
    mapSpecNameToId(classId, profile.active_spec?.name) ??
    TBC_CLASSES.find((c) => c.id === classId)?.specs[0]?.id;
  if (!specId) {
    throw new Error('Spec des Charakters konnte nicht zugeordnet werden.');
  }

  return {
    configId: config.id,
    region,
    wowVersion,
    realmSlug: profile.realm?.slug ?? realmSlug,
    realmName: profile.realm?.name ?? server.trim(),
    characterName: profile.name ?? characterName.trim(),
    characterNameLower: charName,
    battlenetCharacterId: profile.id ? BigInt(profile.id) : null,
    level: profile.level ?? null,
    raceName: profile.race?.name ?? null,
    className: profile.character_class?.name ?? null,
    activeSpecName: profile.active_spec?.name ?? null,
    guildName: profile.guild?.name ?? null,
    faction: profile.faction?.name ?? profile.faction?.type ?? null,
    profileUrl: `${apiBaseUrl}${profilePath}`,
    rawProfile: profile,
    mainSpec: getSpecDisplayName(classId, specId),
  };
}
