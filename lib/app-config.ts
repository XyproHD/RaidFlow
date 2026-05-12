/**
 * App-Konfiguration: Owner, Whitelist/Blacklist (rf_app_config).
 * Nur eine von Whitelist/Blacklist ist aktiv.
 */

import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { getGuildEmojis } from '@/lib/discord-guild-api';

/** Feste Discord-ID des Application-Owners (immer Admin, nicht entfernbar). */
export const OWNER_DISCORD_ID = '159383599001370625';

const KEY_OWNER = 'owner_discord_id';
const KEY_USE_WHITELIST = 'use_whitelist';
const KEY_USE_BLACKLIST = 'use_blacklist';
const KEY_SERVER_WHITELIST = 'server_whitelist';
const KEY_SERVER_BLACKLIST = 'server_blacklist';
const KEY_DISCORD_BOT_INVITE_ENABLED = 'discord_bot_invite_enabled';
const KEY_MAINTENANCE_MODE = 'maintenance_mode';
const KEY_STATUS_MESSAGE = 'status_message';
const KEY_OWNER_WEB_FULL_ACCESS = 'owner_web_full_access';
const KEY_DISCORD_EMOJIS = 'discord_emojis';
const EXTERNAL_DISCORD_EMOJI_GUILD_ID = '1301090883789258752';
const EXTERNAL_EMOJI_CACHE_TTL_MS = 5 * 60 * 1000;

export interface AppConfigState {
  ownerDiscordId: string | null;
  useWhitelist: boolean;
  useBlacklist: boolean;
  serverWhitelist: string[];
  serverBlacklist: string[];
  discordBotInviteEnabled: boolean;
  maintenanceMode: boolean;
  statusMessage: string;
  /**
   * Wenn true: App-Owner (ownerDiscordId) erhält in der Web-App pro Gilde effektiv Gildenmeister-Rechte,
   * sofern mindestens Raider — nur Session/API, nicht der Discord-Bot.
   */
  ownerWebFullAccess: boolean;
  /** Discord Emoji-Markup (z. B. "<:wow_tank:123>") für Bot-UI (UseExternalEmojis). */
  discordEmojis: Record<string, string>;
}

/** Sichere Defaults wenn `getAppConfig()` fehlschlägt (DB/Env in Prod). */
export const DEFAULT_APP_CONFIG_STATE: AppConfigState = {
  ownerDiscordId: OWNER_DISCORD_ID,
  useWhitelist: false,
  useBlacklist: false,
  serverWhitelist: [],
  serverBlacklist: [],
  discordBotInviteEnabled: true,
  maintenanceMode: false,
  statusMessage: '',
  ownerWebFullAccess: false,
  discordEmojis: {},
};

function parseJsonArray(value: string | null): string[] {
  if (!value || value.trim() === '') return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonStringRecord(value: string | null): Record<string, string> {
  if (!value || value.trim() === '') return {};
  try {
    const obj = JSON.parse(value) as unknown;
    if (!obj || typeof obj !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

type EmojiCacheState = {
  expiresAt: number;
  map: Record<string, string>;
};

let externalEmojiCache: EmojiCacheState | null = null;

function toDiscordEmojiMarkup(name: string, id: string, animated: boolean): string {
  return animated ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
}

/** Feste Defaults für einzelne Keys, falls externe Emoji-Guild / rf_app_config sie nicht liefern (z. B. wow_rogue). */
const BUILTIN_DISCORD_EMOJI_DEFAULTS: Record<string, string> = {
  wow_rogue: toDiscordEmojiMarkup('wow_rogue', '1503807724754833542', false),
};

async function loadExternalDiscordEmojis(): Promise<Record<string, string>> {
  const now = Date.now();
  if (externalEmojiCache && externalEmojiCache.expiresAt > now) {
    return externalEmojiCache.map;
  }

  try {
    const emojis = await getGuildEmojis(EXTERNAL_DISCORD_EMOJI_GUILD_ID);
    const map: Record<string, string> = {};
    for (const emoji of emojis) {
      const key = emoji.name?.trim();
      if (!key) continue;
      map[key] = toDiscordEmojiMarkup(key, emoji.id, emoji.animated === true);
    }
    externalEmojiCache = { map, expiresAt: now + EXTERNAL_EMOJI_CACHE_TTL_MS };
    return map;
  } catch {
    // Externe Emoji-Guild optional: bei Fehlern bestehende Konfiguration weiterverwenden.
    externalEmojiCache = { map: {}, expiresAt: now + EXTERNAL_EMOJI_CACHE_TTL_MS };
    return {};
  }
}

/** Lädt die komplette App-Config (Owner, Whitelist/Blacklist, Bot-Einladung, Wartungsmodus). */
export const getAppConfig = cache(async (): Promise<AppConfigState> => {
  const keys = [
    KEY_OWNER,
    KEY_USE_WHITELIST,
    KEY_USE_BLACKLIST,
    KEY_SERVER_WHITELIST,
    KEY_SERVER_BLACKLIST,
    KEY_DISCORD_BOT_INVITE_ENABLED,
    KEY_MAINTENANCE_MODE,
    KEY_STATUS_MESSAGE,
    KEY_OWNER_WEB_FULL_ACCESS,
    KEY_DISCORD_EMOJIS,
  ] as const;
  const rows = await prisma.rfAppConfig.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const useWhitelist = byKey.get(KEY_USE_WHITELIST) ?? null;
  const useBlacklist = byKey.get(KEY_USE_BLACKLIST) ?? null;
  const whitelistRaw = byKey.get(KEY_SERVER_WHITELIST) ?? null;
  const blacklistRaw = byKey.get(KEY_SERVER_BLACKLIST) ?? null;
  const discordBotInviteEnabled = byKey.get(KEY_DISCORD_BOT_INVITE_ENABLED) ?? null;
  const maintenanceMode = byKey.get(KEY_MAINTENANCE_MODE) ?? null;
  const statusMessage = byKey.get(KEY_STATUS_MESSAGE) ?? null;
  const ownerWebFullAccess = byKey.get(KEY_OWNER_WEB_FULL_ACCESS) ?? null;
  const discordEmojisRaw = byKey.get(KEY_DISCORD_EMOJIS) ?? null;
  const configuredDiscordEmojis = parseJsonStringRecord(discordEmojisRaw);
  const externalDiscordEmojis = await loadExternalDiscordEmojis();
  return {
    ownerDiscordId: OWNER_DISCORD_ID,
    useWhitelist: useWhitelist === 'true',
    useBlacklist: useBlacklist === 'true',
    serverWhitelist: parseJsonArray(whitelistRaw),
    serverBlacklist: parseJsonArray(blacklistRaw),
    discordBotInviteEnabled: discordBotInviteEnabled !== 'false',
    maintenanceMode: maintenanceMode === 'true',
    statusMessage: statusMessage ?? '',
    ownerWebFullAccess: ownerWebFullAccess === 'true',
    // Externe Emoji-Guild überschreibt gleichnamige Keys (z. B. wow_*), damit
    // serverübergreifende Emoji-Nutzung konsistent funktioniert.
    discordEmojis: {
      ...BUILTIN_DISCORD_EMOJI_DEFAULTS,
      ...configuredDiscordEmojis,
      ...externalDiscordEmojis,
    },
  };
});

/**
 * Filtert eine Liste von discord_guild_id nach Whitelist/Blacklist.
 * - useWhitelist: nur IDs in serverWhitelist behalten
 * - useBlacklist: IDs in serverBlacklist entfernen
 * - beide aus: alle behalten
 */
export function filterGuildIdsByConfig(
  discordGuildIds: string[],
  config: Pick<AppConfigState, 'useWhitelist' | 'useBlacklist' | 'serverWhitelist' | 'serverBlacklist'>
): string[] {
  const { useWhitelist, useBlacklist, serverWhitelist, serverBlacklist } = config;
  if (useWhitelist) {
    const set = new Set(serverWhitelist);
    return discordGuildIds.filter((id) => set.has(id));
  }
  if (useBlacklist) {
    const set = new Set(serverBlacklist);
    return discordGuildIds.filter((id) => !set.has(id));
  }
  return discordGuildIds;
}

/** Prüft, ob eine discord_guild_id laut Config erlaubt ist. */
export function isGuildAllowed(
  discordGuildId: string,
  config: Pick<AppConfigState, 'useWhitelist' | 'useBlacklist' | 'serverWhitelist' | 'serverBlacklist'>
): boolean {
  const { useWhitelist, useBlacklist, serverWhitelist, serverBlacklist } = config;
  if (useWhitelist) return serverWhitelist.includes(discordGuildId);
  if (useBlacklist) return !serverBlacklist.includes(discordGuildId);
  return true;
}

/** Speichert Whitelist/Blacklist. Nur eine von use_whitelist / use_blacklist darf true sein. */
export async function setWhitelistBlacklist(updates: {
  useWhitelist?: boolean;
  useBlacklist?: boolean;
  serverWhitelist?: string[];
  serverBlacklist?: string[];
}): Promise<AppConfigState> {
  const config = await getAppConfig();
  let useWhitelist = config.useWhitelist;
  let useBlacklist = config.useBlacklist;
  let serverWhitelist = config.serverWhitelist;
  let serverBlacklist = config.serverBlacklist;

  if (updates.useWhitelist !== undefined) useWhitelist = updates.useWhitelist;
  if (updates.useBlacklist !== undefined) useBlacklist = updates.useBlacklist;
  if (updates.serverWhitelist !== undefined) serverWhitelist = updates.serverWhitelist;
  if (updates.serverBlacklist !== undefined) serverBlacklist = updates.serverBlacklist;

  if (useWhitelist && useBlacklist) useBlacklist = false;
  if (useBlacklist && useWhitelist) useWhitelist = false;

  await prisma.$transaction([
    prisma.rfAppConfig.upsert({
      where: { key: KEY_USE_WHITELIST },
      create: { key: KEY_USE_WHITELIST, value: String(useWhitelist) },
      update: { value: String(useWhitelist) },
    }),
    prisma.rfAppConfig.upsert({
      where: { key: KEY_USE_BLACKLIST },
      create: { key: KEY_USE_BLACKLIST, value: String(useBlacklist) },
      update: { value: String(useBlacklist) },
    }),
    prisma.rfAppConfig.upsert({
      where: { key: KEY_SERVER_WHITELIST },
      create: { key: KEY_SERVER_WHITELIST, value: JSON.stringify(serverWhitelist) },
      update: { value: JSON.stringify(serverWhitelist) },
    }),
    prisma.rfAppConfig.upsert({
      where: { key: KEY_SERVER_BLACKLIST },
      create: { key: KEY_SERVER_BLACKLIST, value: JSON.stringify(serverBlacklist) },
      update: { value: JSON.stringify(serverBlacklist) },
    }),
  ]);

  return getAppConfig();
}

/** Speichert Admin-Feature-Flags: Discord-Bot-Einladungen, Wartungsmodus, Statusmeldung. */
export async function setAdminFeatureFlags(updates: {
  discordBotInviteEnabled?: boolean;
  maintenanceMode?: boolean;
  statusMessage?: string;
  ownerWebFullAccess?: boolean;
}): Promise<AppConfigState> {
  const config = await getAppConfig();
  let discordBotInviteEnabled = config.discordBotInviteEnabled;
  let maintenanceMode = config.maintenanceMode;
  let statusMessage = config.statusMessage;
  let ownerWebFullAccess = config.ownerWebFullAccess;

  if (updates.discordBotInviteEnabled !== undefined) discordBotInviteEnabled = updates.discordBotInviteEnabled;
  if (updates.maintenanceMode !== undefined) maintenanceMode = updates.maintenanceMode;
  if (updates.statusMessage !== undefined) statusMessage = updates.statusMessage;
  if (updates.ownerWebFullAccess !== undefined) ownerWebFullAccess = updates.ownerWebFullAccess;

  const tx = [
    prisma.rfAppConfig.upsert({
      where: { key: KEY_DISCORD_BOT_INVITE_ENABLED },
      create: { key: KEY_DISCORD_BOT_INVITE_ENABLED, value: String(discordBotInviteEnabled) },
      update: { value: String(discordBotInviteEnabled) },
    }),
    prisma.rfAppConfig.upsert({
      where: { key: KEY_MAINTENANCE_MODE },
      create: { key: KEY_MAINTENANCE_MODE, value: String(maintenanceMode) },
      update: { value: String(maintenanceMode) },
    }),
    prisma.rfAppConfig.upsert({
      where: { key: KEY_STATUS_MESSAGE },
      create: { key: KEY_STATUS_MESSAGE, value: statusMessage },
      update: { value: statusMessage },
    }),
    prisma.rfAppConfig.upsert({
      where: { key: KEY_OWNER_WEB_FULL_ACCESS },
      create: { key: KEY_OWNER_WEB_FULL_ACCESS, value: String(ownerWebFullAccess) },
      update: { value: String(ownerWebFullAccess) },
    }),
  ];
  await prisma.$transaction(tx);
  return getAppConfig();
}
