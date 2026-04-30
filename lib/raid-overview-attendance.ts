/**
 * Übersicht „Anmeldungen“: klare vs. unsichere Teilnahme (grün / orange)
 * — normal + pünktlich/knapp vs. unklar/Reserve/später.
 */

import { getSpecByDisplayName, TBC_CLASS_IDS } from '@/lib/wow-tbc-classes';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { normalizeSignupPunctuality } from '@/lib/raid-signup-constants';

export const OVERVIEW_ROLE_KEYS = ['Tank', 'Melee', 'Range', 'Healer'] as const;

export type OverviewAttendanceSlice = { clear: number; unclear: number };

export type RoleClassCountRow = { classId: string; total: number };

function typeNorm(v: string) {
  return v === 'main' ? 'normal' : v;
}

type SignupLike = {
  type: string;
  punctuality?: string | null;
  isLate: boolean;
  signedSpec?: string | null;
  character?: { mainSpec: string } | null;
};

/** null = nicht zählen (abgesagt o. Ä.) */
export function signupAttendanceBucket(s: SignupLike): 'clear' | 'unclear' | null {
  const tn = typeNorm(s.type);
  if (tn === 'declined') return null;
  const p = normalizeSignupPunctuality(s.punctuality, s.isLate);
  if (tn === 'uncertain' || tn === 'reserve') return 'unclear';
  if (tn === 'normal') {
    if (p === 'late') return 'unclear';
    return 'clear';
  }
  return null;
}

function effectiveSpec(s: SignupLike): string | null {
  const a = s.signedSpec?.trim();
  if (a) return a;
  return s.character?.mainSpec?.trim() ?? null;
}

export function emptyRoleAttendance(): Record<
  (typeof OVERVIEW_ROLE_KEYS)[number],
  OverviewAttendanceSlice
> {
  return {
    Tank: { clear: 0, unclear: 0 },
    Melee: { clear: 0, unclear: 0 },
    Range: { clear: 0, unclear: 0 },
    Healer: { clear: 0, unclear: 0 },
  };
}

/** Pro Rolle: clear (grün) / unclear (orange), ohne abgesagt. */
export function computeRoleAttendanceFromSignups(
  signups: SignupLike[]
): Record<(typeof OVERVIEW_ROLE_KEYS)[number], OverviewAttendanceSlice> {
  const out = emptyRoleAttendance();
  for (const s of signups) {
    const bucket = signupAttendanceBucket(s);
    if (!bucket) continue;
    const spec = effectiveSpec(s);
    const role = roleFromSpecDisplayName(spec);
    if (!role || !(role in out)) continue;
    out[role as keyof typeof out][bucket]++;
  }
  return out;
}

/** Pro Rolle: Anzahl Anmeldungen je Klasse (nicht abgesagt, mit auflösbarer Klasse). */
export function computeRoleClassCountsByRole(
  signups: SignupLike[]
): Record<(typeof OVERVIEW_ROLE_KEYS)[number], RoleClassCountRow[]> {
  const maps = {
    Tank: new Map<string, number>(),
    Melee: new Map<string, number>(),
    Range: new Map<string, number>(),
    Healer: new Map<string, number>(),
  } as const;

  for (const s of signups) {
    const tn = typeNorm(s.type);
    if (tn === 'declined') continue;
    const spec = effectiveSpec(s);
    if (!spec) continue;
    const role = roleFromSpecDisplayName(spec);
    if (!role || !(role in maps)) continue;
    const cid = getSpecByDisplayName(spec)?.classId;
    if (!cid) continue;
    const m = maps[role as keyof typeof maps];
    m.set(cid, (m.get(cid) ?? 0) + 1);
  }

  const out = {
    Tank: [] as RoleClassCountRow[],
    Melee: [] as RoleClassCountRow[],
    Range: [] as RoleClassCountRow[],
    Healer: [] as RoleClassCountRow[],
  };
  for (const key of OVERVIEW_ROLE_KEYS) {
    const m = maps[key];
    for (const classId of TBC_CLASS_IDS) {
      const total = m.get(classId) ?? 0;
      if (total > 0) out[key].push({ classId, total });
    }
  }
  return out;
}
