/** Discord-Nachrichteninhalt: maximale Länge (Zeichen). */
export const RAID_CANCEL_DM_MAX_LENGTH = 2000;

/**
 * Standard-Absage-DM (deutsch, Discord-Markdown mit **fett**).
 * Wird von API und Client für Vorschau/Editor genutzt.
 */
export function formatDefaultRaidCancelDmDe(opts: {
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
  ).slice(0, RAID_CANCEL_DM_MAX_LENGTH);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Kleine Vorschau wie Discord: **fett**, *kursiv*, `code`, Zeilenumbrüche.
 * Nur für kontrollierte Vorschau (Eingabe stammt von vertrauenswürdigen Raidleitern).
 */
export function discordDmContentToPreviewHtml(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-black/25 px-1 py-0.5 text-[0.9em]">$1</code>');
  s = s.replace(/\n/g, '<br />');
  return s;
}
