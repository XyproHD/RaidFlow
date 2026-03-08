/**
 * Benötigte Bot-Berechtigungen (Bitmask, siehe DiscordBot.md Abschnitt „Bot-Berechtigungen“).
 * BigInt nötig, da Bits > 31 in JavaScript mit Number verloren gehen.
 */
const DISCORD_BOT_PERMISSIONS =
  (1n << 28n) | // MANAGE_ROLES – Rollen anlegen (Setup, Raidgruppen)
  (1n << 10n) | // VIEW_CHANNEL – Channels/Threads sehen
  (1n << 11n) | // SEND_MESSAGES – Nachrichten senden
  (1n << 16n) | // READ_MESSAGE_HISTORY – Thread-Inhalt
  (1n << 31n) | // USE_APPLICATION_COMMANDS – Slash-Commands
  (1n << 34n) | // MANAGE_THREADS – Threads verwalten
  (1n << 35n) | // CREATE_PUBLIC_THREADS – Raid-Threads erstellen
  (1n << 38n);  // SEND_MESSAGES_IN_THREADS – Thread-Updates

/**
 * Bot-Einladungs-URL (Discord OAuth2).
 * Server wird in Discord gewählt (kein guild_id). Scope nur "bot" – laut Doku zeigt Discord
 * dann die Berechtigungs-Checkboxen an; applications.commands ist bei bot inklusive.
 */
export function getBotInviteUrl(_guildId?: string): string {
  const clientId = process.env.DISCORD_BOT_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID;
  if (!clientId) return '#';
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot',
    permissions: DISCORD_BOT_PERMISSIONS.toString(),
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
