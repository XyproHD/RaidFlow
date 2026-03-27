/**
 * Raidleader: Spalten Anmeldung / Ersatz / Gesetzt (Phase 8).
 */

export const LEADER_PLACEMENTS = ['signup', 'substitute', 'confirmed'] as const;
export type LeaderPlacement = (typeof LEADER_PLACEMENTS)[number];

export function parseLeaderPlacement(raw: unknown): LeaderPlacement | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s === 'signup' || s === 'substitute' || s === 'confirmed') return s;
  return null;
}

/** set_confirmed in DB: nur „Gesetzt“-Spalte (Roadmap / Phase 9). */
export function setConfirmedForPlacement(placement: LeaderPlacement): boolean {
  return placement === 'confirmed';
}
