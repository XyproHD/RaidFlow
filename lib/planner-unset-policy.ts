import type { LeaderPlacement } from '@/lib/raid-leader-placement';

export type UnsetPlayersMode = 'reserve' | 'decline';

export function parseUnsetPlayersMode(raw: unknown): UnsetPlayersMode | undefined {
  if (raw === 'reserve' || raw === 'decline') return raw;
  return undefined;
}

/** Platzierung für Speichern/Ankündigen aus Kader, Ersatzbank, Absage-Block und Raid-Option. */
export function leaderPlacementForPlannerSlot(params: {
  onRoster: boolean;
  onReserveBench: boolean;
  onDeclineBlock: boolean;
  forbidReserve: boolean;
  unsetPlayersMode: UnsetPlayersMode;
}): LeaderPlacement {
  if (params.onRoster) return 'confirmed';
  if (params.onDeclineBlock) return 'signup';
  if (params.onReserveBench) return 'substitute';
  if (params.unsetPlayersMode === 'decline') return 'signup';
  if (params.forbidReserve) return 'signup';
  return 'substitute';
}

/** Raid-Option + Absage-Block: Reserve- und Absage-Listen vor dem Speichern ableiten. */
export function applyPlannerUnsetPolicy(params: {
  allSignupIds: string[];
  rosterIdSet: Set<string>;
  reserveOrder: string[];
  declineOrder: string[];
  forbidReserveById: Map<string, boolean>;
  unsetPlayersMode: UnsetPlayersMode;
}): { reserveOrder: string[]; declineOrder: string[] } {
  const declineSet = new Set(
    params.declineOrder.filter((id) => !params.rosterIdSet.has(id))
  );
  const reserveOut: string[] = [];
  const reserveSeen = new Set<string>();

  for (const id of params.reserveOrder) {
    if (params.rosterIdSet.has(id) || declineSet.has(id)) continue;
    if (reserveSeen.has(id)) continue;
    reserveOut.push(id);
    reserveSeen.add(id);
  }

  const declineOut = [...declineSet];

  for (const id of params.allSignupIds) {
    if (params.rosterIdSet.has(id)) continue;
    if (declineSet.has(id)) continue;
    if (reserveSeen.has(id)) continue;

    if (params.unsetPlayersMode === 'decline' || params.forbidReserveById.get(id)) {
      declineOut.push(id);
      declineSet.add(id);
      continue;
    }

    reserveOut.push(id);
    reserveSeen.add(id);
  }

  return { reserveOrder: reserveOut, declineOrder: declineOut };
}

/** @deprecated Prefer applyPlannerUnsetPolicy — behält Abwärtskompatibilität. */
export function appendUnsetPlayersToReserveOrder(params: {
  allSignupIds: string[];
  rosterIdSet: Set<string>;
  reserveOrder: string[];
  forbidReserveById: Map<string, boolean>;
  unsetPlayersMode: UnsetPlayersMode;
  declineOrder?: string[];
}): string[] {
  return applyPlannerUnsetPolicy({
    allSignupIds: params.allSignupIds,
    rosterIdSet: params.rosterIdSet,
    reserveOrder: params.reserveOrder,
    declineOrder: params.declineOrder ?? [],
    forbidReserveById: params.forbidReserveById,
    unsetPlayersMode: params.unsetPlayersMode,
  }).reserveOrder;
}
