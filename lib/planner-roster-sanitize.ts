import type { AnnounceRaidPayload, AnnouncedGroupPayload } from '@/lib/raid-announce';
import {
  applyPartyLayoutToGroup,
  PARTY_SLOT_EMPTY,
  PLANNER_PARTY_SIZE,
  stripSignupIdsFromPlannerGroups,
} from '@/lib/planner-party-slots';

export type PlannerSanitizeRemovalLocation =
  | 'roster'
  | 'reserve'
  | 'decline'
  | 'partySlot';

export type PlannerSanitizeRemoval = {
  signupId: string;
  location: PlannerSanitizeRemovalLocation;
  groupIndex?: number;
  partyIndex?: number;
  cellIndex?: number;
};

export type PlannerSanitizeResult = {
  payload: AnnounceRaidPayload;
  removed: PlannerSanitizeRemoval[];
  hadInvalid: boolean;
};

function collectRemovalsForUnknownIds(
  payload: AnnounceRaidPayload,
  unknownIds: Set<string>
): PlannerSanitizeRemoval[] {
  const removed: PlannerSanitizeRemoval[] = [];
  payload.groups.forEach((g, groupIndex) => {
    for (const signupId of g.rosterOrder) {
      if (unknownIds.has(signupId)) {
        removed.push({ signupId, location: 'roster', groupIndex });
      }
    }
    const slots = g.partySlots ?? [];
    slots.forEach((row, partyIndex) => {
      row.forEach((raw, cellIndex) => {
        const signupId = typeof raw === 'string' ? raw.trim() : '';
        if (signupId && signupId !== PARTY_SLOT_EMPTY && unknownIds.has(signupId)) {
          removed.push({
            signupId,
            location: 'partySlot',
            groupIndex,
            partyIndex,
            cellIndex,
          });
        }
      });
    });
  });
  for (const signupId of payload.reserveOrder) {
    if (unknownIds.has(signupId)) {
      removed.push({ signupId, location: 'reserve' });
    }
  }
  for (const signupId of payload.declineOrder) {
    if (unknownIds.has(signupId)) {
      removed.push({ signupId, location: 'decline' });
    }
  }
  return removed;
}

function allPayloadSignupIds(payload: AnnounceRaidPayload): Set<string> {
  const ids = new Set<string>();
  for (const g of payload.groups) {
    for (const id of g.rosterOrder) ids.add(id);
    for (const row of g.partySlots ?? []) {
      for (const raw of row) {
        const id = typeof raw === 'string' ? raw.trim() : '';
        if (id && id !== PARTY_SLOT_EMPTY) ids.add(id);
      }
    }
  }
  for (const id of payload.reserveOrder) ids.add(id);
  for (const id of payload.declineOrder) ids.add(id);
  return ids;
}

type GroupWithParties = AnnouncedGroupPayload & { partySlots: string[][] };

function groupsWithPartySlots(payload: AnnounceRaidPayload): GroupWithParties[] {
  return payload.groups.map((g) => ({
    ...g,
    partySlots: g.partySlots ?? [],
  }));
}

/**
 * Entfernt ungültige Signup-IDs aus dem Layout:
 * - nicht in `knownSignupIds` (gelöscht / existiert nicht)
 * - nicht in `plannableSignupIds` (z. B. abgemeldet) aus Kader, Reserve und 5er-Slots
 *   — im Absage-Block bleiben abgemeldete IDs erlaubt, wenn sie noch in der DB sind.
 */
export function sanitizeAnnounceRaidPayload(
  payload: AnnounceRaidPayload,
  knownSignupIds: Set<string>,
  maxPlayers: number,
  plannableSignupIds?: Set<string>
): PlannerSanitizeResult {
  const placeable = plannableSignupIds ?? knownSignupIds;
  const stripRosterReserveParty = new Set<string>();
  const stripDecline = new Set<string>();

  for (const id of allPayloadSignupIds(payload)) {
    if (!knownSignupIds.has(id)) {
      stripRosterReserveParty.add(id);
      stripDecline.add(id);
      continue;
    }
    if (!placeable.has(id)) {
      stripRosterReserveParty.add(id);
    }
  }

  if (stripRosterReserveParty.size === 0 && stripDecline.size === 0) {
    return { payload, removed: [], hadInvalid: false };
  }

  const removed = [
    ...collectRemovalsForUnknownIds(payload, stripRosterReserveParty).filter(
      (r) => r.location !== 'decline'
    ),
    ...collectRemovalsForUnknownIds(payload, stripDecline).filter((r) => r.location === 'decline'),
  ];

  const strippedGroups = stripSignupIdsFromPlannerGroups(
    groupsWithPartySlots(payload),
    stripRosterReserveParty,
    maxPlayers
  );
  const groups: AnnouncedGroupPayload[] = strippedGroups.map((g) => ({
    rosterOrder: g.rosterOrder,
    raidLeaderUserId: g.raidLeaderUserId ?? null,
    lootmasterUserId: g.lootmasterUserId ?? null,
    partySlots: g.partySlots,
  }));

  return {
    payload: {
      groups,
      reserveOrder: payload.reserveOrder.filter((id) => !stripRosterReserveParty.has(id)),
      declineOrder: payload.declineOrder.filter((id) => !stripDecline.has(id)),
    },
    removed,
    hadInvalid: removed.length > 0,
  };
}

/** Entfernt explizit angegebene Signup-IDs (z. B. nach Abmeldung). */
export function removeSignupIdsFromAnnouncePayload(
  payload: AnnounceRaidPayload,
  removeIds: Set<string>,
  maxPlayers: number
): AnnounceRaidPayload {
  if (removeIds.size === 0) return payload;
  const groups = stripSignupIdsFromPlannerGroups(
    groupsWithPartySlots(payload),
    removeIds,
    maxPlayers
  ).map((g) => ({
    rosterOrder: g.rosterOrder,
    raidLeaderUserId: g.raidLeaderUserId ?? null,
    lootmasterUserId: g.lootmasterUserId ?? null,
    partySlots: g.partySlots,
  }));
  return {
    groups,
    reserveOrder: payload.reserveOrder.filter((id) => !removeIds.has(id)),
    declineOrder: payload.declineOrder.filter((id) => !removeIds.has(id)),
  };
}

/** Erste freie Zelle; unbekannte Signup-IDs gelten als leer (Ghost-Slots). */
export function findFirstEmptyPartyCellForKnown(
  row: string[],
  knownSignupIds?: Set<string>
): number | null {
  for (let ci = 0; ci < PLANNER_PARTY_SIZE; ci++) {
    const id = (row[ci] ?? '').trim();
    if (!id || id === PARTY_SLOT_EMPTY) return ci;
    if (knownSignupIds && !knownSignupIds.has(id)) return ci;
  }
  return null;
}

export function isPartyRowFullForKnown(row: string[], knownSignupIds?: Set<string>): boolean {
  return findFirstEmptyPartyCellForKnown(row, knownSignupIds) === null;
}

export function applyPartyLayoutToPlannerGroups<T extends GroupWithParties>(
  groups: T[],
  maxPlayers: number
): T[] {
  return groups.map((g) => applyPartyLayoutToGroup(g, maxPlayers));
}
