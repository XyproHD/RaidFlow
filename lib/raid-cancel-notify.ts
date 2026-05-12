import { createChannelMessage, createUserDmChannel } from '@/lib/discord-guild-api';
import { formatDefaultRaidCancelDmDe, RAID_CANCEL_DM_MAX_LENGTH } from '@/lib/raid-cancel-message';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sendet (sequentiell, leichte Verzögerung) eine freundliche Absage-Nachricht per Discord-DM.
 * Fehler pro Nutzer werden geloggt, der Aufrufer läuft weiter.
 */
export async function sendRaidCancellationDirectMessages(opts: {
  discordUserIds: string[];
  guildName: string;
  raidName: string;
  dungeonLine: string;
  scheduledAt: Date;
  /** Optional: vom Raidleiter angepasster Text (Discord-Markdown, max. 2000 Zeichen). */
  messageOverride?: string | null;
}): Promise<void> {
  const trimmed = opts.messageOverride?.trim();
  const content = (
    trimmed && trimmed.length <= RAID_CANCEL_DM_MAX_LENGTH
      ? trimmed
      : formatDefaultRaidCancelDmDe(opts)
  ).slice(0, RAID_CANCEL_DM_MAX_LENGTH);
  const seen = new Set<string>();

  for (const discordUserId of opts.discordUserIds) {
    const id = discordUserId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    try {
      const dmChannelId = await createUserDmChannel(id);
      await createChannelMessage(dmChannelId, content);
      await sleep(120);
    } catch (e) {
      console.error('[sendRaidCancellationDirectMessages]', id, e);
    }
  }
}
