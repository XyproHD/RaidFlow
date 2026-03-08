/**
 * Benötigte Bot-Berechtigungen (Bitmask, siehe DiscordBot.md Abschnitt „Bot-Berechtigungen“).
 * BigInt nötig, da Bits > 31 in JavaScript mit Number verloren gehen.
 */
const DISCORD_BOT_PERMISSIONS =
  (BigInt(1) << BigInt(28)) | // MANAGE_ROLES – Rollen anlegen (Setup, Raidgruppen)
  (BigInt(1) << BigInt(10)) | // VIEW_CHANNEL – Channels/Threads sehen
  (BigInt(1) << BigInt(11)) | // SEND_MESSAGES – Nachrichten senden
  (BigInt(1) << BigInt(16)) | // READ_MESSAGE_HISTORY – Thread-Inhalt
  (BigInt(1) << BigInt(31)) | // USE_APPLICATION_COMMANDS – Slash-Commands
  (BigInt(1) << BigInt(34)) | // MANAGE_THREADS – Threads verwalten
  (BigInt(1) << BigInt(35)) | // CREATE_PUBLIC_THREADS – Raid-Threads erstellen
  (BigInt(1) << BigInt(38));  // SEND_MESSAGES_IN_THREADS – Thread-Updates

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
