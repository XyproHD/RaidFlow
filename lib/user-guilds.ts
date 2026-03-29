/**
 * User-Gilden-Zuordnung: Gilden aus der DB (Spiegelung der Discord-Rollen).
 *
 * **Aktualisierung:** Primär der Discord-Bot (`POST /api/bot/sync-member`). Zusätzlich: Wenn
 * `DISCORD_BOT_TOKEN` in der **Webapp** gesetzt ist, wird pro Gilde vor dem Anzeigen ein Abgleich
 * per Discord REST ausgeführt (`getMemberRoleIds` → `syncMemberPermissionsFromDiscordState`).
 * Ohne Token in der Webapp kann keine Mitgliedschaft/Rolle ermittelt werden — dann bleibt nur der
 * Bot-Event-Pfad (benötigt Server-Members-Intent + `DISCORD_GUILD_MEMBERS_INTENT`).
 */

import { prisma } from '@/lib/prisma';
import { getAppConfig, filterGuildIdsByConfig } from '@/lib/app-config';
import { getMemberRoleIds } from './discord-roles';
import {
  guildRowToPermissionSyncShape,
  syncMemberPermissionsFromDiscordState,
} from './member-permission-sync';

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
 * Lädt RaidFlow-Gilden des Users. Mit `DISCORD_BOT_TOKEN` wird die DB pro Gilde zuvor mit Discord abgeglichen.
 */
export async function getGuildsForUser(
  userId: string,
  discordId: string
): Promise<UserGuildInfo[]> {
  const [config, allGuilds] = await Promise.all([
    getAppConfig(),
    prisma.rfGuild.findMany({
      include: {
        raidGroups: { select: { id: true, discordRoleId: true } },
        battlenetRealm: { select: { slug: true, region: true, version: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ]);
  const allowedDiscordIds = new Set(
    filterGuildIdsByConfig(
      allGuilds.map((g) => g.discordGuildId),
      config
    )
  );
  const guilds = allGuilds.filter((g) => allowedDiscordIds.has(g.discordGuildId));

  const result: UserGuildInfo[] = [];

  const hasWebappBotToken = Boolean(process.env.DISCORD_BOT_TOKEN?.trim());

  for (const guild of guilds) {
    try {
      if (hasWebappBotToken) {
        let roleIds: string[] = [];
        let inGuild = false;
        let displayNameInGuild: string | null = null;
        let membershipKnown = false;
        try {
          const memberRoles = await getMemberRoleIds(guild.discordGuildId, discordId);
          roleIds = memberRoles.roleIds;
          inGuild = memberRoles.inGuild;
          displayNameInGuild = memberRoles.displayNameInGuild;
          membershipKnown = memberRoles.membershipKnown;
        } catch (discordError) {
          console.error(
            '[getGuildsForUser] Discord API failed for guild:',
            guild.id,
            guild.name,
            discordError
          );
        }
        await syncMemberPermissionsFromDiscordState({
          userId,
          guild: guildRowToPermissionSyncShape(guild),
          membershipKnown,
          inGuild,
          roleIds,
          displayNameInGuild,
        });
      }

      {
        const [gmOrphan, ugOrphan] = await Promise.all([
          prisma.rfGuildMember.findUnique({
            where: { userId_guildId: { userId, guildId: guild.id } },
            select: { id: true },
          }),
          prisma.rfUserGuild.findUnique({
            where: { userId_guildId: { userId, guildId: guild.id } },
            select: { role: true },
          }),
        ]);
        if (gmOrphan && !ugOrphan) {
          if (hasWebappBotToken) {
            const again = await getMemberRoleIds(guild.discordGuildId, discordId);
            await syncMemberPermissionsFromDiscordState({
              userId,
              guild: guildRowToPermissionSyncShape(guild),
              membershipKnown: again.membershipKnown,
              inGuild: again.inGuild,
              roleIds: again.roleIds,
              displayNameInGuild: again.displayNameInGuild,
            });
            if (!again.membershipKnown) {
              console.warn(
                JSON.stringify({
                  scope: 'getGuildsForUser',
                  step: 'orphan_discord_unknown',
                  guildId: guild.id,
                  guildName: guild.name,
                  hint: 'Discord GET member failed or no token; rf_user_guild cannot be repaired on this request.',
                })
              );
            }
          } else {
            console.warn(
              JSON.stringify({
                scope: 'getGuildsForUser',
                step: 'orphan_no_webapp_token',
                guildId: guild.id,
                guildName: guild.name,
                hint: 'DISCORD_BOT_TOKEN fehlt auf dieser Webapp — Dashboard kann rf_user_guild nicht setzen. Token auf Vercel setzen (gleicher Bot wie auf dem Server).',
              })
            );
          }
        }
      }

      const ug = await prisma.rfUserGuild.findUnique({
        where: { userId_guildId: { userId, guildId: guild.id } },
        select: { role: true },
      });

      if (!ug) continue;

      const member = await prisma.rfGuildMember.findUnique({
        where: { userId_guildId: { userId, guildId: guild.id } },
        include: {
          memberRaidGroups: { select: { raidGroupId: true } },
        },
      });
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
    } catch (e) {
      console.error('[getGuildsForUser] guild:', guild.id, guild.name, e);
    }
  }

  return result;
}

/**
 * Raids aus den Gilden des Users, auf die er Zugriff hat (RaidFlow-Raider bzw. Raidgruppe bei Einschränkung).
 * Gilden mit role 'member' (kein Raider-Recht) werden ausgeschlossen.
 */
export async function getRaidsForUser(
  userGuilds: UserGuildInfo[]
): Promise<UserRaidInfo[]> {
  const guildsWithAccess = userGuilds.filter((g) => g.role !== 'member');
  const guildIds = guildsWithAccess.map((g) => g.id);
  const guildMap = new Map(guildsWithAccess.map((g) => [g.id, g]));

  const raids = await prisma.rfRaid.findMany({
    where: { guildId: { in: guildIds } },
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
