import { prisma } from '@/lib/prisma';
import { getAppConfig, isGuildAllowed } from '@/lib/app-config';
import { resolveDiscordGuildMembership } from '@/lib/resolve-discord-guild-membership';
import {
  guildRowToPermissionSyncShape,
  syncMemberPermissionsFromDiscordState,
} from '@/lib/member-permission-sync';

export async function ensureRfUserForDiscordId(discordUserId: string): Promise<string> {
  const user = await prisma.rfUser.upsert({
    where: { discordId: discordUserId },
    create: { discordId: discordUserId },
    update: { updatedAt: new Date() },
    select: { id: true },
  });
  return user.id;
}

export type SyncDiscordUserGuildMembershipsResult = {
  userId: string;
  syncedGuildIds: string[];
  anyMembershipKnown: boolean;
};

/**
 * Discord-Rollen → rf_user_guild für einen User.
 * Optional nur ein Server (`discordGuildId`), sonst alle in der DB registrierten Gilden.
 */
export async function syncDiscordUserGuildMemberships(params: {
  discordUserId: string;
  userId?: string;
  discordGuildId?: string;
}): Promise<SyncDiscordUserGuildMembershipsResult> {
  const userId = params.userId ?? (await ensureRfUserForDiscordId(params.discordUserId));
  const config = await getAppConfig();

  const guildInclude = {
    raidGroups: { select: { id: true, discordRoleId: true } },
  } as const;

  const guilds = params.discordGuildId
    ? await prisma.rfGuild.findMany({
        where: { discordGuildId: params.discordGuildId },
        include: guildInclude,
      })
    : await prisma.rfGuild.findMany({ include: guildInclude });

  const allowed = guilds.filter((g) => isGuildAllowed(g.discordGuildId, config));
  const syncedGuildIds: string[] = [];
  let anyMembershipKnown = false;

  for (const guild of allowed) {
    const membership = await resolveDiscordGuildMembership(
      guild.discordGuildId,
      params.discordUserId
    );
    if (membership.membershipKnown) anyMembershipKnown = true;

    await syncMemberPermissionsFromDiscordState({
      userId,
      guild: guildRowToPermissionSyncShape(guild),
      membershipKnown: membership.membershipKnown,
      inGuild: membership.inGuild,
      roleIds: membership.roleIds,
      displayNameInGuild: membership.displayNameInGuild,
    });

    if (membership.membershipKnown && membership.inGuild) {
      const ug = await prisma.rfUserGuild.findUnique({
        where: { userId_guildId: { userId, guildId: guild.id } },
        select: { role: true },
      });
      if (ug && ug.role !== 'member') {
        syncedGuildIds.push(guild.id);
      }
    }
  }

  return { userId, syncedGuildIds, anyMembershipKnown };
}
