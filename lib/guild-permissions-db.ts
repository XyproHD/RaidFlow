/**
 * Rechteprüfungen ausschließlich gegen die DB-Spiegelung (rf_user_guild).
 * Voraussetzung: Synchronisation durch den Discord-Bot (und einmaliger Bootstrap).
 */

import { prisma } from '@/lib/prisma';

/** Mindestens Raider-Rolle (oder höher); geeignet für Raidleiter-/Lootmeister-Validierung. */
export async function userHasRaidflowParticipationInGuild(
  userId: string,
  guildId: string
): Promise<boolean> {
  const ug = await prisma.rfUserGuild.findUnique({
    where: { userId_guildId: { userId, guildId } },
    select: { role: true },
  });
  return !!(ug && ug.role !== 'member');
}
