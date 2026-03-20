import { prisma } from '@/lib/prisma';
import { TBC_CLASSES, getSpecDisplayName } from '@/lib/wow-tbc-classes';

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
