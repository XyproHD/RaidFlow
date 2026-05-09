import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TBC_CLASSES, getSpecDisplayName } from '@/lib/wow-tbc-classes';
import type { WowPreset, WowRegion } from '@/lib/wow-classic-realms';
import { dynamicNamespaceToProfileNamespace } from '@/lib/wow-realm-name';

/** Blizzard profile/specialization endpoints need Bearer; `access_token` in the query often yields 404. */
export function battlenetBearerInit(accessToken: string): RequestInit {
  return {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  };
}

export function profileQueryString(namespace: string, locale: string): string {
  return new URLSearchParams({ namespace, locale }).toString();
}

const TOKEN_EXPIRY_SAFETY_MS = 30_000;
type BattlenetTokenCacheEntry = {
  token: string;
  expiresAt: number;
  inflight?: Promise<string>;
};
const battlenetTokenCache = new Map<string, BattlenetTokenCacheEntry>();

/** URL for logs/client debug: real query params; auth is Bearer (not in URL). */
function battleNetCharacterRequestUrlForLog(
  apiBaseUrl: string,
  profilePath: string,
  namespace: string,
  locale: string
): string {
  return `${apiBaseUrl}${profilePath}?${profileQueryString(namespace, locale)} [Authorization: Bearer ***]`;
}

/** Safe to log (no secrets): request URL + note that Bearer token is sent separately. */
export type BattlenetRequestDebug = {
  requestUrl: string;
  httpStatus: number;
  method: string;
};

export class BattlenetCharacterRequestError extends Error {
  readonly battlenetDebug: BattlenetRequestDebug;

  constructor(
    message: string,
    init: { requestUrl: string; httpStatus: number; method?: string }
  ) {
    super(message);
    this.name = 'BattlenetCharacterRequestError';
    this.battlenetDebug = {
      requestUrl: init.requestUrl,
      httpStatus: init.httpStatus,
      method: init.method ?? 'GET',
    };
  }
}

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
  _links?: {
    self?: { href?: string };
    specializations?: { href?: string };
  };
};

/** Character specializations resource (Classic / Classic Ann.); siehe Blizzard Profile API. */
type BattlenetSpecializations = {
  active_specialization?: { specialization?: { name?: string } };
  /** Jubiläum / Progression: aktive Gruppe + Punkte je Talentbaum */
  specialization_groups?: Array<{
    is_active?: boolean;
    specializations?: Array<{
      specialization_name?: string;
      spent_points?: number;
      talents?: unknown[];
    }>;
  }>;
  /** Flache Liste je Talentbaum mit talents[].talent_rank */
  specializations?: Array<{
    specialization?: { name?: string };
    specialization_name?: string;
    playable_class?: { name?: string };
    talents?: unknown[];
    spent_skill_points?: number;
  }>;
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
  const qs = profileQueryString(config.namespaceProfile, config.locale);

  const profileRes = await fetch(`${config.apiBaseUrl}${profilePath}?${qs}`, battlenetBearerInit(accessToken));
  if (profileRes.status === 404) {
    throw new Error('Charakter auf dem angegebenen Server nicht gefunden.');
  }
  if (!profileRes.ok) {
    throw new Error('Battle.net Charakterabfrage fehlgeschlagen.');
  }

  const profile = (await profileRes.json()) as BattlenetProfile;
  const specializations = await fetchSpecializations(
    profile?._links?.specializations?.href,
    config.locale,
    accessToken
  );
  const resolved = resolveClassAndSpec(profile, specializations);

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
    className: resolved.className ?? null,
    activeSpecName: resolved.specName ?? null,
    guildName: profile.guild?.name ?? null,
    faction: profile.faction?.name ?? profile.faction?.type ?? null,
    profileUrl: `${config.apiBaseUrl}${profilePath}`,
    rawProfile: profile,
    mainSpec: getSpecDisplayName(resolved.classId, resolved.specId),
  };
}
type ProfileNamespaceCandidate = {
  namespace: string;
  internalWowVersion: string; // stored in rf_battlenet_character_profile.wow_version
};

function profileNamespacesForPreset(region: WowRegion, wowPreset: WowPreset): ProfileNamespaceCandidate[] {
  if (wowPreset === 'tbc') {
    return [{ namespace: `profile-classicann-${region}`, internalWowVersion: 'anniversary' }];
  }
  if (wowPreset === 'mop') {
    return [{ namespace: `profile-classic-${region}`, internalWowVersion: 'progression' }];
  }
  if (wowPreset === 'classic') {
    return [{ namespace: `profile-classic1x-${region}`, internalWowVersion: 'classic_era' }];
  }

  throw new Error(`Unsupported wow preset: ${wowPreset}`);
}

export async function getBattlenetConfigForRegion(region: WowRegion) {
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

export async function getBattlenetAccessToken(config: {
  clientId: string;
  clientSecret: string;
  oauthTokenUrl: string;
}) {
  const cacheKey = `${config.oauthTokenUrl}::${config.clientId}`;
  const cached = battlenetTokenCache.get(cacheKey);
  const now = Date.now();
  if (cached?.token && cached.expiresAt > now + TOKEN_EXPIRY_SAFETY_MS) {
    return cached.token;
  }
  if (cached?.inflight) return cached.inflight;

  const inflight = (async () => {
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
    const tokenData = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
    if (!tokenData.access_token) throw new Error('Battle.net Access Token fehlt.');
    const expiresInSec = Number.isFinite(tokenData.expires_in) ? Number(tokenData.expires_in) : 0;
    const expiresAt = Date.now() + Math.max(0, expiresInSec * 1000);
    battlenetTokenCache.set(cacheKey, {
      token: tokenData.access_token,
      expiresAt,
    });
    return tokenData.access_token;
  })();

  battlenetTokenCache.set(cacheKey, {
    token: '',
    expiresAt: 0,
    inflight,
  });

  try {
    return await inflight;
  } finally {
    const latest = battlenetTokenCache.get(cacheKey);
    if (latest?.inflight === inflight) {
      battlenetTokenCache.delete(cacheKey);
    }
  }
}

function wowVersionToInternal(version: string): string {
  const normalized = version.trim().toLowerCase();
  if (normalized === 'tbc') return 'anniversary';
  if (normalized === 'mop') return 'progression';
  return 'classic_era';
}

async function fetchSpecializations(
  specializationsHref: string | undefined,
  locale: string,
  accessToken: string
): Promise<BattlenetSpecializations | null> {
  if (!specializationsHref) return null;
  try {
    const url = new URL(specializationsHref);
    url.searchParams.set('locale', locale);
    url.searchParams.delete('access_token');
    const res = await fetch(url.toString(), battlenetBearerInit(accessToken));
    if (!res.ok) return null;
    return (await res.json()) as BattlenetSpecializations;
  } catch {
    return null;
  }
}

/**
 * Summe vergebenen Talentpunkte aus der Talente-Liste.
 * Wenn `talent_rank`/`rank` vorkommen, nur diese summieren; sonst zählen nur gelistete Einträge (je 1), falls Blizzard nur gewählte Talente liefert.
 */
function sumTalentPointsFromTalentsArray(talents: unknown): number {
  if (!Array.isArray(talents)) return 0;
  let sum = 0;
  let usedExplicitRanks = false;
  for (const raw of talents) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Record<string, unknown>;
    if (typeof t.talent_rank === 'number') {
      sum += t.talent_rank;
      usedExplicitRanks = true;
    } else if (typeof t.rank === 'number') {
      sum += t.rank;
      usedExplicitRanks = true;
    }
  }
  if (usedExplicitRanks) return sum;
  return talents.filter((x) => x && typeof x === 'object').length;
}

function pointsForSpecializationGroupItem(item: {
  spent_points?: number;
  talents?: unknown[];
}): number {
  if (typeof item.spent_points === 'number') return item.spent_points;
  return sumTalentPointsFromTalentsArray(item.talents);
}

/**
 * Haupt-Spec = Talentbaum mit den meisten vergebenen Punkten (spent_points bzw. Summe talent_rank).
 * Fallback: active_specialization / Profil-active_spec.
 */
function pickMainSpecNameFromSpecializations(
  specializations: BattlenetSpecializations | null,
  profile: BattlenetProfile
): string | undefined {
  if (!specializations) {
    return profile.active_spec?.name;
  }

  const groups = specializations.specialization_groups;
  if (Array.isArray(groups) && groups.length > 0) {
    const activeGroup = groups.find((g) => g?.is_active) ?? groups[0];
    const items = activeGroup?.specializations;
    if (Array.isArray(items) && items.length > 0) {
      let bestName: string | undefined;
      let bestPts = -1;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const pts = pointsForSpecializationGroupItem(item);
        const name = item.specialization_name?.trim();
        if (pts > bestPts && name) {
          bestPts = pts;
          bestName = name;
        }
      }
      if (bestName != null && bestPts > 0) return bestName;
    }
  }

  const specs = specializations.specializations;
  if (Array.isArray(specs) && specs.length > 0) {
    let bestPts = -1;
    let bestName: string | undefined;
    for (const entry of specs) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      let pts = sumTalentPointsFromTalentsArray(e.talents);
      if (pts <= 0 && typeof e.spent_skill_points === 'number') pts = e.spent_skill_points;
      const nested = e.specialization as { name?: string } | undefined;
      const name =
        (typeof nested?.name === 'string' && nested.name.trim()) ||
        (typeof e.specialization_name === 'string' && e.specialization_name.trim()) ||
        undefined;
      if (name && pts > bestPts) {
        bestPts = pts;
        bestName = name;
      }
    }
    if (bestName != null && bestPts > 0) return bestName;
  }

  return (
    specializations.active_specialization?.specialization?.name ?? profile.active_spec?.name ?? undefined
  );
}

function resolveClassAndSpec(profile: BattlenetProfile, specializations: BattlenetSpecializations | null) {
  const classNameFromProfile = profile.character_class?.name;
  const classNameFromSpecs =
    specializations?.specializations?.find((s) => typeof s?.playable_class?.name === 'string')
      ?.playable_class?.name ?? null;
  const className = classNameFromProfile ?? classNameFromSpecs ?? undefined;
  const specName = pickMainSpecNameFromSpecializations(specializations, profile);

  const classId = mapClassNameToId(className);
  if (!classId) {
    throw new Error('Klasse des Charakters konnte nicht zugeordnet werden.');
  }
  const specId =
    mapSpecNameToId(classId, specName) ?? TBC_CLASSES.find((c) => c.id === classId)?.specs[0]?.id;
  if (!specId) {
    throw new Error('Spec des Charakters konnte nicht zugeordnet werden.');
  }
  return { className, specName, classId, specId };
}

type BattlenetApiConfigRow = NonNullable<Awaited<ReturnType<typeof getBattlenetConfigForRegion>>>;

export type FetchClassicCharacterFromBattlenetOptions = {
  /**
   * Bei 404 auf dem direkten Profil-Endpunkt: Gildenroster durchsuchen und Profil über `character.key.href` laden.
   * Anzeigename der WoW-Gilde (wie in RaidFlow hinterlegt), nicht der URL-Slug.
   */
  guildRosterFallbackGuildName?: string | null;
};

function guildRosterMembersFromJson(json: Record<string, unknown>): unknown[] {
  if (Array.isArray(json.members)) return json.members;
  const g = json.guild;
  if (g && typeof g === 'object') {
    const go = g as Record<string, unknown>;
    if (Array.isArray(go.members)) return go.members;
  }
  return [];
}

/**
 * Wenn das Profil über `character.key.href` nicht lesbar ist (403/404 bei Privacy),
 * liefert das Gildenroster oft trotzdem `playable_class`, `level`, `id`, `realm`.
 */
function buildBattlenetProfileFromRosterCharacter(
  c: Record<string, unknown>,
  realmSlugFallback: string,
  characterNameOriginal: string
): BattlenetProfile | null {
  let playableClassName: string | undefined;
  const pc = c.playable_class;
  if (pc && typeof pc === 'object') {
    const nm = (pc as Record<string, unknown>).name;
    if (typeof nm === 'string' && nm.trim()) playableClassName = nm.trim();
  }
  if (!playableClassName) return null;

  const classId = mapClassNameToId(playableClassName);
  if (!classId) return null;

  const cls = TBC_CLASSES.find((x) => x.id === classId);
  const defaultSpecName = cls?.specs[0]?.name;
  if (!defaultSpecName) return null;

  const rawId = c.id;
  const idNum =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? rawId
      : typeof rawId === 'string' && /^\d+$/.test(rawId.trim())
        ? Number(rawId.trim())
        : undefined;

  const name =
    typeof c.name === 'string' && c.name.trim() ? c.name.trim() : characterNameOriginal.trim();
  const level = typeof c.level === 'number' && Number.isFinite(c.level) ? c.level : undefined;

  let realmSlug = realmSlugFallback;
  let realmName: string | undefined;
  const realm = c.realm && typeof c.realm === 'object' ? (c.realm as Record<string, unknown>) : null;
  if (realm) {
    if (typeof realm.slug === 'string' && realm.slug.trim()) realmSlug = realm.slug.trim().toLowerCase();
    if (typeof realm.name === 'string' && realm.name.trim()) realmName = realm.name.trim();
  }

  let raceName: string | undefined;
  const pr = c.playable_race;
  if (pr && typeof pr === 'object') {
    const rn = (pr as Record<string, unknown>).name;
    if (typeof rn === 'string' && rn.trim()) raceName = rn.trim();
  }

  let factionName: string | undefined;
  const fac = c.faction;
  if (fac && typeof fac === 'object') {
    const fo = fac as Record<string, unknown>;
    if (typeof fo.name === 'string' && fo.name.trim()) factionName = fo.name.trim();
    else if (typeof fo.type === 'string' && fo.type.trim()) factionName = fo.type.trim();
  }

  return {
    ...(idNum !== undefined ? { id: idNum } : {}),
    name,
    ...(level !== undefined ? { level } : {}),
    realm: { slug: realmSlug, ...(realmName ? { name: realmName } : {}) },
    character_class: { name: playableClassName },
    ...(raceName ? { race: { name: raceName } } : {}),
    ...(factionName ? { faction: { name: factionName, type: factionName } } : {}),
    active_spec: { name: defaultSpecName },
    _links: {},
  };
}

function mapProfileToClassicFetchResult(
  profile: BattlenetProfile,
  specializations: BattlenetSpecializations | null,
  realm: {
    region: WowRegion;
    namespace: string;
    version: string;
    slug: string;
    name?: string;
  },
  realmSlug: string,
  charName: string,
  characterNameOriginal: string,
  config: BattlenetApiConfigRow,
  profileUrlForPersist: string,
  rawProfileOverride?: Prisma.InputJsonValue
) {
  const resolved = resolveClassAndSpec(profile, specializations);

  return {
    configId: config.id,
    region: realm.region,
    wowVersion: wowVersionToInternal(realm.version),
    realmSlug: profile.realm?.slug ?? realmSlug,
    realmName: profile.realm?.name ?? realm.name ?? realmSlug,
    characterName: profile.name ?? characterNameOriginal.trim(),
    characterNameLower: charName,
    battlenetCharacterId: profile.id ? BigInt(profile.id) : null,
    level: profile.level ?? null,
    raceName: profile.race?.name ?? null,
    className: resolved.className ?? null,
    activeSpecName: resolved.specName ?? null,
    guildName: profile.guild?.name ?? null,
    faction: profile.faction?.name ?? profile.faction?.type ?? null,
    profileUrl: profileUrlForPersist,
    rawProfile:
      rawProfileOverride ??
      ({
        profile,
        specializations,
      } as Prisma.InputJsonValue),
    mainSpec: getSpecDisplayName(resolved.classId, resolved.specId),
  };
}

/**
 * Wenn das Profil unter realm+name 404 liefert, gleicher Char aber in GET …/guild/{realm}/{guild}/roster gelistet:
 * Profil über `character.key.href` laden (liefert u. a. battlenetCharacterId).
 */
async function tryFetchClassicCharacterViaGuildRoster(
  realm: {
    region: WowRegion;
    namespace: string;
    version: string;
    slug: string;
    name?: string;
  },
  characterNameOriginal: string,
  guildDisplayName: string,
  accessToken: string,
  apiBaseUrl: string,
  config: BattlenetApiConfigRow
) {
  const charName = normalizeName(characterNameOriginal);
  const realmSlug = realm.slug.trim().toLowerCase();
  if (!realmSlug || !charName || !guildDisplayName.trim()) {
    return null;
  }

  const { guildSlugCandidates } = await import('@/lib/battlenet-guild');
  const profileNs = dynamicNamespaceToProfileNamespace(realm.namespace);
  const slugCandidates = guildSlugCandidates(guildDisplayName);
  if (slugCandidates.length === 0) return null;

  for (const guildSlug of slugCandidates) {
    let rosterUrl: string | null =
      `${apiBaseUrl}${config.profileGuildPath}/${encodeURIComponent(realmSlug)}/${encodeURIComponent(guildSlug)}/roster?${profileQueryString(profileNs, config.locale)}`;

    while (rosterUrl) {
      const rosterRes = await fetch(rosterUrl, battlenetBearerInit(accessToken));
      if (!rosterRes.ok) {
        break;
      }

      let json: Record<string, unknown>;
      try {
        json = (await rosterRes.json()) as Record<string, unknown>;
      } catch {
        break;
      }

      const memberRows = guildRosterMembersFromJson(json);
      for (const raw of memberRows) {
        if (!raw || typeof raw !== 'object') continue;
        const m = raw as Record<string, unknown>;
        let c: Record<string, unknown> | null = null;
        if (m.character && typeof m.character === 'object') {
          c = m.character as Record<string, unknown>;
        } else if (
          typeof m.playable_class === 'object' ||
          typeof m.name === 'string' ||
          typeof m.id === 'number'
        ) {
          c = m;
        }
        if (!c) continue;

        const n = typeof c.name === 'string' ? c.name : '';
        if (normalizeName(n) !== charName) continue;

        const keyObj = c.key && typeof c.key === 'object' ? (c.key as Record<string, unknown>) : null;
        const href = typeof keyObj?.href === 'string' ? keyObj.href : null;

        if (href) {
          try {
            const profileUrl = new URL(href);
            profileUrl.searchParams.set('locale', config.locale);
            profileUrl.searchParams.delete('access_token');
            const profileRes = await fetch(profileUrl.toString(), battlenetBearerInit(accessToken));
            if (profileRes.ok) {
              const profile = (await profileRes.json()) as BattlenetProfile;
              const specializations = await fetchSpecializations(
                profile?._links?.specializations?.href,
                config.locale,
                accessToken
              );
              const selfHref =
                profile._links?.self?.href && typeof profile._links.self.href === 'string'
                  ? profile._links.self.href.split('?')[0] ?? profileUrl.toString().split('?')[0]
                  : `${profileUrl.origin}${profileUrl.pathname}`;
              try {
                return mapProfileToClassicFetchResult(
                  profile,
                  specializations,
                  realm,
                  realmSlug,
                  charName,
                  characterNameOriginal,
                  config,
                  selfHref
                );
              } catch {
                /* Profil unparsbar oder Klasse/Spec — Roster-Zeile versuchen */
              }
            }
          } catch {
            /* href defekt oder Netzwerk */
          }
        }

        const rosterProfile = buildBattlenetProfileFromRosterCharacter(c, realmSlug, characterNameOriginal);
        if (!rosterProfile) continue;

        const slugForPath = rosterProfile.realm?.slug ?? realmSlug;
        const pathSeg = normalizeName(rosterProfile.name ?? characterNameOriginal);
        const syntheticUrl = `${apiBaseUrl}${config.profileCharacterPath}/${slugForPath}/${pathSeg}`;
        try {
          return mapProfileToClassicFetchResult(
            rosterProfile,
            null,
            realm,
            realmSlug,
            charName,
            characterNameOriginal,
            config,
            syntheticUrl,
            {
              source: 'guild_roster_fallback',
              rosterCharacter: c,
              profile: rosterProfile,
              specializations: null,
              profileHrefAttempt:
                href && href.length > 0
                  ? { note: 'character.key.href present; full profile may be private (403/404).' }
                  : { note: 'No character.key.href; using roster fields only.' },
            } as Prisma.InputJsonValue
          );
        } catch {
          /* nächster Eintrag */
        }
      }

      const links = json._links && typeof json._links === 'object' ? (json._links as Record<string, unknown>) : null;
      const rawNext = links?.next;
      const nextHref =
        typeof rawNext === 'string'
          ? rawNext
          : rawNext && typeof rawNext === 'object'
            ? (rawNext as Record<string, unknown>).href
            : undefined;
      rosterUrl = typeof nextHref === 'string' ? nextHref : null;
    }
  }

  return null;
}

export async function fetchClassicCharacterFromBattlenetWithFilters(
  server: string,
  characterName: string,
  region: WowRegion,
  wowPreset: WowPreset | null
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

  const accessToken = await getBattlenetAccessToken(config);

  const preset: WowPreset = wowPreset ?? 'classic';
  const candidates = profileNamespacesForPreset(region, preset);
  const apiBaseUrl = region === config.region ? config.apiBaseUrl : `https://${region}.api.blizzard.com`;
  const profilePath = `${config.profileCharacterPath}/${realmSlug}/${charName}`;

  let lastErr: string | null = null;
  for (const candidate of candidates) {
    const qs = profileQueryString(candidate.namespace, config.locale);

    const profileRes = await fetch(`${apiBaseUrl}${profilePath}?${qs}`, battlenetBearerInit(accessToken));
    if (profileRes.status === 404) {
      lastErr = `Not found (${candidate.namespace})`;
      continue;
    }
    if (!profileRes.ok) {
      lastErr = `HTTP ${profileRes.status} (${candidate.namespace})`;
      continue;
    }

    const profile = (await profileRes.json()) as BattlenetProfile;
    const specializations = await fetchSpecializations(
      profile?._links?.specializations?.href,
      config.locale,
      accessToken
    );
    const resolved = resolveClassAndSpec(profile, specializations);

    return {
      configId: config.id,
      region,
      wowVersion: candidate.internalWowVersion,
      realmSlug: profile.realm?.slug ?? realmSlug,
      realmName: profile.realm?.name ?? server.trim(),
      characterName: profile.name ?? characterName.trim(),
      characterNameLower: charName,
      battlenetCharacterId: profile.id ? BigInt(profile.id) : null,
      level: profile.level ?? null,
      raceName: profile.race?.name ?? null,
      className: resolved.className ?? null,
      activeSpecName: resolved.specName ?? null,
      guildName: profile.guild?.name ?? null,
      faction: profile.faction?.name ?? profile.faction?.type ?? null,
      profileUrl: `${apiBaseUrl}${profilePath}`,
      rawProfile: profile,
      mainSpec: getSpecDisplayName(resolved.classId, resolved.specId),
    };
  }

  throw new Error(`Battle.net Charakterabfrage fehlgeschlagen. ${lastErr ?? ''}`.trim());
}

export async function fetchClassicCharacterFromBattlenetByRealm(
  realm: {
    region: WowRegion;
    namespace: string;
    version: string;
    slug: string;
    name?: string;
  },
  characterName: string,
  opts?: FetchClassicCharacterFromBattlenetOptions
) {
  const config = await getBattlenetConfigForRegion(realm.region);
  if (!config) {
    throw new Error('Keine aktive Battle.net API Konfiguration gefunden.');
  }

  const charName = normalizeName(characterName);
  const realmSlug = realm.slug.trim().toLowerCase();
  if (!realmSlug || !charName) {
    throw new Error('Server und Charaktername sind erforderlich.');
  }

  /** Use regional OAuth endpoint (sync script / Blizzard test tool); global oauth.battle.net can yield 404 for profile API. */
  const tokenConfig = {
    ...config,
    oauthTokenUrl: `https://${realm.region}.battle.net/oauth/token`,
  };
  const accessToken = await getBattlenetAccessToken(tokenConfig);
  const apiBaseUrl = realm.region === config.region ? config.apiBaseUrl : `https://${realm.region}.api.blizzard.com`;
  const profilePath = `${config.profileCharacterPath}/${realmSlug}/${charName}`;
  /** DB stores `dynamic-*` for realm search; profile character endpoint needs `profile-*` (Blizzard `_links.self`). */
  const profileNamespace = dynamicNamespaceToProfileNamespace(realm.namespace);
  const profileQs = profileQueryString(profileNamespace, config.locale);
  const requestUrlFetch = `${apiBaseUrl}${profilePath}?${profileQs}`;
  const requestUrlLog = battleNetCharacterRequestUrlForLog(
    apiBaseUrl,
    profilePath,
    profileNamespace,
    config.locale
  );

  const profileRes = await fetch(requestUrlFetch, battlenetBearerInit(accessToken));
  if (profileRes.status === 404) {
    const fb = opts?.guildRosterFallbackGuildName?.trim();
    if (fb) {
      try {
        const via = await tryFetchClassicCharacterViaGuildRoster(
          realm,
          characterName,
          fb,
          accessToken,
          apiBaseUrl,
          config
        );
        if (via) return via;
      } catch {
        /* Fallback fehlgeschlagen → unten 404 */
      }
    }
    throw new BattlenetCharacterRequestError('Charakter auf dem angegebenen Server nicht gefunden.', {
      requestUrl: requestUrlLog,
      httpStatus: 404,
    });
  }
  if (!profileRes.ok) {
    throw new BattlenetCharacterRequestError(
      `Battle.net Charakterabfrage fehlgeschlagen (HTTP ${profileRes.status}).`,
      { requestUrl: requestUrlLog, httpStatus: profileRes.status }
    );
  }

  try {
    const profile = (await profileRes.json()) as BattlenetProfile;
    const specializations = await fetchSpecializations(
      profile?._links?.specializations?.href,
      config.locale,
      accessToken
    );

    return mapProfileToClassicFetchResult(
      profile,
      specializations,
      realm,
      realmSlug,
      charName,
      characterName,
      config,
      `${apiBaseUrl}${profilePath}`
    );
  } catch (e) {
    if (e instanceof BattlenetCharacterRequestError) throw e;
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler nach Battle.net Antwort.';
    throw new BattlenetCharacterRequestError(msg, {
      requestUrl: requestUrlLog,
      httpStatus: profileRes.status,
    });
  }
}
