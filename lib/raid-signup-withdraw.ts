import type { Prisma, PrismaClient } from '@prisma/client';
import {
  announceLayoutToStoredJson,
  parseStoredAnnouncedPlannerJson,
  type AnnounceRaidPayload,
} from '@/lib/raid-announce';
import { removeSignupIdsFromAnnouncePayload } from '@/lib/planner-roster-sanitize';
import { setConfirmedForPlacement } from '@/lib/raid-leader-placement';

export function moveSignupIdsToDeclineInAnnouncePayload(
  payload: AnnounceRaidPayload,
  signupIds: Iterable<string>,
  maxPlayers: number
): AnnounceRaidPayload {
  const idSet = new Set(signupIds);
  if (idSet.size === 0) return payload;

  const stripped = removeSignupIdsFromAnnouncePayload(payload, idSet, maxPlayers);
  const declineSeen = new Set(stripped.declineOrder);
  const declineOrder = [...stripped.declineOrder];
  for (const id of idSet) {
    if (!declineSeen.has(id)) {
      declineOrder.push(id);
      declineSeen.add(id);
    }
  }
  return { ...stripped, declineOrder };
}

async function patchPlannerJsonForRaid(
  prisma: PrismaClient,
  raidId: string,
  patch: (payload: AnnounceRaidPayload, maxPlayers: number) => AnnounceRaidPayload
): Promise<void> {
  const raid = await prisma.rfRaid.findUnique({
    where: { id: raidId },
    select: {
      maxPlayers: true,
      draftPlannerGroupsJson: true,
      announcedPlannerGroupsJson: true,
    },
  });
  if (!raid) return;

  const data: {
    draftPlannerGroupsJson?: Prisma.InputJsonValue | typeof Prisma.DbNull;
    announcedPlannerGroupsJson?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  } = {};

  const draft = parseStoredAnnouncedPlannerJson(raid.draftPlannerGroupsJson);
  if (draft) {
    const next = patch(draft, raid.maxPlayers);
    data.draftPlannerGroupsJson = announceLayoutToStoredJson(next, raid.maxPlayers);
  }

  const announced = parseStoredAnnouncedPlannerJson(raid.announcedPlannerGroupsJson);
  if (announced) {
    const next = patch(announced, raid.maxPlayers);
    data.announcedPlannerGroupsJson = announceLayoutToStoredJson(next, raid.maxPlayers);
  }

  if (Object.keys(data).length > 0) {
    await prisma.rfRaid.update({ where: { id: raidId }, data });
  }
}

/** Abmeldung: Signup komplett aus Planer-JSON entfernen (nicht in Absage-Block). */
export async function removeSignupIdsFromPlannerStorage(
  prisma: PrismaClient,
  raidId: string,
  signupIds: string[]
): Promise<void> {
  if (signupIds.length === 0) return;
  const idSet = new Set(signupIds);
  await patchPlannerJsonForRaid(prisma, raidId, (payload, maxPlayers) =>
    removeSignupIdsFromAnnouncePayload(payload, idSet, maxPlayers)
  );
}

/**
 * „Nicht da“: Spieler bleibt im Raid (type/originalSignupType = declined), Planer-JSON → Absage-Block.
 */
export async function markSignupWithdrawnInPlannerStorage(
  prisma: PrismaClient,
  raidId: string,
  signupIds: string[]
): Promise<void> {
  if (signupIds.length === 0) return;
  await patchPlannerJsonForRaid(prisma, raidId, (payload, maxPlayers) =>
    moveSignupIdsToDeclineInAnnouncePayload(payload, signupIds, maxPlayers)
  );
}

export async function withdrawRaidSignupRows(
  prisma: PrismaClient,
  args: {
    raidId: string;
    signupIds: string[];
    changedByUserId: string;
    guildId: string;
    /** Bei angekündigtem Kader: setConfirmed zurücksetzen */
    clearConfirmed?: boolean;
    /** true = Abmelden (Zeile löschen), false = „Nicht da“ (declined behalten) */
    asUnregister?: boolean;
  }
): Promise<void> {
  const { raidId, signupIds, changedByUserId, guildId, clearConfirmed = true, asUnregister = true } = args;
  if (signupIds.length === 0) return;

  const { logRaidSignupAudit, snapshotSignup } = await import('@/lib/raid-signup-audit');

  const rows = await prisma.rfRaidSignup.findMany({
    where: { id: { in: signupIds }, raidId },
  });

  if (asUnregister) {
    await removeSignupIdsFromPlannerStorage(prisma, raidId, signupIds);
    for (const prev of rows) {
      const prevSnap = snapshotSignup(prev as unknown as Record<string, unknown>);
      await logRaidSignupAudit({
        signupId: prev.id,
        raidId,
        guildId,
        changedByUserId,
        action: 'signup_delete',
        oldValue: prevSnap,
        newValue: null,
      });
      await prisma.rfRaidSignup.delete({ where: { id: prev.id } });
    }
    return;
  }

  for (const prev of rows) {
    const prevSnap = snapshotSignup(prev as unknown as Record<string, unknown>);
    const updated = await prisma.rfRaidSignup.update({
      where: { id: prev.id },
      data: {
        type: 'declined',
        originalSignupType: 'declined',
        leaderPlacement: 'signup',
        ...(clearConfirmed ? { setConfirmed: false } : {}),
      },
    });
    await logRaidSignupAudit({
      signupId: prev.id,
      raidId,
      guildId,
      changedByUserId,
      action: 'signup_withdraw',
      oldValue: prevSnap,
      newValue: snapshotSignup(updated as unknown as Record<string, unknown>),
    });
  }

  await markSignupWithdrawnInPlannerStorage(prisma, raidId, signupIds);
}

/** Effektiv-Status nach User-Änderung (offen: type = original; angekündigt: type separat). */
export function effectiveTypeForSelfSignup(
  raidStatus: string,
  typeNorm: string
): { type: string; originalSignupType: string } {
  const normalized = typeNorm;
  if (raidStatus === 'open') {
    return { type: normalized, originalSignupType: normalized };
  }
  return { type: normalized, originalSignupType: normalized };
}

export function leaderPlacementAfterWithdraw(): string {
  return 'signup';
}

export function setConfirmedAfterWithdraw(): boolean {
  return setConfirmedForPlacement('signup');
}
