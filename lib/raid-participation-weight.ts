/** Teilnahme-Gewicht 0–1 in 0,1er-Schritten (rf_raid_completion.participation_counter). */
export function normalizeParticipationWeight(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  const clipped = Math.min(1, Math.max(0, n));
  const stepped = Math.round(clipped * 10) / 10;
  if (Math.abs(stepped * 10 - Math.round(stepped * 10)) > 1e-9) return null;
  return stepped;
}
