import { createChannelMessage, createUserDmChannel } from '@/lib/discord-guild-api';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatRaidCancelDmDe(opts: {
  guildName: string;
  raidName: string;
  dungeonLine: string;
  scheduledAt: Date;
}): string {
  const termin = opts.scheduledAt.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    `Hallo! Leider müssen wir den Raid **${opts.raidName}** absagen — das tut uns sehr leid.\n\n` +
    `**Gilde:** ${opts.guildName}\n` +
    `**Termin:** ${termin}\n` +
    `**Dungeon:** ${opts.dungeonLine}\n\n` +
    `Wir hoffen, wir sehen dich beim nächsten Mal wieder mit dabei.`
  ).slice(0, 2000);
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
}): Promise<void> {
  const content = formatRaidCancelDmDe(opts);
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
