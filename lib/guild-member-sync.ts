import { prisma } from '@/lib/prisma';
import { getMemberRoleIds, resolveRaidFlowRole } from '@/lib/discord-roles';
import {
  clearRaidFlowGuildMembershipForUser,
  guildRowToPermissionSyncShape,
  syncMemberPermissionsFromDiscordState,
  type GuildForPermissionSync,
} from '@/lib/member-permission-sync';

export type GuildMemberSyncResult = {
  /** Anzahl der geprüften rf_guild_member-Zeilen dieser Gilde. */
  total: number;
  /** Mitglieder, die auf dem Server sind, eine Gilden-Rolle und mindestens einen Charakter haben. */
  kept: number;
  /** Entfernt: nicht mehr auf dem Discord-Server. */
  removedNotInGuild: number;
  /** Entfernt: auf dem Server, aber ohne konfigurierte Gilden-Rolle. */
  removedNoRole: number;
  /** Entfernt: auf dem Server mit Rolle, aber ohne Charakter in dieser Gilde. */
  removedNoCharacter: number;
  /** Übersprungen: Discord-API lieferte keinen klaren Status (kein Bot-Token, Rate-Limit, Fehler). */
  skippedUnknownMembership: number;
  botTokenConfigured: boolean;
};

function emptyResult(botTokenConfigured: boolean): GuildMemberSyncResult {
  return {
    total: 0,
    kept: 0,
    removedNotInGuild: 0,
    removedNoRole: 0,
    removedNoCharacter: 0,
    skippedUnknownMembership: 0,
    botTokenConfigured,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Member Sync: Gleicht die RaidFlow-Mitgliederliste einer Gilde mit dem Discord-Server ab.
 *
 * Für jedes rf_guild_member wird per Bot-Token der aktuelle Discord-Status geladen und angewendet:
 * - nicht mehr auf dem Server → Mitgliedschaft entfernen
 * - auf dem Server, aber ohne Gilden-Rolle (Gildenmeister/Raidleader/Raider) → entfernen
 * - auf dem Server mit Rolle, aber ohne Charakter in dieser Gilde → entfernen
 * - sonst behalten (Rollen/Anzeigenamen werden dabei aktualisiert)
 *
 * Der auslösende Gildenmeister wird nie entfernt (Schutz vor Selbst-Aussperrung).
 * Bei unklarer Discord-Antwort (API-Fehler / kein Token) wird nichts verändert.
 */
export async function syncGuildMembers(
  guildId: string,
  actingUserId: string
): Promise<GuildMemberSyncResult> {
  const botTokenConfigured = !!process.env.DISCORD_BOT_TOKEN?.trim();

  const guildRow = await prisma.rfGuild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      discordGuildId: true,
      name: true,
      discordRoleGuildmasterId: true,
      discordRoleRaidleaderId: true,
      discordRoleRaiderId: true,
      raidGroups: { select: { id: true, discordRoleId: true } },
    },
  });
  if (!guildRow) return emptyResult(botTokenConfigured);

  const guild: GuildForPermissionSync = guildRowToPermissionSyncShape(guildRow);

  const members = await prisma.rfGuildMember.findMany({
    where: { guildId },
    select: { user: { select: { id: true, discordId: true } } },
  });

  const result = emptyResult(botTokenConfigured);
  result.total = members.length;

  if (!botTokenConfigured) {
    // Ohne Bot-Token liefert die Discord-API keinen klaren Status → nichts verändern.
    result.skippedUnknownMembership = members.length;
    return result;
  }

  const delayMs = 260;

  for (let i = 0; i < members.length; i++) {
    const userId = members[i].user.id;
    const discordUserId = members[i].user.discordId;

    const fromApi = await getMemberRoleIds(guild.discordGuildId, discordUserId);

    if (!fromApi.membershipKnown) {
      result.skippedUnknownMembership += 1;
    } else {
      const resolved = fromApi.inGuild
        ? resolveRaidFlowRole(guild, fromApi.roleIds)
        : null;

      // Discord-Status auf DB anwenden (entfernt bei !inGuild oder ohne Rolle; sonst upsert + Namen).
      await syncMemberPermissionsFromDiscordState({
        userId,
        guild,
        membershipKnown: true,
        inGuild: fromApi.inGuild,
        roleIds: fromApi.roleIds,
        displayNameInGuild: fromApi.displayNameInGuild,
      });

      if (!fromApi.inGuild) {
        result.removedNotInGuild += 1;
      } else if (!resolved) {
        result.removedNoRole += 1;
      } else {
        // Auf dem Server mit Rolle: ohne Charakter in dieser Gilde entfernen.
        const charCount = await prisma.rfCharacter.count({
          where: { userId, guildId },
        });
        if (charCount === 0 && userId !== actingUserId) {
          await clearRaidFlowGuildMembershipForUser(userId, guild);
          result.removedNoCharacter += 1;
        } else {
          result.kept += 1;
        }
      }
    }

    if (i + 1 < members.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return result;
}
