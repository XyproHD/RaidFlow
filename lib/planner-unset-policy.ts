import type { LeaderPlacement } from '@/lib/raid-leader-placement';

export type UnsetPlayersMode = 'reserve' | 'decline';

export function parseUnsetPlayersMode(raw: unknown): UnsetPlayersMode | undefined {
  if (raw === 'reserve' || raw === 'decline') return raw;
  return undefined;
}

/** Platzierung für Speichern/Ankündigen aus Kader, Ersatzbank und Raid-Option. */
export function leaderPlacementForPlannerSlot(params: {
  onRoster: boolean;
  onReserveBench: boolean;
  forbidReserve: boolean;
  unsetPlayersMode: UnsetPlayersMode;
}): LeaderPlacement {
  if (params.onRoster) return 'confirmed';
  if (params.onReserveBench) return 'substitute';
  if (params.unsetPlayersMode === 'decline') return 'signup';
  if (params.forbidReserve) return 'signup';
  return 'substitute';
}

/** Nicht gesetzte Spieler in die Ersatzbank übernehmen (Modus „Als Reserve“). */
export function appendUnsetPlayersToReserveOrder(params: {
  allSignupIds: string[];
  rosterIdSet: Set<string>;
  reserveOrder: string[];
  forbidReserveById: Map<string, boolean>;
  unsetPlayersMode: UnsetPlayersMode;
}): string[] {
  const out = [...params.reserveOrder];
  const inReserve = new Set(out);
  for (const id of params.allSignupIds) {
    if (params.rosterIdSet.has(id) || inReserve.has(id)) continue;
    if (params.unsetPlayersMode === 'decline') continue;
    if (params.forbidReserveById.get(id)) continue;
    out.push(id);
    inReserve.add(id);
  }
  return out;
}
