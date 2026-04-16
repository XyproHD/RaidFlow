/**
 * Discord-API-Aufrufe für Gilden (Rollen anlegen, Channels lesen).
 * Verwendet DISCORD_BOT_TOKEN. Siehe DiscordBot.md Abschnitte 2 und 3.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** Discord Channel type: GUILD_TEXT = 0, GUILD_ANNOUNCEMENT = 5 (für Threads nutzbar). */
const TEXT_CHANNEL_TYPES = [0, 5];

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
}

function getBotToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN ?? null;
}

/**
 * Erstellt eine Rolle auf dem Discord-Server (z. B. Raidflowgroup-<Name>).
 * Bot braucht MANAGE_ROLES. Gibt die neue Rollen-ID zurück.
 */
export async function createGuildRole(
  discordGuildId: string,
  roleName: string
): Promise<string> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const res = await fetch(
    `${DISCORD_API_BASE}/guilds/${discordGuildId}/roles`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: roleName }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API roles: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Aktualisiert den Namen einer Rolle auf dem Discord-Server.
 */
export async function updateGuildRole(
  discordGuildId: string,
  discordRoleId: string,
  roleName: string
): Promise<void> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const res = await fetch(
    `${DISCORD_API_BASE}/guilds/${discordGuildId}/roles/${discordRoleId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: roleName }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API role update: ${res.status} ${text}`);
  }
}

/**
 * Löscht eine Rolle auf dem Discord-Server.
 */
export async function deleteGuildRole(
  discordGuildId: string,
  discordRoleId: string
): Promise<void> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const res = await fetch(
    `${DISCORD_API_BASE}/guilds/${discordGuildId}/roles/${discordRoleId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bot ${token}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Discord API role delete: ${res.status} ${text}`);
  }
}

/**
 * Liefert alle Text-Channels des Servers (für „Lese Channels“ / Thread-Channel-Auswahl).
 * Nur Typ 0 (GUILD_TEXT) und 5 (GUILD_ANNOUNCEMENT).
 */
export async function getGuildChannels(
  discordGuildId: string
): Promise<DiscordChannel[]> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const res = await fetch(
    `${DISCORD_API_BASE}/guilds/${discordGuildId}/channels`,
    {
      headers: { Authorization: `Bot ${token}` },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API channels: ${res.status} ${text}`);
  }

  const data = (await res.json()) as DiscordChannel[];
  return data.filter((ch) => TEXT_CHANNEL_TYPES.includes(ch.type));
}

/**
 * Fügt einem Guild-Member eine Rolle hinzu (z. B. Raidflowgroup-Rolle).
 * PUT /guilds/{guild.id}/members/{user.id}/roles/{role.id}
 */
export async function addRoleToMember(
  discordGuildId: string,
  discordUserId: string,
  discordRoleId: string
): Promise<void> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const res = await fetch(
    `${DISCORD_API_BASE}/guilds/${discordGuildId}/members/${discordUserId}/roles/${discordRoleId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bot ${token}` },
    }
  );

  if (!res.status || (res.status !== 204 && res.status !== 200)) {
    const text = await res.text();
    throw new Error(`Discord API add role: ${res.status} ${text}`);
  }
}

/**
 * Entfernt eine Rolle von einem Guild-Member (z. B. Raidflowgroup-Rolle beim Austritt).
 * DELETE /guilds/{guild.id}/members/{user.id}/roles/{role.id}
 */
export async function removeRoleFromMember(
  discordGuildId: string,
  discordUserId: string,
  discordRoleId: string
): Promise<void> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const res = await fetch(
    `${DISCORD_API_BASE}/guilds/${discordGuildId}/members/${discordUserId}/roles/${discordRoleId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bot ${token}` },
    }
  );

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Discord API remove role: ${res.status} ${text}`);
  }
}

/**
 * Prüft, ob ein Channel auf dem Server noch existiert (GET channel).
 * Gibt true zurück wenn vorhanden, false bei 404 oder Fehler.
 */
export async function channelExists(
  discordChannelId: string
): Promise<boolean> {
  const token = getBotToken();
  if (!token) return false;

  const res = await fetch(
    `${DISCORD_API_BASE}/channels/${discordChannelId}`,
    {
      headers: { Authorization: `Bot ${token}` },
    }
  );

  return res.ok;
}

/**
 * Erstellt einen öffentlichen Thread in einem Text-/News-Channel (Raid-Thread).
 * Discord: POST /channels/{channel.id}/threads, type 11 = GUILD_PUBLIC_THREAD.
 */
export async function createPublicThreadInChannel(
  parentDiscordChannelId: string,
  threadName: string
): Promise<{ threadId: string }> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const name = threadName.slice(0, 100);
  const res = await fetch(
    `${DISCORD_API_BASE}/channels/${parentDiscordChannelId}/threads`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        auto_archive_duration: 1440,
        type: 11,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API threads: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Discord API threads: missing id');
  return { threadId: data.id };
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordMessageComponent {
  type: number;
  components?: DiscordMessageComponent[];
  style?: number;
  label?: string;
  emoji?: { name: string };
  custom_id?: string;
  url?: string;
  disabled?: boolean;
  placeholder?: string;
  options?: { label: string; value: string; description?: string; default?: boolean }[];
  min_values?: number;
  max_values?: number;
}

export interface DiscordMessageOptions {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordMessageComponent[];
}

/**
 * Sendet eine Nachricht (Text, Embeds, Komponenten) in einen Channel oder Thread.
 */
export async function createChannelMessage(
  channelId: string,
  content: string
): Promise<{ messageId: string }> {
  return createChannelMessageFull(channelId, { content: content.slice(0, 2000) });
}

/**
 * Sendet eine Nachricht mit Embeds und/oder Komponenten (Buttons).
 */
export async function createChannelMessageFull(
  channelId: string,
  options: DiscordMessageOptions
): Promise<{ messageId: string }> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const body: Record<string, unknown> = {};
  if (options.content) body.content = options.content.slice(0, 2000);
  if (options.embeds?.length) body.embeds = options.embeds;
  if (options.components?.length) body.components = options.components;

  const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API create message: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Discord API create message: missing id');
  return { messageId: data.id };
}

/**
 * Bearbeitet eine Nachricht (Text, Embeds, Komponenten).
 */
export async function editChannelMessage(
  channelId: string,
  messageId: string,
  content: string
): Promise<void> {
  await editChannelMessageFull(channelId, messageId, { content: content.slice(0, 2000) });
}

/**
 * Bearbeitet eine Nachricht mit Embeds und/oder Komponenten.
 */
export async function editChannelMessageFull(
  channelId: string,
  messageId: string,
  options: DiscordMessageOptions
): Promise<void> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const body: Record<string, unknown> = {};
  if (options.content !== undefined) body.content = options.content ? options.content.slice(0, 2000) : '';
  if (options.embeds !== undefined) body.embeds = options.embeds;
  if (options.components !== undefined) body.components = options.components;

  const res = await fetch(
    `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API edit message: ${res.status} ${text}`);
  }
}

/**
 * Erstellt einen öffentlichen Thread aus einer bestehenden Nachricht.
 * POST /channels/{channel.id}/messages/{message.id}/threads
 */
export async function createThreadFromMessage(
  channelId: string,
  messageId: string,
  threadName: string
): Promise<{ threadId: string }> {
  const token = getBotToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const name = threadName.slice(0, 100);
  const res = await fetch(
    `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}/threads`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        auto_archive_duration: 1440,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API create thread from message: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Discord API create thread from message: missing id');
  return { threadId: data.id };
}
