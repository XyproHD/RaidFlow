/**
 * Entfernt Raid-Anmeldungen, wenn der User für die betreffenden **offenen** Raids
 * (status `open`) der Gilde nach aktuellem DB-Stand keine Berechtigung mehr hat
 * (Server verlassen, nur noch `member`, oder Raidgruppen-Einschränkung nicht erfüllt).
 */

import { prisma } from '@/lib/prisma';
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';

function userEligibleForOpenRaid(
  role: string | null | undefined,
  raidGroupIds: string[],
  raidGroupRestrictionId: string | null
): boolean {
  if (!role || role === 'member') return false;
  if (raidGroupRestrictionId) {
    const inGroup = raidGroupIds.includes(raidGroupRestrictionId);
    const canManage = role === 'guildmaster' || role === 'raidleader';
    return inGroup || canManage;
  }
  return true;
}

/**
 * Löscht alle Signups des Users zu **offenen** Raids dieser Gilde, für die er nicht mehr teilnehmen darf.
 * Triggert Thread-Zusammenfassung pro betroffenem Raid (best effort).
 */
export async function pruneIneligibleOpenRaidSignups(
  userId: string,
  guildId: string
): Promise<void> {
  const [ug, member, openRaids] = await Promise.all([
    prisma.rfUserGuild.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { role: true },
    }),
    prisma.rfGuildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
      include: { memberRaidGroups: { select: { raidGroupId: true } } },
    }),
    prisma.rfRaid.findMany({
      where: { guildId, status: 'open' },
      select: { id: true, raidGroupRestrictionId: true },
    }),
  ]);

  const raidGroupIds = member?.memberRaidGroups.map((r) => r.raidGroupId) ?? [];
  const role = ug?.role ?? null;

  const raidIdsToPrune = openRaids
    .filter((raid) => !userEligibleForOpenRaid(role, raidGroupIds, raid.raidGroupRestrictionId))
    .map((r) => r.id);

  if (raidIdsToPrune.length === 0) return;

  await prisma.rfRaidSignup.deleteMany({
    where: { userId, raidId: { in: raidIdsToPrune } },
  });

  for (const raidId of new Set(raidIdsToPrune)) {
    void syncRaidThreadSummary(raidId);
  }
}
