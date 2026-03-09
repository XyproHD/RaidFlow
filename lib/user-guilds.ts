/**
 * User-Gilden-Zuordnung: Gilden laden, in denen der User Mitglied ist (RaidFlow-Rollen),
 * und UserGuild/GuildMember synchron halten (Sync mit Discord/Bot).
 */

import { prisma } from '@/lib/prisma';
import { getMemberRoleIds, resolveRaidFlowRole, type RaidFlowRole } from './discord-roles';

export interface UserGuildInfo {
  id: string;
  name: string;
  discordGuildId: string;
  role: RaidFlowRole;
  raidGroupId: string | null;
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

/**
 * Lädt alle RfGuild mit RaidGroups, prüft pro Gilde die Discord-Rollen des Users,
 * synchronisiert RfUserGuild und RfGuildMember und gibt nur Gilden zurück,
 * in denen der User mindestens eine RaidFlow-Rolle (Gildenmeister, Raidleader, Raider) hat.
 */
export async function getGuildsForUser(
  userId: string,
  discordId: string
): Promise<UserGuildInfo[]> {
  const guilds = await prisma.rfGuild.findMany({
    include: {
      raidGroups: { select: { id: true, discordRoleId: true } },
    },
    orderBy: { name: 'asc' },
  });

  const result: UserGuildInfo[] = [];

  for (const guild of guilds) {
    try {
      const roleIds = await getMemberRoleIds(guild.discordGuildId, discordId);
      const resolved = resolveRaidFlowRole(
        {
          id: guild.id,
          discordGuildId: guild.discordGuildId,
          name: guild.name,
          discordRoleGuildmasterId: guild.discordRoleGuildmasterId,
          discordRoleRaidleaderId: guild.discordRoleRaidleaderId,
          discordRoleRaiderId: guild.discordRoleRaiderId,
          raidGroups: guild.raidGroups,
        },
        roleIds
      );

      if (!resolved) continue;

      await prisma.$transaction([
        prisma.rfUserGuild.upsert({
          where: {
            userId_guildId: { userId, guildId: guild.id },
          },
          create: {
            userId,
            guildId: guild.id,
            role: resolved.role,
          },
          update: { role: resolved.role },
        }),
        prisma.rfGuildMember.upsert({
          where: {
            userId_guildId: { userId, guildId: guild.id },
          },
          create: {
            userId,
            guildId: guild.id,
            raidGroupId: resolved.raidGroupId,
          },
          update: { raidGroupId: resolved.raidGroupId },
        }),
      ]);

      result.push({
        id: guild.id,
        name: guild.name,
        discordGuildId: guild.discordGuildId,
        role: resolved.role,
        raidGroupId: resolved.raidGroupId,
      });
    } catch (e) {
      console.error('[getGuildsForUser] guild:', guild.id, guild.name, e);
    }
  }

  return result;
}

/**
 * Raids aus den Gilden des Users, auf die er Zugriff hat (RaidFlow-Raider bzw. Raidgruppe bei Einschränkung).
 */
export async function getRaidsForUser(
  userGuilds: UserGuildInfo[]
): Promise<UserRaidInfo[]> {
  const guildIds = userGuilds.map((g) => g.id);
  const guildMap = new Map(userGuilds.map((g) => [g.id, g]));

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
    // Einschränkung: nur Raids, für die der User Raider-Recht hat (bei Raidgruppe: User muss in Gruppe sein oder Raidleader/Gildenmeister)
    if (raid.raidGroupRestrictionId) {
      const inGroup =
        guildInfo.raidGroupId === raid.raidGroupRestrictionId;
      const canManage =
        guildInfo.role === 'guildmaster' || guildInfo.role === 'raidleader';
      if (!inGroup && !canManage) continue;
    }
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
      canEdit: guildInfo.role === 'raidleader' || guildInfo.role === 'guildmaster',
    });
  }
  return result;
}
