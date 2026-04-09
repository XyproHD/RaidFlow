/**
 * App-Konfiguration: Owner, Whitelist/Blacklist (rf_app_config).
 * Nur eine von Whitelist/Blacklist ist aktiv.
 */

import { prisma } from '@/lib/prisma';

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
const KEY_DISCORD_EMOJIS = 'discord_emojis';

export interface AppConfigState {
  ownerDiscordId: string | null;
  useWhitelist: boolean;
  useBlacklist: boolean;
  serverWhitelist: string[];
  serverBlacklist: string[];
  discordBotInviteEnabled: boolean;
  maintenanceMode: boolean;
  statusMessage: string;
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
  discordEmojis: {},
};

async function getConfigValue(key: string): Promise<string | null> {
  const row = await prisma.rfAppConfig.findUnique({ where: { key } });
  return row?.value ?? null;
}

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

/** Lädt die komplette App-Config (Owner, Whitelist/Blacklist, Bot-Einladung, Wartungsmodus). */
export async function getAppConfig(): Promise<AppConfigState> {
  const [
    owner,
    useWhitelist,
    useBlacklist,
    whitelistRaw,
    blacklistRaw,
    discordBotInviteEnabled,
    maintenanceMode,
    statusMessage,
    discordEmojisRaw,
  ] = await Promise.all([
    getConfigValue(KEY_OWNER),
    getConfigValue(KEY_USE_WHITELIST),
    getConfigValue(KEY_USE_BLACKLIST),
    getConfigValue(KEY_SERVER_WHITELIST),
    getConfigValue(KEY_SERVER_BLACKLIST),
    getConfigValue(KEY_DISCORD_BOT_INVITE_ENABLED),
    getConfigValue(KEY_MAINTENANCE_MODE),
    getConfigValue(KEY_STATUS_MESSAGE),
    getConfigValue(KEY_DISCORD_EMOJIS),
  ]);
  return {
    ownerDiscordId: OWNER_DISCORD_ID,
    useWhitelist: useWhitelist === 'true',
    useBlacklist: useBlacklist === 'true',
    serverWhitelist: parseJsonArray(whitelistRaw),
    serverBlacklist: parseJsonArray(blacklistRaw),
    discordBotInviteEnabled: discordBotInviteEnabled !== 'false',
    maintenanceMode: maintenanceMode === 'true',
    statusMessage: statusMessage ?? '',
    discordEmojis: parseJsonStringRecord(discordEmojisRaw),
  };
}

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
}): Promise<AppConfigState> {
  const config = await getAppConfig();
  let discordBotInviteEnabled = config.discordBotInviteEnabled;
  let maintenanceMode = config.maintenanceMode;
  let statusMessage = config.statusMessage;

  if (updates.discordBotInviteEnabled !== undefined) discordBotInviteEnabled = updates.discordBotInviteEnabled;
  if (updates.maintenanceMode !== undefined) maintenanceMode = updates.maintenanceMode;
  if (updates.statusMessage !== undefined) statusMessage = updates.statusMessage;

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
  ];
  await prisma.$transaction(tx);
  return getAppConfig();
}
