/**
 * User-Gilden-Zuordnung: Gilden laden, in denen der User Mitglied ist (RaidFlow-Rollen),
 * und UserGuild/GuildMember synchron halten (Sync mit Discord/Bot).
 */

import { prisma } from '@/lib/prisma';
import { getAppConfig, filterGuildIdsByConfig } from '@/lib/app-config';
import { getMemberRoleIds, resolveRaidFlowRole, type RaidFlowRole } from './discord-roles';

/** RaidFlow-Rolle oder nur Discord-Mitglied ohne RaidFlow-Rolle. */
export type UserGuildRole = RaidFlowRole | 'member';

export interface UserGuildInfo {
  id: string;
  name: string;
  discordGuildId: string;
  role: UserGuildRole;
  /** Raidgruppen, in denen der User ist (aus Discord-Sync oder UI-Zuordnung). */
  raidGroupIds: string[];
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
 * Lädt alle RfGuild mit RaidGroups, prüft pro Gilde ob der User Discord-Mitglied ist,
 * synchronisiert RfUserGuild und RfGuildMember und gibt alle Gilden zurück, in denen
 * der User Mitglied ist (inkl. role 'member' = keine RaidFlow-Rolle).
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

  for (const guild of guilds) {
    try {
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
        console.error('[getGuildsForUser] Discord API failed for guild:', guild.id, guild.name, discordError);
      }

      if (!inGuild) {
        if (membershipKnown) {
          await prisma.rfCharacter.updateMany({
            where: { userId, guildId: guild.id },
            data: { guildDiscordDisplayName: null },
          });
        }
        const existingUserGuild = await prisma.rfUserGuild.findUnique({
          where: { userId_guildId: { userId, guildId: guild.id } },
          select: { role: true },
        });
        if (existingUserGuild) {
          const member = await prisma.rfGuildMember.findUnique({
            where: { userId_guildId: { userId, guildId: guild.id } },
            include: { memberRaidGroups: { select: { raidGroupId: true } } },
          });
          const raidGroupIds = member?.memberRaidGroups.map((rg) => rg.raidGroupId) ?? [];
          result.push({
            id: guild.id,
            name: guild.name,
            discordGuildId: guild.discordGuildId,
            role: existingUserGuild.role as UserGuildRole,
            raidGroupIds,
          });
        }
        continue;
      }

      if (membershipKnown) {
        await prisma.rfCharacter.updateMany({
          where: { userId, guildId: guild.id },
          data: { guildDiscordDisplayName: displayNameInGuild },
        });
      }

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

      const role: UserGuildRole = resolved ? resolved.role : 'member';
      const raidGroupIdsFromDiscord = resolved?.raidGroupIds ?? [];

      if (resolved) {
        try {
          const member = await prisma.rfGuildMember.upsert({
            where: {
              userId_guildId: { userId, guildId: guild.id },
            },
            create: {
              userId,
              guildId: guild.id,
            },
            update: {},
          });
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
            prisma.rfGuildMemberRaidGroup.deleteMany({
              where: { guildMemberId: member.id },
            }),
            ...raidGroupIdsFromDiscord.map((raidGroupId) =>
              prisma.rfGuildMemberRaidGroup.create({
                data: { guildMemberId: member.id, raidGroupId },
              })
            ),
          ]);
        } catch (syncError) {
          console.error('[getGuildsForUser] sync failed for guild:', guild.id, guild.name, syncError);
          // Gilde trotzdem anzeigen – Nutzer soll nicht „Keine Gildenmitgliedschaft“ sehen
        }
      }

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
        role,
        raidGroupIds,
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
    // Einschränkung: nur Raids, für die der User Raider-Recht hat (bei Raidgruppe: User muss in Gruppe sein oder Raidleader/Gildenmeister)
    if (raid.raidGroupRestrictionId) {
      const inGroup =
        guildInfo.raidGroupIds.includes(raid.raidGroupRestrictionId);
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
