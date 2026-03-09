/**
 * Discord-Rollen für RaidFlow: Abfrage der Rollen eines Members auf einem Server
 * (über Bot-Token) und Zuordnung zu RaidFlow-Rollen (Gildenmeister, Raidleader, Raider, Raidgruppe).
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export type RaidFlowRole = 'guildmaster' | 'raidleader' | 'raider';

export interface ResolvedGuildRole {
  role: RaidFlowRole;
  raidGroupId: string | null;
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

/**
 * Holt die Discord-Rollen-IDs eines Members auf einem Guild (über Bot-Token).
 */
export async function getMemberRoleIds(
  discordGuildId: string,
  discordUserId: string
): Promise<string[]> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return [];

  const res = await fetch(
    `${DISCORD_API_BASE}/guilds/${discordGuildId}/members/${discordUserId}`,
    { headers: { Authorization: `Bot ${botToken}` } }
  );

  if (res.status === 404 || !res.ok) return [];
  const data = (await res.json()) as { roles?: string[] };
  return data.roles ?? [];
}

/**
 * Mappt Discord-Rollen-IDs auf RaidFlow-Rolle (höchste) und optionale Raidgruppe.
 */
export function resolveRaidFlowRole(
  guild: RfGuildWithRoles,
  discordRoleIds: string[]
): ResolvedGuildRole | null {
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

  for (const rg of guild.raidGroups) {
    if (rg.discordRoleId && set.has(rg.discordRoleId)) {
      raidGroupId = rg.id;
      break;
    }
  }

  if (!role) return null;
  return { role, raidGroupId };
}
