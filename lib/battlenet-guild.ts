import {
  getBattlenetConfigForRegion,
  getBattlenetAccessToken,
  battlenetBearerInit,
  profileQueryString,
} from '@/lib/battlenet';
import { dynamicNamespaceToProfileNamespace } from '@/lib/wow-realm-name';
import type { WowRegion } from '@/lib/wow-classic-realms';

export type WowGuildSearchHit = {
  id: bigint;
  name: string;
  realmSlug: string;
  /** Blizzard `realm.id` aus dem Gilden-Profil (z. B. 6409), falls vorhanden */
  realmNumericId?: bigint | null;
};

/** Blizzard: Gildenname in der URL — kleingeschrieben, Leerzeichen als Bindestrich. */
export function slugifyGuildNameForApi(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Mögliche URL-Slugs für /data/wow/guild/{realm}/{slug}.
 * Im Spiel z. B. "A V I D" → oft "a-v-i-d" (Leerzeichen → -) oder kompakt "avid" (ohne Leerzeichen).
 */
export function guildSlugCandidates(displayName: string): string[] {
  const raw = displayName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const seen = new Set<string>();

  const add = (s: string) => {
    const v = slugifyGuildNameForApi(s);
    if (v) seen.add(v);
  };

  add(raw);
  const compact = lower.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  if (compact) seen.add(compact);

  return Array.from(seen);
}

/**
 * Nutzereingabe für Gildensuche: Unicode, NBSP, überzählige Leerzeichen.
 * (Battle.net / URL-Slugs sind weiterhin case-insensitive; Suchindex braucht oft exakte Schreibweise.)
 */
export function normalizeUserGuildSearchInput(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Suchbegriffe für den Suchindex (nicht 1:1 mit URL-Slug). */
function guildSearchNameCandidates(displayName: string): string[] {
  const raw = normalizeUserGuildSearchInput(displayName).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) seen.add(t);
  };
  add(raw);
  add(lower);
  add(lower.replace(/\s+/g, ''));
  add(lower.replace(/\s+/g, ' ').trim());
  const hyphenAsSpace = lower.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  add(hyphenAsSpace);
  add(hyphenAsSpace.replace(/\s/g, ''));
  add(lower.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
  return Array.from(seen);
}

function idToBigInt(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return BigInt(v.trim());
  return null;
}

function extractGuildNameFromPayload(data: Record<string, unknown>): string | null {
  const n = data.name;
  if (typeof n === 'string' && n.trim()) return n.trim();
  if (n && typeof n === 'object' && !Array.isArray(n)) {
    const o = n as Record<string, unknown>;
    if (typeof o.exact === 'string' && o.exact.trim()) return o.exact.trim();
    if (typeof o.string === 'string' && o.string.trim()) return o.string.trim();
    for (const loc of ['de_DE', 'en_US', 'en_GB', 'fr_FR', 'es_ES']) {
      const v = o[loc];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

function parseGuildPayload(data: Record<string, unknown>): WowGuildSearchHit | null {
  const id = idToBigInt(data.id);
  const name = extractGuildNameFromPayload(data);
  const realm = data.realm && typeof data.realm === 'object' ? (data.realm as Record<string, unknown>) : null;
  const realmSlug = typeof realm?.slug === 'string' ? realm.slug : '';
  const realmNumericId = idToBigInt(realm?.id);
  if (id == null || name == null) return null;
  return { id, name, realmSlug, realmNumericId: realmNumericId ?? null };
}

function parseGuildSearchRow(raw: unknown): WowGuildSearchHit | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const inner = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : o;
  return parseGuildPayload(inner);
}

async function getGameDataClient(region: WowRegion) {
  const config = await getBattlenetConfigForRegion(region);
  if (!config) {
    throw new Error('Keine aktive Battle.net API Konfiguration gefunden.');
  }
  const tokenConfig = {
    ...config,
    oauthTokenUrl: `https://${region}.battle.net/oauth/token`,
  };
  const accessToken = await getBattlenetAccessToken(tokenConfig);
  const apiBaseUrl =
    region === config.region ? config.apiBaseUrl : `https://${region}.api.blizzard.com`;
  return { config, accessToken, apiBaseUrl };
}

/**
 * GET /data/wow/guild/{realmSlug}/{guildSlug} — liefert die Battle.net-Gilden-ID.
 * Wichtig: Query-Parameter `namespace` muss **profile-*** sein (z. B. profile-classicann-eu),
 * nicht dynamic-* wie in rf_battlenet_realm — siehe _links.self im Blizzard-Response.
 */
export async function fetchWowGuildProfileBySlug(
  realm: { region: WowRegion; slug: string; namespace: string },
  guildNameSlug: string
): Promise<WowGuildSearchHit | null> {
  const slug = guildNameSlug.trim();
  if (!slug) return null;

  const { config, accessToken, apiBaseUrl } = await getGameDataClient(realm.region);
  const path = `${config.profileGuildPath}/${encodeURIComponent(realm.slug)}/${encodeURIComponent(slug)}`;
  const profileNs = dynamicNamespaceToProfileNamespace(realm.namespace);
  const qs = profileQueryString(profileNs, config.locale);
  const url = `${apiBaseUrl}${path}?${qs}`;
  const res = await fetch(url, battlenetBearerInit(accessToken));
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Battle.net Gildenabfrage fehlgeschlagen (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const hit = parseGuildPayload(json);
  return hit;
}

function parseSearchGuildResponseBody(text: string): { results?: unknown[]; result?: unknown[] } {
  const t = text.trim();
  if (!t) return {};
  try {
    return JSON.parse(t) as { results?: unknown[]; result?: unknown[] };
  } catch {
    throw new Error(
      `Battle.net Gildensuche: Antwort ist kein JSON (Vorschau: ${text.slice(0, 120)}).`
    );
  }
}

function hitsFromSearchJson(json: { results?: unknown[]; result?: unknown[] }): WowGuildSearchHit[] {
  const rows = json.results ?? json.result ?? [];
  const out: WowGuildSearchHit[] = [];
  for (const row of rows) {
    const hit = parseGuildSearchRow(row);
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * Suchindex /data/wow/search/guild — Filter realm.slug + name.
 * OAuth: Server holt per Client Credentials ein access_token; Blizzard wird mit Authorization: Bearer aufgerufen.
 */
export async function searchWowGuildsOnRealm(
  realm: { region: WowRegion; slug: string; namespace: string },
  nameQuery: string
): Promise<WowGuildSearchHit[]> {
  const q = normalizeUserGuildSearchInput(nameQuery);
  if (!q) return [];

  const { config, accessToken, apiBaseUrl } = await getGameDataClient(realm.region);

  const baseParams = (nameKey: string, nameVal: string) => {
    const params = new URLSearchParams({
      namespace: realm.namespace,
      locale: config.locale,
      'realm.slug': realm.slug,
    });
    params.set(nameKey, nameVal);
    params.set('_page', '1');
    return params;
  };

  /** Blizzard akzeptiert je nach Endpoint `orderby` oder `order_by`; manche Builds brauchen kein Sortierfeld. */
  const orderVariants = [
    (p: URLSearchParams) => {
      p.set('orderby', 'id');
    },
    (p: URLSearchParams) => {
      p.set('order_by', 'id');
    },
    (_p: URLSearchParams) => {
      /* no order */
    },
  ];

  /** Zuerst direkter Profil-Endpunkt: mehrere Slug-Varianten (Anzeige ≠ URL). */
  for (const slug of guildSlugCandidates(q)) {
    try {
      const direct = await fetchWowGuildProfileBySlug(realm, slug);
      if (direct) return [direct];
    } catch {
      /* nächste Slug-Variante */
    }
  }

  const searchNames = guildSearchNameCandidates(q);
  const nameKeys = ['name', `name.${config.locale}`] as const;

  let lastErr = '';
  for (const nameVal of searchNames) {
    for (const nameKey of nameKeys) {
      for (const addOrder of orderVariants) {
        const params = baseParams(nameKey, nameVal);
        addOrder(params);
        const url = `${apiBaseUrl}${config.searchGuildPath}?${params.toString()}`;
        const res = await fetch(url, battlenetBearerInit(accessToken));
        const text = await res.text();
        if (res.ok) {
          const json = parseSearchGuildResponseBody(text);
          const hits = hitsFromSearchJson(json);
          if (hits.length > 0) return hits;
          continue;
        }
        if (res.status === 400 || res.status === 404) {
          lastErr = text.slice(0, 300);
          continue;
        }
        throw new Error(
          `Battle.net Gildensuche fehlgeschlagen (HTTP ${res.status}).${text ? ` ${text.slice(0, 200)}` : ''}`
        );
      }
    }
  }

  if (lastErr) {
    throw new Error(
      `Battle.net Gildensuche: keine gültige Parameterkombination. Letzte Blizzard-Antwort: ${lastErr}`
    );
  }
  return [];
}

/**
 * Automatische Auflösung: zuerst direkter Profil-Endpunkt mit Slug aus dem Namen, dann Suche mit exaktem Namen.
 */
export async function autoResolveWowGuild(
  realm: { region: WowRegion; slug: string; namespace: string },
  discordOrIngameGuildName: string
): Promise<{
  status: 'ok';
  guild: WowGuildSearchHit;
} | {
  status: 'ambiguous';
  guilds: WowGuildSearchHit[];
} | {
  status: 'not_found';
}> {
  const rawName = normalizeUserGuildSearchInput(discordOrIngameGuildName);
  if (!rawName) return { status: 'not_found' };

  for (const slug of guildSlugCandidates(rawName)) {
    try {
      const direct = await fetchWowGuildProfileBySlug(realm, slug);
      if (direct) return { status: 'ok', guild: direct };
    } catch {
      /* nächste Slug-Variante */
    }
  }

  let fromSearch: WowGuildSearchHit[] = [];
  try {
    fromSearch = await searchWowGuildsOnRealm(realm, rawName);
  } catch {
    /** Suchindex optional; direkter Slug-Versuch war oben schon gelaufen */
    fromSearch = [];
  }
  if (fromSearch.length === 1) return { status: 'ok', guild: fromSearch[0]! };
  if (fromSearch.length > 1) return { status: 'ambiguous', guilds: fromSearch };
  return { status: 'not_found' };
}
