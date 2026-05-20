/** WoW-Party-Größe im Raid-Planer (5er-Gruppen innerhalb einer Raid-Gruppe). */
export const PLANNER_PARTY_SIZE = 5;

export const PARTY_SLOT_EMPTY = '';

/** Anzahl 5er-Reihen für eine Raid-Gruppe (immer alle Slots sichtbar). */
export function partySlotCountForMaxPlayers(maxPlayers: number): number {
  const max = Math.max(1, maxPlayers);
  return Math.ceil(max / PLANNER_PARTY_SIZE);
}

export function rosterOrderFromPartySlots(partySlots: string[][]): string[] {
  return partySlots.flatMap((row) =>
    row.filter((id): id is string => !!id && id !== PARTY_SLOT_EMPTY)
  );
}

/** Normalisiert: feste Anzahl 5er-Reihen, je 5 Zellen (leer = ''). */
export function normalizePartySlots(
  partySlots: string[][] | undefined | null,
  slotCount: number
): string[][] {
  const used = new Set<string>();
  const src = partySlots ?? [];
  const result: string[][] = [];

  for (let pi = 0; pi < slotCount; pi++) {
    const row: string[] = Array.from({ length: PLANNER_PARTY_SIZE }, () => PARTY_SLOT_EMPTY);
    const srcRow = src[pi] ?? [];
    let dest = 0;
    for (const raw of srcRow) {
      const id = typeof raw === 'string' ? raw.trim() : '';
      if (!id || id === PARTY_SLOT_EMPTY || used.has(id)) continue;
      while (dest < PLANNER_PARTY_SIZE && row[dest] !== PARTY_SLOT_EMPTY) dest++;
      if (dest >= PLANNER_PARTY_SIZE) break;
      row[dest] = id;
      used.add(id);
      dest++;
    }
    result.push(row);
  }
  return result;
}

/** Verteilt eine bestehende Kader-Reihenfolge auf 5er-Zellen (Migration/Legacy). */
export function distributeRosterIntoPartySlots(
  rosterOrder: string[],
  partySlots: string[][] | undefined | null,
  maxPlayers: number
): string[][] {
  const slotCount = partySlotCountForMaxPlayers(maxPlayers);
  const base = normalizePartySlots(partySlots, slotCount);
  const flat = rosterOrderFromPartySlots(base);
  if (flat.length > 0) return base;

  const next = normalizePartySlots(null, slotCount);
  let pi = 0;
  let ci = 0;
  for (const id of rosterOrder) {
    if (!id) continue;
    while (pi < slotCount && next[pi]![ci] !== PARTY_SLOT_EMPTY) {
      ci++;
      if (ci >= PLANNER_PARTY_SIZE) {
        pi++;
        ci = 0;
      }
    }
    if (pi >= slotCount) break;
    next[pi]![ci] = id;
    ci++;
    if (ci >= PLANNER_PARTY_SIZE) {
      pi++;
      ci = 0;
    }
  }
  return next;
}

export function syncPartySlotsForGroup(
  group: {
    rosterOrder?: string[];
    partySlots?: string[][] | null;
  },
  maxPlayers: number
): string[][] {
  const slotCount = partySlotCountForMaxPlayers(maxPlayers);
  const roster = group.rosterOrder ?? [];
  const fromParties = rosterOrderFromPartySlots(group.partySlots ?? []);
  if (fromParties.length > 0) {
    return normalizePartySlots(group.partySlots, slotCount);
  }
  return distributeRosterIntoPartySlots(roster, group.partySlots, maxPlayers);
}

export function applyPartyLayoutToGroup<T extends {
  rosterOrder: string[];
  partySlots?: string[][] | null;
}>(group: T, maxPlayers: number): T & { partySlots: string[][]; rosterOrder: string[] } {
  const partySlots = syncPartySlotsForGroup(group, maxPlayers);
  const rosterOrder = rosterOrderFromPartySlots(partySlots);
  return { ...group, partySlots, rosterOrder };
}

export function setPartyCell(
  partySlots: string[][],
  partyIndex: number,
  cellIndex: number,
  signupId: string,
  maxPlayers: number
): string[][] {
  const slotCount = partySlotCountForMaxPlayers(maxPlayers);
  const next = normalizePartySlots(partySlots, slotCount);
  for (let pi = 0; pi < next.length; pi++) {
    for (let ci = 0; ci < PLANNER_PARTY_SIZE; ci++) {
      if (next[pi]![ci] === signupId) next[pi]![ci] = PARTY_SLOT_EMPTY;
    }
  }
  if (partyIndex >= 0 && partyIndex < next.length && cellIndex >= 0 && cellIndex < PLANNER_PARTY_SIZE) {
    next[partyIndex]![cellIndex] = signupId;
  }
  return next;
}

export function findFirstEmptyCellInPartyRow(row: string[]): number | null {
  for (let ci = 0; ci < PLANNER_PARTY_SIZE; ci++) {
    const id = (row[ci] ?? '').trim();
    if (!id || id === PARTY_SLOT_EMPTY) return ci;
  }
  return null;
}

export function isPartyRowFull(row: string[]): boolean {
  return findFirstEmptyCellInPartyRow(row) === null;
}

/** Ziel belegt und Quelle bekannt → tauschen; sonst wie setPartyCell. */
export function setOrSwapPartyCell(
  partySlots: string[][],
  partyIndex: number,
  cellIndex: number,
  signupId: string,
  maxPlayers: number
): string[][] {
  const slotCount = partySlotCountForMaxPlayers(maxPlayers);
  const next = normalizePartySlots(partySlots, slotCount);
  if (partyIndex < 0 || partyIndex >= next.length || cellIndex < 0 || cellIndex >= PLANNER_PARTY_SIZE) {
    return next;
  }

  let srcPi = -1;
  let srcCi = -1;
  for (let pi = 0; pi < next.length; pi++) {
    for (let ci = 0; ci < PLANNER_PARTY_SIZE; ci++) {
      if (next[pi]![ci] === signupId) {
        srcPi = pi;
        srcCi = ci;
      }
    }
  }

  const occupant = (next[partyIndex]![cellIndex] ?? PARTY_SLOT_EMPTY).trim();
  const hasOccupant = occupant.length > 0 && occupant !== signupId;

  if (hasOccupant && srcPi >= 0) {
    next[srcPi]![srcCi] = occupant;
    next[partyIndex]![cellIndex] = signupId;
    return next;
  }

  if (hasOccupant) {
    const emptyCi = findFirstEmptyCellInPartyRow(next[partyIndex]!);
    if (emptyCi != null) {
      next[partyIndex]![emptyCi] = occupant;
      next[partyIndex]![cellIndex] = signupId;
      return next;
    }
  }

  return setPartyCell(partySlots, partyIndex, cellIndex, signupId, maxPlayers);
}

export function findFirstEmptyPartyCell(
  partySlots: string[][],
  maxPlayers: number
): { partyIndex: number; cellIndex: number } | null {
  const slots = normalizePartySlots(partySlots, partySlotCountForMaxPlayers(maxPlayers));
  for (let pi = 0; pi < slots.length; pi++) {
    for (let ci = 0; ci < PLANNER_PARTY_SIZE; ci++) {
      if (slots[pi]![ci] === PARTY_SLOT_EMPTY) return { partyIndex: pi, cellIndex: ci };
    }
  }
  return null;
}

/** Entfernt Signup-IDs aus Kader/Party-Slots (z. B. Absage-Block). */
export function stripSignupIdsFromPlannerGroups<
  T extends {
    rosterOrder: string[];
    partySlots: string[][];
    raidLeaderUserId?: string | null;
    lootmasterUserId?: string | null;
  },
>(groups: T[], removeIds: Set<string>, maxPlayers: number): T[] {
  if (removeIds.size === 0) return groups;
  return groups.map((g) => {
    const partySlots = g.partySlots.map((row) =>
      row.map((id) => (removeIds.has(id) ? PARTY_SLOT_EMPTY : id))
    );
    return applyPartyLayoutToGroup(
      {
        ...g,
        rosterOrder: g.rosterOrder.filter((id) => !removeIds.has(id)),
        partySlots,
      },
      maxPlayers
    );
  });
}

export function parsePartySlotsFromStored(raw: unknown): string[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((row) =>
    Array.isArray(row)
      ? row
          .filter((x): x is string => typeof x === 'string')
          .map((x) => {
            const t = x.trim();
            return t.length ? t : PARTY_SLOT_EMPTY;
          })
      : []
  );
}
