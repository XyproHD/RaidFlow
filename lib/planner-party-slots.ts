/** WoW-Party-Größe im Raid-Planer (5er-Gruppen innerhalb einer Raid-Gruppe). */
export const PLANNER_PARTY_SIZE = 5;

export function partySlotCountForRoster(rosterLen: number): number {
  if (rosterLen <= 0) return 0;
  return Math.ceil(rosterLen / PLANNER_PARTY_SIZE);
}

/** Normalisiert 5er-Slots: nur Kader-IDs, max. 5 pro Slot, keine Duplikate. */
export function normalizePartySlots(
  partySlots: string[][] | undefined | null,
  rosterOrder: string[],
  slotCount: number
): string[][] {
  const rosterSet = new Set(rosterOrder);
  const used = new Set<string>();
  const src = partySlots ?? [];
  const result: string[][] = [];
  for (let i = 0; i < slotCount; i++) {
    const row: string[] = [];
    for (const id of src[i] ?? []) {
      if (!rosterSet.has(id) || used.has(id) || row.length >= PLANNER_PARTY_SIZE) continue;
      used.add(id);
      row.push(id);
    }
    result.push(row);
  }
  return result;
}

export function syncPartySlotsForGroup(group: {
  rosterOrder: string[];
  partySlots?: string[][] | null;
}): string[][] {
  const count = partySlotCountForRoster(group.rosterOrder.length);
  return normalizePartySlots(group.partySlots, group.rosterOrder, count);
}

export function parsePartySlotsFromStored(raw: unknown): string[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((row) =>
    Array.isArray(row)
      ? row.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
      : []
  );
}
