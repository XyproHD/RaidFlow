import type { Prisma, PrismaClient } from '@prisma/client';
import { announceLayoutToStoredJson, parseStoredAnnouncedPlannerJson } from '@/lib/raid-announce';
import {
  removeSignupIdsFromAnnouncePayload,
  sanitizeAnnounceRaidPayload,
  type PlannerSanitizeResult,
} from '@/lib/planner-roster-sanitize';

/**
 * Entfernt gelöschte Signup-IDs aus Draft- und Ankündigungs-Planer-JSON am Raid.
 */
export async function purgeSignupIdsFromRaidPlannerStorage(
  prisma: PrismaClient,
  raidId: string,
  removedSignupIds: string[]
): Promise<void> {
  if (removedSignupIds.length === 0) return;

  const raid = await prisma.rfRaid.findUnique({
    where: { id: raidId },
    select: {
      maxPlayers: true,
      draftPlannerGroupsJson: true,
      announcedPlannerGroupsJson: true,
    },
  });
  if (!raid) return;

  const removeSet = new Set(removedSignupIds);
  const maxPlayers = raid.maxPlayers;
  const data: {
    draftPlannerGroupsJson?: Prisma.InputJsonValue | typeof Prisma.DbNull;
    announcedPlannerGroupsJson?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  } = {};

  const draft = parseStoredAnnouncedPlannerJson(raid.draftPlannerGroupsJson);
  if (draft) {
    const next = removeSignupIdsFromAnnouncePayload(draft, removeSet, maxPlayers);
    data.draftPlannerGroupsJson = announceLayoutToStoredJson(next, maxPlayers);
  }

  const announced = parseStoredAnnouncedPlannerJson(raid.announcedPlannerGroupsJson);
  if (announced) {
    const next = removeSignupIdsFromAnnouncePayload(announced, removeSet, maxPlayers);
    data.announcedPlannerGroupsJson = announceLayoutToStoredJson(next, maxPlayers);
  }

  if (Object.keys(data).length > 0) {
    await prisma.rfRaid.update({ where: { id: raidId }, data });
  }
}

export async function sanitizeRaidPlannerStorageAgainstSignups(
  prisma: PrismaClient,
  raidId: string
): Promise<PlannerSanitizeResult | null> {
  const [raid, signupRows] = await Promise.all([
    prisma.rfRaid.findUnique({
      where: { id: raidId },
      select: {
        maxPlayers: true,
        draftPlannerGroupsJson: true,
        announcedPlannerGroupsJson: true,
        status: true,
      },
    }),
    prisma.rfRaidSignup.findMany({ where: { raidId }, select: { id: true } }),
  ]);
  if (!raid) return null;

  const known = new Set(signupRows.map((s) => s.id));
  const maxPlayers = raid.maxPlayers;
  const combinedRemoved: PlannerSanitizeResult['removed'] = [];
  let combinedPayload: PlannerSanitizeResult['payload'] | null = null;
  let hadInvalid = false;

  const data: {
    draftPlannerGroupsJson?: Prisma.InputJsonValue | typeof Prisma.DbNull;
    announcedPlannerGroupsJson?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  } = {};

  const draft = parseStoredAnnouncedPlannerJson(raid.draftPlannerGroupsJson);
  if (draft) {
    const s = sanitizeAnnounceRaidPayload(draft, known, maxPlayers);
    if (s.hadInvalid) {
      hadInvalid = true;
      combinedRemoved.push(...s.removed);
      combinedPayload = s.payload;
      data.draftPlannerGroupsJson = announceLayoutToStoredJson(s.payload, maxPlayers);
    }
  }

  const announced = parseStoredAnnouncedPlannerJson(raid.announcedPlannerGroupsJson);
  if (announced) {
    const s = sanitizeAnnounceRaidPayload(announced, known, maxPlayers);
    if (s.hadInvalid) {
      hadInvalid = true;
      combinedRemoved.push(...s.removed);
      if (!combinedPayload) combinedPayload = s.payload;
      data.announcedPlannerGroupsJson = announceLayoutToStoredJson(s.payload, maxPlayers);
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.rfRaid.update({ where: { id: raidId }, data });
  }

  if (!hadInvalid) return null;
  return {
    payload: combinedPayload ?? { groups: [], reserveOrder: [], declineOrder: [] },
    removed: combinedRemoved,
    hadInvalid: true,
  };
}
