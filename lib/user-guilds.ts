/**
 * User-Gilden-Zuordnung: Lesen aus der DB (`rf_user_guild` / `rf_guild_member`).
 *
 * **Aktualisierung (Discord → DB):** Bot-Events (`POST /api/bot/sync-member`) und verwandte
 * Bot-Pfade — nicht mehr pro Seitenaufruf über die Web-App.
 */

import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { getAppConfig, isGuildAllowed } from '@/lib/app-config';

/** RaidFlow-Rolle oder nur Discord-Mitglied ohne RaidFlow-Rolle. */
export type UserGuildRole = 'guildmaster' | 'raidleader' | 'raider' | 'member';

export interface UserGuildInfo {
  id: string;
  name: string;
  discordGuildId: string;
  role: UserGuildRole;
  /** Raidgruppen, in denen der User ist (aus Discord-Sync oder UI-Zuordnung). */
  raidGroupIds: string[];
  /** WoW-Realm-Zeile der Gilde (Charakter-Modal: Server-Vorbelegung für Battle.net). */
  battlenetRealmId: string | null;
  /** Optional: Battle.net-Gilden-ID (aus Suche/Auto-Resolve im Gildenmenü). */
  battlenetGuildId?: string | null;
  /** Optional: falls in der Gildenverwaltung gesetzt (Profile-API Realm Slug). */
  battlenetProfileRealmSlug?: string | null;
  /** Optional: Anzeigename der verknüpften WoW-Gilde (Battle.net). */
  battlenetGuildName?: string | null;
  /** Optional: Realm-Infos (aus rf_battlenet_realm, sofern battlenetRealmId gesetzt). */
  battlenetRealm?: { slug: string; region: string; version: string } | null;
}

export interface UserRaidInfo {
  id: string;
  guildId: string;
  guildName: string;
  name: string;
  dungeonName: string;
  scheduledAt: Date;
  signupUntil: Date;
  status: string;
  maxPlayers: number;
  signupCount: number;
  canEdit: boolean; // Raidleader/Gildenmeister
}

export interface RaidQueryWindow {
  from?: Date;
  to?: Date;
}

/** Gleiche Sichtbarkeit wie in getRaidsForUser: Raider-Rolle, ggf. Raidgruppe oder Leitung. */
export function userGuildCanSeeRaid(
  guildInfo: UserGuildInfo,
  raid: { guildId: string; raidGroupRestrictionId: string | null }
): boolean {
  if (guildInfo.id !== raid.guildId) return false;
  if (guildInfo.role === 'member') return false;
  if (raid.raidGroupRestrictionId) {
    const inGroup = guildInfo.raidGroupIds.includes(raid.raidGroupRestrictionId);
    const canManage = guildInfo.role === 'guildmaster' || guildInfo.role === 'raidleader';
    return inGroup || canManage;
  }
  return true;
}

export function userGuildCanEditRaids(guildInfo: UserGuildInfo): boolean {
  return guildInfo.role === 'raidleader' || guildInfo.role === 'guildmaster';
}

/**
 * Gilden des Users **nur aus der Datenbank** (kein Discord-Roundtrip).
 * Filtert nach App-Config (Whitelist/Blacklist). Sortiert nach Gildenname.
 */
export async function getGuildsForUserFromDb(userId: string): Promise<UserGuildInfo[]> {
  const [config, userGuildRows] = await Promise.all([
    getAppConfig(),
    prisma.rfUserGuild.findMany({
      where: { userId },
      include: {
        guild: {
          include: {
            raidGroups: { select: { id: true, discordRoleId: true } },
            battlenetRealm: { select: { slug: true, region: true, version: true } },
          },
        },
      },
    }),
  ]);

  const allowedRows = userGuildRows.filter((ug) =>
    isGuildAllowed(ug.guild.discordGuildId, config)
  );
  allowedRows.sort((a, b) => a.guild.name.localeCompare(b.guild.name, undefined, { sensitivity: 'base' }));

  const guildIds = allowedRows.map((r) => r.guildId);
  if (guildIds.length === 0) return [];

  const members = await prisma.rfGuildMember.findMany({
    where: { userId, guildId: { in: guildIds } },
    include: {
      memberRaidGroups: { select: { raidGroupId: true } },
    },
  });
  const memberByGuildId = new Map(members.map((m) => [m.guildId, m]));

  const result: UserGuildInfo[] = [];
  for (const ug of allowedRows) {
    const guild = ug.guild;
    const member = memberByGuildId.get(guild.id);
    const raidGroupIds = member?.memberRaidGroups.map((rg) => rg.raidGroupId) ?? [];

    result.push({
      id: guild.id,
      name: guild.name,
      discordGuildId: guild.discordGuildId,
      role: ug.role as UserGuildRole,
      raidGroupIds,
      battlenetRealmId: guild.battlenetRealmId,
      battlenetGuildId: guild.battlenetGuildId?.toString() ?? null,
      battlenetProfileRealmSlug: guild.battlenetProfileRealmSlug,
      battlenetGuildName: guild.battlenetGuildName,
      battlenetRealm: guild.battlenetRealm
        ? {
            slug: guild.battlenetRealm.slug,
            region: guild.battlenetRealm.region,
            version: guild.battlenetRealm.version,
          }
        : null,
    });
  }

  return result;
}

/**
 * Lädt RaidFlow-Gilden des Users aus der DB.
 *
 * `discordId` wird aus Kompatibilität zu älteren Aufrufern akzeptiert, ist aber entbehrlich.
 */
export async function getGuildsForUser(
  userId: string,
  _discordId?: string | null
): Promise<UserGuildInfo[]> {
  return getGuildsForUserFromDb(userId);
}

/**
 * Request-lokale Deduplizierung (Next/React cache): mehrere Server-Komponenten im selben Request.
 */
export const getGuildsForUserCached = cache(getGuildsForUser);

/**
 * Raids aus den Gilden des Users, auf die er Zugriff hat (RaidFlow-Raider bzw. Raidgruppe bei Einschränkung).
 * Gilden mit role 'member' (kein Raider-Recht) werden ausgeschlossen.
 */
export async function getRaidsForUser(
  userGuilds: UserGuildInfo[],
  window: RaidQueryWindow = {}
): Promise<UserRaidInfo[]> {
  const guildsWithAccess = userGuilds.filter((g) => g.role !== 'member');
  const guildIds = guildsWithAccess.map((g) => g.id);
  const guildMap = new Map(guildsWithAccess.map((g) => [g.id, g]));
  const { from, to } = window;
  const scheduledAtFilter =
    from || to
      ? {
          scheduledAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {};

  const raids = await prisma.rfRaid.findMany({
    where: { guildId: { in: guildIds }, ...scheduledAtFilter },
    include: {
      guild: { select: { name: true } },
      dungeon: { select: { name: true } },
      _count: { select: { signups: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  const result: UserRaidInfo[] = [];
  for (const raid of raids) {
    const guildInfo = guildMap.get(raid.guildId);
    if (!guildInfo) continue;
    if (!userGuildCanSeeRaid(guildInfo, raid)) continue;
    result.push({
      id: raid.id,
      guildId: raid.guildId,
      guildName: raid.guild.name,
      name: raid.name,
      dungeonName: raid.dungeon.name,
      scheduledAt: raid.scheduledAt,
      signupUntil: raid.signupUntil,
      status: raid.status,
      maxPlayers: raid.maxPlayers,
      signupCount: raid._count.signups,
      canEdit: userGuildCanEditRaids(guildInfo),
    });
  }
  return result;
}
