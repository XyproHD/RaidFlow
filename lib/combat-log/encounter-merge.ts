/**
 * WoW can emit a second ENCOUNTER_START/END during the same wipe (e.g. Solarian
 * after last player dies, before release). That is not a new pull.
 */
export const SPURIOUS_ENCOUNTER_GAP_MS = 45_000;
export const SPURIOUS_ENCOUNTER_MAX_DURATION_MS = 30_000;

export interface EncounterTiming {
  encounterId: number;
  startMs: number;
  endMs: number;
  /** From ENCOUNTER_END last field (1 = kill). */
  success?: boolean;
}

export function isSpuriousFollowUpEncounter(
  previous: EncounterTiming,
  current: EncounterTiming,
): boolean {
  if (previous.encounterId !== current.encounterId) return false;
  const gap = current.startMs - previous.endMs;
  const duration = current.endMs - current.startMs;
  if (gap < 0 || gap > SPURIOUS_ENCOUNTER_GAP_MS) return false;
  if (duration > SPURIOUS_ENCOUNTER_MAX_DURATION_MS) return false;
  if (previous.success === true) return false;
  return true;
}
