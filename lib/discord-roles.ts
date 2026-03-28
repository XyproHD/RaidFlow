/**
 * Discord-Rollen für RaidFlow: Abfrage der Rollen eines Members auf einem Server
 * (über Bot-Token) und Zuordnung zu RaidFlow-Rollen (Gildenmeister, Raidleader, Raider, Raidgruppe).
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export type RaidFlowRole = 'guildmaster' | 'raidleader' | 'raider';

export interface ResolvedGuildRole {
  role: RaidFlowRole;
  /** Erste gefundene Raidgruppe (Legacy). */
  raidGroupId: string | null;
  /** Alle Raidgruppen-Rollen, die der User auf Discord hat. */
  raidGroupIds: string[];
}

export interface RfGuildWithRoles {
  id: string;
  discordGuildId: string;
  name: string;
  discordRoleGuildmasterId: string | null;
  discordRoleRaidleaderId: string | null;
  discordRoleRaiderId: string | null;
  raidGroups: Array<{ id: string; discordRoleId: string | null }>;
}

export interface MemberRolesResult {
  roleIds: string[];
  inGuild: boolean;
  /** Wie der User auf diesem Discord-Server angezeigt wird (Server-Nickname oder globaler Name). */
  displayNameInGuild: string | null;
  /**
   * true nur wenn die Discord-API eine klare Antwort geliefert hat (200 = Mitglied, 404 = kein Mitglied).
   * false bei fehlendem Bot-Token oder Request-Fehler — dann weder Namen setzen noch löschen.
   */
  membershipKnown: boolean;
}

/**
 * Parst die Discord-API-Antwort GET /guilds/.../members/... (Guild-Member-Objekt).
 */
export function discordDisplayNameFromGuildMemberPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as { nick?: unknown; user?: unknown };
  const nickRaw = m.nick;
  if (typeof nickRaw === 'string') {
    const nick = nickRaw.trim();
    if (nick) return nick;
  }
  const u = m.user;
  if (!u || typeof u !== 'object') return null;
  const user = u as { global_name?: unknown; username?: unknown; discriminator?: unknown };
  const globalName = typeof user.global_name === 'string' ? user.global_name.trim() : '';
  if (globalName) return globalName;
  const username = typeof user.username === 'string' ? user.username : '';
  const disc = typeof user.discriminator === 'string' ? user.discriminator : '0';
  if (username && disc && disc !== '0') return `${username}#${disc}`;
  return username || null;
}

/**
 * Holt die Discord-Rollen-IDs eines Members auf einem Guild (über Bot-Token).
 * inGuild: false = User ist nicht Mitglied des Servers (404); true = Mitglied (evtl. ohne Rollen).
 */
export async function getMemberRoleIds(
  discordGuildId: string,
  discordUserId: string
): Promise<MemberRolesResult> {
  const unknown: MemberRolesResult = {
    roleIds: [],
    inGuild: false,
    displayNameInGuild: null,
    membershipKnown: false,
  };
  try {
    // Pro Deployment (Preview vs Production) der Token der jeweiligen Discord-Application.
    // Derselbe Bot muss auf dem Ziel-Server eingeladen sein; Preview-Webapp → Preview-Bot-Token usw.
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return unknown;

    const res = await fetch(
      `${DISCORD_API_BASE}/guilds/${discordGuildId}/members/${discordUserId}`,
      { headers: { Authorization: `Bot ${botToken}` } }
    );

    if (res.status === 404) {
      return { roleIds: [], inGuild: false, displayNameInGuild: null, membershipKnown: true };
    }
    if (!res.ok) return unknown;
    const data = (await res.json()) as { roles?: string[] };
    const displayNameInGuild = discordDisplayNameFromGuildMemberPayload(data);
    return {
      roleIds: data.roles ?? [],
      inGuild: true,
      displayNameInGuild,
      membershipKnown: true,
    };
  } catch {
    return unknown;
  }
}

/**
 * Mappt Discord-Rollen-IDs auf RaidFlow-Rolle (höchste) und optionale Raidgruppe.
 */
export function resolveRaidFlowRole(
  guild: RfGuildWithRoles,
  discordRoleIds: string[]
): ResolvedGuildRole | null {
  // Note: callers use empty array when user is not in guild
  const set = new Set(discordRoleIds);
  let role: RaidFlowRole | null = null;
  let raidGroupId: string | null = null;

  if (guild.discordRoleGuildmasterId && set.has(guild.discordRoleGuildmasterId)) {
    role = 'guildmaster';
  }
  if (guild.discordRoleRaidleaderId && set.has(guild.discordRoleRaidleaderId)) {
    if (!role) role = 'raidleader';
  }
  if (guild.discordRoleRaiderId && set.has(guild.discordRoleRaiderId)) {
    if (!role) role = 'raider';
  }

  const raidGroupIds: string[] = [];
  for (const rg of guild.raidGroups) {
    if (rg.discordRoleId && set.has(rg.discordRoleId)) {
      raidGroupIds.push(rg.id);
      if (raidGroupId == null) raidGroupId = rg.id;
    }
  }

  if (!role) return null;
  return { role, raidGroupId, raidGroupIds };
}
