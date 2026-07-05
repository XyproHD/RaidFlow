/**
 * Entfernt Raid-Anmeldungen, wenn der User für die betreffenden **offenen** Raids
 * (status `open`) der Gilde nach aktuellem DB-Stand keine Berechtigung mehr hat
 * (Server verlassen, nur noch `member`, oder Raidgruppen-Einschränkung nicht erfüllt).
 *
 * Gast-Signups auf `allowGuests`-Raids ohne Gruppen-Restriction bleiben, solange
 * der User Discord-Mitglied ohne Raider-Rolle ist. Verliert der User die Gast-
 * Berechtigung (Server verlassen oder Raider-Rolle), werden auch Gast-Signups entfernt.
 */

import { prisma } from '@/lib/prisma';
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';
import { raidAllowsGuestAccess } from '@/lib/guest-raid-access';

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

function guestSignupMayStay(
  raid: { allowGuests: boolean; raidGroupRestrictionId: string | null },
  stillDiscordGuest: boolean
): boolean {
  return stillDiscordGuest && raidAllowsGuestAccess(raid);
}

/**
 * Löscht alle Signups des Users zu **offenen** Raids dieser Gilde, für die er nicht mehr teilnehmen darf.
 * Triggert Thread-Zusammenfassung pro betroffenem Raid (best effort).
 *
 * @param stillDiscordGuest true wenn User auf dem Discord-Server ist, aber keine Raider/RL/GM-Rolle hat
 */
export async function pruneIneligibleOpenRaidSignups(
  userId: string,
  guildId: string,
  stillDiscordGuest = false
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
      select: {
        id: true,
        allowGuests: true,
        raidGroupRestrictionId: true,
      },
    }),
  ]);

  const raidGroupIds = member?.memberRaidGroups.map((r) => r.raidGroupId) ?? [];
  const role = ug?.role ?? null;

  const raidIdsToPrune = openRaids
    .filter((raid) => {
      if (userEligibleForOpenRaid(role, raidGroupIds, raid.raidGroupRestrictionId)) {
        return false;
      }
      if (guestSignupMayStay(raid, stillDiscordGuest)) {
        return false;
      }
      return true;
    })
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
