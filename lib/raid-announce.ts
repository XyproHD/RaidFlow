import type { Prisma, PrismaClient } from '@prisma/client';
import { logRaidSignupAudit, snapshotSignup } from '@/lib/raid-signup-audit';
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';

export type AnnouncedGroupPayload = {
  rosterOrder: string[];
  raidLeaderUserId: string | null;
  lootmasterUserId: string | null;
};

export type AnnounceRaidPayload = {
  groups: AnnouncedGroupPayload[];
  reserveOrder: string[];
};

export type AnnounceParseResult =
  | { ok: true; data: AnnounceRaidPayload }
  | { ok: false; error: string; status: number };

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Client → PATCH action announce (nach gültigem Planner-Layout). */
export function parseAnnounceRaidPayload(body: Record<string, unknown>): AnnounceParseResult {
  const groupsRaw = body.groups;
  if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) {
    return { ok: false, error: 'groups must be a non-empty array', status: 400 };
  }
  const groups: AnnouncedGroupPayload[] = [];
  for (const g of groupsRaw) {
    if (!g || typeof g !== 'object') {
      return { ok: false, error: 'Invalid group entry', status: 400 };
    }
    const o = g as Record<string, unknown>;
    const ordRaw = o.rosterOrder;
    if (!Array.isArray(ordRaw)) {
      return { ok: false, error: 'Each group needs rosterOrder[]', status: 400 };
    }
    const rosterOrder = ordRaw
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter(Boolean);
    const rl = asTrimmedString(o.raidLeaderUserId);
    const lm = asTrimmedString(o.lootmasterUserId);
    groups.push({
      rosterOrder,
      raidLeaderUserId: rl,
      lootmasterUserId: lm,
    });
  }

  const resRaw = body.reserveOrder;
  if (!Array.isArray(resRaw)) {
    return { ok: false, error: 'reserveOrder must be an array', status: 400 };
  }
  const reserveOrder = resRaw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter(Boolean);

  const rosterSet = new Set<string>();
  for (const g of groups) {
    for (const id of g.rosterOrder) {
      if (rosterSet.has(id)) {
        return { ok: false, error: 'Duplicate signup id in roster groups', status: 400 };
      }
      rosterSet.add(id);
    }
  }
  for (const id of reserveOrder) {
    if (rosterSet.has(id)) {
      return { ok: false, error: 'Signup cannot be both on roster and reserve list', status: 400 };
    }
  }
  const resSet = new Set<string>();
  for (const id of reserveOrder) {
    if (resSet.has(id)) {
      return { ok: false, error: 'Duplicate id in reserveOrder', status: 400 };
    }
    resSet.add(id);
  }

  return { ok: true, data: { groups, reserveOrder } };
}

/** Server-JSON aus rf_raid.announced_planner_groups_json → gleiches Format wie Announce-Payload. */
export function parseStoredAnnouncedPlannerJson(raw: unknown): AnnounceRaidPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = parseAnnounceRaidPayload(raw as Record<string, unknown>);
  return parsed.ok ? parsed.data : null;
}

export type AnnounceSignupRow = {
  id: string;
  forbidReserve: boolean;
};

export function buildAnnounceSignupUpdate(
  row: AnnounceSignupRow,
  payload: AnnounceRaidPayload
): { type: string; leaderPlacement: string; setConfirmed: boolean } {
  if (row.forbidReserve) {
    return { type: 'declined', leaderPlacement: 'signup', setConfirmed: false };
  }
  const rosterFlat = payload.groups.flatMap((g) => g.rosterOrder);
  if (rosterFlat.includes(row.id)) {
    return { type: 'normal', leaderPlacement: 'confirmed', setConfirmed: true };
  }
  if (payload.reserveOrder.includes(row.id)) {
    return { type: 'reserve', leaderPlacement: 'substitute', setConfirmed: false };
  }
  return { type: 'reserve', leaderPlacement: 'substitute', setConfirmed: false };
}

const announcedJsonValue = (payload: AnnounceRaidPayload): Prisma.InputJsonValue => ({
  groups: payload.groups.map((g) => ({
    rosterOrder: g.rosterOrder,
    raidLeaderUserId: g.raidLeaderUserId,
    lootmasterUserId: g.lootmasterUserId,
  })),
  reserveOrder: payload.reserveOrder,
});

export async function executeRaidAnnounceTransaction(args: {
  prisma: PrismaClient;
  raidId: string;
  guildId: string;
  changedByUserId: string;
  payload: AnnounceRaidPayload;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { prisma, raidId, guildId, changedByUserId, payload } = args;

  const signups = await prisma.rfRaidSignup.findMany({
    where: { raidId },
    select: { id: true, forbidReserve: true },
  });

  const known = new Set(signups.map((s) => s.id));
  for (const g of payload.groups) {
    for (const id of g.rosterOrder) {
      if (!known.has(id)) {
        return { ok: false, error: 'Unknown signup id in roster', status: 400 };
      }
    }
  }
  for (const id of payload.reserveOrder) {
    if (!known.has(id)) {
      return { ok: false, error: 'Unknown signup id in reserveOrder', status: 400 };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const row of signups) {
      const next = buildAnnounceSignupUpdate(row, payload);
      const prev = await tx.rfRaidSignup.findUnique({ where: { id: row.id } });
      if (!prev) continue;
      const prevSnap = snapshotSignup(prev);
      const updated = await tx.rfRaidSignup.update({
        where: { id: row.id },
        data: {
          type: next.type,
          leaderPlacement: next.leaderPlacement,
          setConfirmed: next.setConfirmed,
        },
      });
      await logRaidSignupAudit({
        signupId: row.id,
        raidId,
        guildId,
        changedByUserId,
        action: 'raid_announce_placement',
        oldValue: prevSnap,
        newValue: snapshotSignup(updated),
      });
    }

    await tx.rfRaid.update({
      where: { id: raidId },
      data: {
        status: 'announced',
        announcedPlannerGroupsJson: announcedJsonValue(payload),
      },
    });
  });

  void syncRaidThreadSummary(raidId);
  return { ok: true };
}
