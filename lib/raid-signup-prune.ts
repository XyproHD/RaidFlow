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

  const deleted = await prisma.rfRaidSignup.findMany({
    where: { userId, raidId: { in: raidIdsToPrune } },
    select: { id: true, raidId: true },
  });
  if (deleted.length === 0) return;

  await prisma.rfRaidSignup.deleteMany({
    where: { id: { in: deleted.map((d) => d.id) } },
  });

  const { purgeSignupIdsFromRaidPlannerStorage } = await import('@/lib/raid-planner-json-cleanup');
  const byRaid = new Map<string, string[]>();
  for (const row of deleted) {
    const list = byRaid.get(row.raidId) ?? [];
    list.push(row.id);
    byRaid.set(row.raidId, list);
  }
  for (const [raidId, ids] of byRaid) {
    await purgeSignupIdsFromRaidPlannerStorage(prisma, raidId, ids).catch((e) =>
      console.error('[prune signups] planner json cleanup:', e)
    );
  }

  for (const raidId of new Set(raidIdsToPrune)) {
    void syncRaidThreadSummary(raidId);
  }
}
