/**
 * Reserve-Reihenfolge für Planer-Speicherstand (draft / announced JSON).
 * Öffentliche Anzeige: @/lib/raid-signup-display
 */

export function signupTypeNorm(t: string): string {
  return t === 'main' ? 'normal' : t;
}

function effectiveSignupType(s: { type: string; originalSignupType?: string | null }): string {
  return signupTypeNorm(s.originalSignupType ?? s.type);
}

/**
 * Reserve-Reihenfolge im Planer:
 * 1. IDs aus `reserveOrder` (Planer-JSON), die noch existieren und nicht abgesagt sind.
 * 2. Danach Selbst-Reserve-Anmeldungen (`originalSignupType`/`type === reserve`), noch nicht in (1).
 */
export function orderedReserveSignupIdsForDisplay(
  plannerReserveOrder: string[] | null | undefined,
  signups: { id: string; type: string; originalSignupType?: string | null }[],
): string[] {
  const byId = new Map(signups.map((s) => [s.id, s]));
  const out: string[] = [];
  const seen = new Set<string>();

  for (const id of plannerReserveOrder ?? []) {
    const s = byId.get(id);
    if (!s) continue;
    if (effectiveSignupType(s) === 'declined') continue;
    out.push(id);
    seen.add(id);
  }

  for (const s of signups) {
    if (effectiveSignupType(s) !== 'reserve' || seen.has(s.id)) continue;
    out.push(s.id);
    seen.add(s.id);
  }

  return out;
}
