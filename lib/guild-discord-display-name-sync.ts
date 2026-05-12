import { prisma } from '@/lib/prisma';
import { getMemberRoleIds } from '@/lib/discord-roles';

export type GuildDiscordDisplayNameSyncResult = {
  total: number;
  /** Zeilen in rf_character mit guildId dieser Gilde, die mit einem Namen (oder null) aktualisiert wurden */
  charactersUpdated: number;
  /** Discord-API lieferte keinen klaren Status (kein Bot-Token, Rate-Limit, Fehler) */
  skippedUnknownMembership: number;
  /** User laut API nicht (mehr) auf dem Discord-Server */
  notInDiscordGuild: number;
  /** Kein passender Charakter-Eintrag mit guildId = diese Gilde */
  skippedNoGuildCharacters: number;
  /** Namen von Discord geholt und gesetzt (mindestens ein Charakter pro User) */
  membersWithNameApplied: number;
  botTokenConfigured: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lädt für alle rf_guild_member dieser Gilde den Anzeigenamen per Discord-API (Bot-Token)
 * und schreibt ihn auf alle zugehörigen rf_character-Zeilen (guild_discord_display_name).
 */
export async function syncGuildMemberDiscordDisplayNames(guildId: string): Promise<GuildDiscordDisplayNameSyncResult> {
  const botTokenConfigured = !!process.env.DISCORD_BOT_TOKEN?.trim();

  const guild = await prisma.rfGuild.findUnique({
    where: { id: guildId },
    select: { discordGuildId: true },
  });
  if (!guild) {
    return {
      total: 0,
      charactersUpdated: 0,
      skippedUnknownMembership: 0,
      notInDiscordGuild: 0,
      skippedNoGuildCharacters: 0,
      membersWithNameApplied: 0,
      botTokenConfigured,
    };
  }

  const members = await prisma.rfGuildMember.findMany({
    where: { guildId },
    select: {
      user: { select: { id: true, discordId: true } },
    },
  });

  let charactersUpdated = 0;
  let skippedUnknownMembership = 0;
  let notInDiscordGuild = 0;
  let skippedNoGuildCharacters = 0;
  let membersWithNameApplied = 0;

  const delayMs = 260;

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const discordUserId = m.user.discordId;
    const userId = m.user.id;

    const fromApi = await getMemberRoleIds(guild.discordGuildId, discordUserId);

    if (!fromApi.membershipKnown) {
      skippedUnknownMembership += 1;
    } else if (!fromApi.inGuild) {
      notInDiscordGuild += 1;
    } else {
      const displayName = fromApi.displayNameInGuild;
      const r = await prisma.rfCharacter.updateMany({
        where: { userId, guildId },
        data: { guildDiscordDisplayName: displayName },
      });
      charactersUpdated += r.count;
      if (r.count === 0) {
        skippedNoGuildCharacters += 1;
      } else if (displayName) {
        membersWithNameApplied += 1;
      }
    }

    if (i + 1 < members.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return {
    total: members.length,
    charactersUpdated,
    skippedUnknownMembership,
    notInDiscordGuild,
    skippedNoGuildCharacters,
    membersWithNameApplied,
    botTokenConfigured,
  };
}
