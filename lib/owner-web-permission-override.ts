import { prisma } from '@/lib/prisma';
import type { AppConfigState } from '@/lib/app-config';
import { getAppConfig } from '@/lib/app-config';

/** Wie in `rf_user_guild.role` (Web-Perspektive inkl. Override). */
export type WebGuildRole = 'guildmaster' | 'raidleader' | 'raider' | 'member';

/**
 * Wenn aktiv: die feste App-Owner-Discord-ID wird in der Web-App wie Gildenmeister behandelt,
 * sofern sie in einer Gilde mindestens Raider (oder Raidleiter) ist — unabhängig von der
 * zugewiesenen Discord-Rolle. Der Discord-Bot nutzt dieses Override nicht.
 */
export function applyOwnerWebFullAccessToRole(
  dbRole: WebGuildRole,
  discordId: string | null | undefined,
  config: Pick<AppConfigState, 'ownerDiscordId' | 'ownerWebFullAccess'>
): WebGuildRole {
  if (
    !config.ownerWebFullAccess ||
    !discordId ||
    !config.ownerDiscordId ||
    discordId !== config.ownerDiscordId
  ) {
    return dbRole;
  }
  if (dbRole === 'raider' || dbRole === 'raidleader') {
    return 'guildmaster';
  }
  return dbRole;
}

/**
 * Effektive Web-Rolle für API-/Seiten-Checks (inkl. Owner-Override).
 */
export async function getEffectiveWebUserGuildRole(
  userId: string,
  guildId: string
): Promise<WebGuildRole | null> {
  const [ug, user, config] = await Promise.all([
    prisma.rfUserGuild.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { role: true },
    }),
    prisma.rfUser.findUnique({ where: { id: userId }, select: { discordId: true } }),
    getAppConfig(),
  ]);
  if (!ug) return null;
  const r = ug.role as WebGuildRole;
  return applyOwnerWebFullAccessToRole(r, user?.discordId ?? null, config);
}
