import {
  getBattlenetConfigForRegion,
  getBattlenetAccessToken,
  battlenetBearerInit,
  profileQueryString,
} from '@/lib/battlenet';
import type { WowRegion } from '@/lib/wow-classic-realms';

export type WowGuildSearchHit = {
  id: bigint;
  name: string;
  realmSlug: string;
};

/** Blizzard: Gildenname in der URL — kleingeschrieben, Leerzeichen als Bindestrich. */
export function slugifyGuildNameForApi(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function idToBigInt(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return BigInt(v.trim());
  return null;
}

function parseGuildPayload(data: Record<string, unknown>): WowGuildSearchHit | null {
  const id = idToBigInt(data.id);
  const name = typeof data.name === 'string' ? data.name : null;
  const realm = data.realm && typeof data.realm === 'object' ? (data.realm as Record<string, unknown>) : null;
  const realmSlug = typeof realm?.slug === 'string' ? realm.slug : '';
  if (id == null || name == null) return null;
  return { id, name, realmSlug };
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
 */
export async function fetchWowGuildProfileBySlug(
  realm: { region: WowRegion; slug: string; namespace: string },
  guildNameSlug: string
): Promise<WowGuildSearchHit | null> {
  const slug = guildNameSlug.trim();
  if (!slug) return null;

  const { config, accessToken, apiBaseUrl } = await getGameDataClient(realm.region);
  const path = `${config.profileGuildPath}/${encodeURIComponent(realm.slug)}/${encodeURIComponent(slug)}`;
  const qs = profileQueryString(realm.namespace, config.locale);
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

/**
 * Suchindex /data/wow/search/guild — Filter realm.slug + name (exakter Index, je nach Region).
 */
export async function searchWowGuildsOnRealm(
  realm: { region: WowRegion; slug: string; namespace: string },
  nameQuery: string
): Promise<WowGuildSearchHit[]> {
  const q = nameQuery.trim();
  if (!q) return [];

  const { config, accessToken, apiBaseUrl } = await getGameDataClient(realm.region);
  const baseParams = () => {
    const params = new URLSearchParams({
      namespace: realm.namespace,
      locale: config.locale,
      'realm.slug': realm.slug,
      name: q,
    });
    params.set('_page', '1');
    return params;
  };
  let params = baseParams();
  params.set('orderby', 'id');
  let url = `${apiBaseUrl}${config.searchGuildPath}?${params.toString()}`;
  let res = await fetch(url, battlenetBearerInit(accessToken));
  if (!res.ok && res.status === 400) {
    params = baseParams();
    url = `${apiBaseUrl}${config.searchGuildPath}?${params.toString()}`;
    res = await fetch(url, battlenetBearerInit(accessToken));
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Battle.net Gildensuche fehlgeschlagen (HTTP ${res.status}).${body ? ` ${body.slice(0, 200)}` : ''}`
    );
  }
  const json = (await res.json()) as { results?: unknown[]; result?: unknown[] };
  const rows = json.results ?? json.result ?? [];
  const out: WowGuildSearchHit[] = [];
  for (const row of rows) {
    const hit = parseGuildSearchRow(row);
    if (hit) out.push(hit);
  }
  return out;
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
  const rawName = discordOrIngameGuildName.trim();
  if (!rawName) return { status: 'not_found' };

  const slug = slugifyGuildNameForApi(rawName);
  if (slug) {
    try {
      const direct = await fetchWowGuildProfileBySlug(realm, slug);
      if (direct) return { status: 'ok', guild: direct };
    } catch {
      // Suche als Fallback
    }
  }

  const fromSearch = await searchWowGuildsOnRealm(realm, rawName);
  if (fromSearch.length === 1) return { status: 'ok', guild: fromSearch[0]! };
  if (fromSearch.length > 1) return { status: 'ambiguous', guilds: fromSearch };
  return { status: 'not_found' };
}
