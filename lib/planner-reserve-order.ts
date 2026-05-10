/**
 * Einheitliche Reserve-Reihenfolge für Raid-Detail, Discord-Embed und Planer-Speicherstand.
 */

export function signupTypeNorm(t: string): string {
  return t === 'main' ? 'normal' : t;
}

/**
 * Reserve-Spalte öffentlich darstellen:
 * 1. IDs aus gespeicherter `reserveOrder` (Planer-Entwurf oder angekündigter Stand), die es noch gibt und nicht abgesagt sind.
 * 2. Danach alle `type === reserve`-Anmeldungen, die noch nicht genannt wurden (z. B. neu angemeldet, noch kein Planer-Save).
 *
 * `signups` sollte die kanonische Reihenfolge haben (z. B. `signedAt asc` wie in Prisma).
 */
export function orderedReserveSignupIdsForDisplay(
  plannerReserveOrder: string[] | null | undefined,
  signups: { id: string; type: string }[],
): string[] {
  const byId = new Map(signups.map((s) => [s.id, s]));
  const out: string[] = [];
  const seen = new Set<string>();

  for (const id of plannerReserveOrder ?? []) {
    const s = byId.get(id);
    if (!s) continue;
    if (signupTypeNorm(s.type) === 'declined') continue;
    out.push(id);
    seen.add(id);
  }

  for (const s of signups) {
    if (signupTypeNorm(s.type) !== 'reserve' || seen.has(s.id)) continue;
    out.push(s.id);
    seen.add(s.id);
  }

  return out;
}
