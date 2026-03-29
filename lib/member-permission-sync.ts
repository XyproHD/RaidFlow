/**
 * Zentrale Schreibpfad-Synchronisation: Discord-Rollen → rf_user_guild, rf_guild_member,
 * rf_guild_member_raid_group (und Anzeigenamen auf Charakteren der Gilde).
 *
 * Wird von POST /api/bot/sync-member (Bot-Events) und getGuildsForUser (Discord-Abgleich) aufgerufen.
 * Verwaiste rf_user_guild ergänzt getGuildsForUser separat (ensure_orphan), falls der Sync scheitert.
 */

import { prisma } from '@/lib/prisma';
import { resolveRaidFlowRole, type RfGuildWithRoles } from '@/lib/discord-roles';
import { pruneIneligibleOpenRaidSignups } from '@/lib/raid-signup-prune';

export type GuildForPermissionSync = RfGuildWithRoles & { id: string };

export function guildRowToPermissionSyncShape(guild: {
  id: string;
  discordGuildId: string;
  name: string;
  discordRoleGuildmasterId: string | null;
  discordRoleRaidleaderId: string | null;
  discordRoleRaiderId: string | null;
  raidGroups: Array<{ id: string; discordRoleId: string | null }>;
}): GuildForPermissionSync {
  return {
    id: guild.id,
    discordGuildId: guild.discordGuildId,
    name: guild.name,
    discordRoleGuildmasterId: guild.discordRoleGuildmasterId,
    discordRoleRaidleaderId: guild.discordRoleRaidleaderId,
    discordRoleRaiderId: guild.discordRoleRaiderId,
    raidGroups: guild.raidGroups,
  };
}

/**
 * Wendet den bekannten Discord-Status für ein Guild-Mitglied auf die DB an.
 * Bei membershipKnown === false keine Änderung (API-Fehler / kein Bot-Token).
 */
export async function syncMemberPermissionsFromDiscordState(params: {
  userId: string;
  guild: GuildForPermissionSync;
  membershipKnown: boolean;
  inGuild: boolean;
  roleIds: string[];
  /** undefined = Anzeigenamen in rf_character nicht anfassen (z. B. Webapp-Bootstrap ohne Nick). */
  displayNameInGuild?: string | null;
}): Promise<void> {
  const { userId, guild, membershipKnown, inGuild, roleIds, displayNameInGuild } = params;
  if (!membershipKnown) return;

  if (!inGuild) {
    await prisma.rfCharacter.updateMany({
      where: { userId, guildId: guild.id },
      data: { guildDiscordDisplayName: null },
    });
    const existingMember = await prisma.rfGuildMember.findUnique({
      where: { userId_guildId: { userId, guildId: guild.id } },
      select: { id: true },
    });
    if (existingMember) {
      await prisma.rfGuildMemberRaidGroup.deleteMany({
        where: { guildMemberId: existingMember.id },
      });
      await prisma.rfGuildMember.delete({
        where: { id: existingMember.id },
      });
    }
    await prisma.rfUserGuild.deleteMany({
      where: { userId, guildId: guild.id },
    });
    try {
      await pruneIneligibleOpenRaidSignups(userId, guild.id);
    } catch (e) {
      console.error('[syncMemberPermissionsFromDiscordState] prune (left guild)', guild.id, e);
    }
    return;
  }

  if (displayNameInGuild !== undefined) {
    await prisma.rfCharacter.updateMany({
      where: { userId, guildId: guild.id },
      data: { guildDiscordDisplayName: displayNameInGuild },
    });
  }

  const resolved = resolveRaidFlowRole(guild, roleIds);

  if (resolved) {
    try {
      // Kern zuerst: Member + rf_user_guild in einer TX. Raidgruppen-Links separat, damit ein Fehler
      // dort nicht verhindert, dass rf_user_guild geschrieben wird (sonst leeres Dashboard trotz GM auf Discord).
      await prisma.$transaction(async (tx) => {
        await tx.rfGuildMember.upsert({
          where: { userId_guildId: { userId, guildId: guild.id } },
          create: { userId, guildId: guild.id },
          update: {},
        });
        await tx.rfUserGuild.upsert({
          where: { userId_guildId: { userId, guildId: guild.id } },
          create: { userId, guildId: guild.id, role: resolved.role },
          update: { role: resolved.role },
        });
      });
      const memberRow = await prisma.rfGuildMember.findUnique({
        where: { userId_guildId: { userId, guildId: guild.id } },
        select: { id: true },
      });
      if (memberRow) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.rfGuildMemberRaidGroup.deleteMany({
              where: { guildMemberId: memberRow.id },
            });
            for (const raidGroupId of resolved.raidGroupIds) {
              await tx.rfGuildMemberRaidGroup.create({
                data: { guildMemberId: memberRow.id, raidGroupId },
              });
            }
          });
        } catch (e) {
          console.error('[syncMemberPermissionsFromDiscordState] raid-group links', guild.id, e);
        }
      }
    } catch (e) {
      console.error('[syncMemberPermissionsFromDiscordState]', guild.id, e);
    }
  } else {
    try {
      await prisma.$transaction(async (tx) => {
        const existingMember = await tx.rfGuildMember.findUnique({
          where: { userId_guildId: { userId, guildId: guild.id } },
          select: { id: true },
        });
        if (existingMember) {
          await tx.rfGuildMemberRaidGroup.deleteMany({
            where: { guildMemberId: existingMember.id },
          });
          await tx.rfGuildMember.delete({
            where: { id: existingMember.id },
          });
        }
        await tx.rfUserGuild.upsert({
          where: { userId_guildId: { userId, guildId: guild.id } },
          create: { userId, guildId: guild.id, role: 'member' },
          update: { role: 'member' },
        });
      });
    } catch (e) {
      console.error('[syncMemberPermissionsFromDiscordState] member-only', guild.id, e);
    }
  }

  // Legacy / TX-Fehler: rf_guild_member ohne rf_user_guild, aber Discord-Rollen liefern eine RaidFlow-Rolle.
  if (membershipKnown && inGuild) {
    const [gmProbe, ugProbe] = await Promise.all([
      prisma.rfGuildMember.findUnique({
        where: { userId_guildId: { userId, guildId: guild.id } },
        select: { id: true },
      }),
      prisma.rfUserGuild.findUnique({
        where: { userId_guildId: { userId, guildId: guild.id } },
        select: { role: true },
      }),
    ]);
    if (gmProbe && !ugProbe) {
      const r = resolveRaidFlowRole(guild, roleIds);
      if (r) {
        try {
          await prisma.rfUserGuild.upsert({
            where: { userId_guildId: { userId, guildId: guild.id } },
            create: { userId, guildId: guild.id, role: r.role },
            update: { role: r.role },
          });
          console.warn(
            JSON.stringify({
              scope: 'RF_SYNC',
              step: 'healed_missing_user_guild',
              guildId: guild.id,
              role: r.role,
            })
          );
        } catch (e) {
          console.error('[syncMemberPermissionsFromDiscordState] heal user_guild', guild.id, e);
        }
      }
    }
  }

  try {
    await pruneIneligibleOpenRaidSignups(userId, guild.id);
  } catch (e) {
    console.error('[syncMemberPermissionsFromDiscordState] prune', guild.id, e);
  }
}
