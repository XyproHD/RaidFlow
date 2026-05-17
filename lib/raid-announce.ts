import { Prisma, type PrismaClient } from '@prisma/client';
import { parsePartySlotsFromStored, syncPartySlotsForGroup } from '@/lib/planner-party-slots';
import { logRaidSignupAudit, snapshotSignup } from '@/lib/raid-signup-audit';
import type { LeaderPlacement } from '@/lib/raid-leader-placement';
import {
  isPreservedAttendanceSignupType,
  normalizeSignupType,
  signupTypeNorm,
  type RaidSignupType,
} from '@/lib/raid-signup-constants';
export type AnnouncedGroupPayload = {
  rosterOrder: string[];
  raidLeaderUserId: string | null;
  lootmasterUserId: string | null;
  /** 5er-Gruppen: je Slot bis zu 5 Signup-IDs (Subset des Kaders). */
  partySlots?: string[][];
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
    const partySlots = parsePartySlotsFromStored(o.partySlots);
    groups.push({
      rosterOrder,
      raidLeaderUserId: rl,
      lootmasterUserId: lm,
      ...(partySlots ? { partySlots } : {}),
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
  type: string;
  forbidReserve: boolean;
};

export function leaderPlacementFromAnnounceLayout(
  signupId: string,
  payload: AnnounceRaidPayload
): LeaderPlacement {
  const onRoster = payload.groups.some((g) => g.rosterOrder.includes(signupId));
  if (onRoster) return 'confirmed';
  if (payload.reserveOrder.includes(signupId)) return 'substitute';
  return 'signup';
}

/** Typ nach Ankündigung/Planer-Layout — „uncertain“/„declined“ bleiben erhalten. */
export function resolveAnnouncedSignupType(params: {
  currentType: string;
  forbidReserve: boolean;
  leaderPlacement: LeaderPlacement;
}): RaidSignupType {
  if (params.forbidReserve) return 'declined';
  if (isPreservedAttendanceSignupType(params.currentType)) {
    return (normalizeSignupType(params.currentType) ??
      signupTypeNorm(params.currentType)) as RaidSignupType;
  }
  if (params.leaderPlacement === 'confirmed') return 'normal';
  return 'reserve';
}

export function setConfirmedForAnnouncedPlacement(
  leaderPlacement: LeaderPlacement,
  resolvedType: string
): boolean {
  if (isPreservedAttendanceSignupType(resolvedType)) return false;
  return leaderPlacement === 'confirmed';
}

export function buildAnnounceSignupUpdate(
  row: AnnounceSignupRow,
  payload: AnnounceRaidPayload
): { type: string; leaderPlacement: string; setConfirmed: boolean } {
  const leaderPlacement = leaderPlacementFromAnnounceLayout(row.id, payload);
  const type = resolveAnnouncedSignupType({
    currentType: row.type,
    forbidReserve: row.forbidReserve,
    leaderPlacement,
  });
  return {
    type,
    leaderPlacement,
    setConfirmed: setConfirmedForAnnouncedPlacement(leaderPlacement, type),
  };
}

/** DB-Feld `rf_raid.announced_planner_groups_json` (gleiche Struktur wie Announce-Payload ohne `action`). */
export function announceLayoutToStoredJson(payload: AnnounceRaidPayload): Prisma.InputJsonValue {
  return {
    groups: payload.groups.map((g) => {
      const partySlots = syncPartySlotsForGroup({
        rosterOrder: g.rosterOrder,
        partySlots: g.partySlots,
      });
      return {
        rosterOrder: g.rosterOrder,
        raidLeaderUserId: g.raidLeaderUserId,
        lootmasterUserId: g.lootmasterUserId,
        partySlots,
      };
    }),
    reserveOrder: payload.reserveOrder,
  };
}

export function validateAnnouncePayloadAgainstKnownIds(
  payload: AnnounceRaidPayload,
  knownSignupIds: Set<string>
): { ok: true } | { ok: false; error: string; status: number } {
  for (const g of payload.groups) {
    for (const id of g.rosterOrder) {
      if (!knownSignupIds.has(id)) {
        return { ok: false, error: 'Unknown signup id in roster', status: 400 };
      }
    }
  }
  for (const id of payload.reserveOrder) {
    if (!knownSignupIds.has(id)) {
      return { ok: false, error: 'Unknown signup id in reserveOrder', status: 400 };
    }
  }
  return { ok: true };
}

export async function executeRaidAnnounceTransaction(args: {
  prisma: PrismaClient;
  raidId: string;
  guildId: string;
  changedByUserId: string;
  payload: AnnounceRaidPayload;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { prisma, raidId, guildId, changedByUserId, payload } = args;

  /** Einmal laden: Validierung + Audit-Vorher + keine findUnique-Schleife in der Transaktion (Vercel/5s-Timeout). */
  const signupRows = await prisma.rfRaidSignup.findMany({ where: { raidId } });
  const known = new Set(signupRows.map((s) => s.id));
  const idCheck = validateAnnouncePayloadAgainstKnownIds(payload, known);
  if (!idCheck.ok) return idCheck;

  await prisma.$transaction(
    async (tx) => {
      for (const prev of signupRows) {
        const next = buildAnnounceSignupUpdate(
          { id: prev.id, type: prev.type, forbidReserve: prev.forbidReserve },
          payload
        );
        await tx.rfRaidSignup.update({
          where: { id: prev.id },
          data: {
            type: next.type,
            leaderPlacement: next.leaderPlacement,
            setConfirmed: next.setConfirmed,
          },
        });
      }

      await tx.rfRaid.update({
        where: { id: raidId },
        data: {
          status: 'announced',
          announcedPlannerGroupsJson: announceLayoutToStoredJson(payload),
          draftPlannerGroupsJson:     Prisma.DbNull,
        },
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  for (const prev of signupRows) {
    const next = buildAnnounceSignupUpdate(
      { id: prev.id, type: prev.type, forbidReserve: prev.forbidReserve },
      payload
    );
    const prevSnap = snapshotSignup(prev as unknown as Record<string, unknown>);
    const merged = {
      ...(prev as unknown as Record<string, unknown>),
      type: next.type,
      leaderPlacement: next.leaderPlacement,
      setConfirmed: next.setConfirmed,
    };
    await logRaidSignupAudit({
      signupId: prev.id,
      raidId,
      guildId,
      changedByUserId,
      action: 'raid_announce_placement',
      oldValue: prevSnap,
      newValue: snapshotSignup(merged),
    });
  }

  return { ok: true };
}
