/** Anmeldungstypen (DB, API). Legacy: main → normal. declined = abgesagt (z. B. nach Raid-Ankündigung). */
export const RAID_SIGNUP_TYPES = ['normal', 'uncertain', 'reserve', 'declined'] as const;
export type RaidSignupType = (typeof RAID_SIGNUP_TYPES)[number];

const TYPE_SET = new Set<string>(RAID_SIGNUP_TYPES);

export function normalizeSignupType(raw: string): RaidSignupType | null {
  const t = raw.trim().toLowerCase();
  if (t === 'main') return 'normal';
  if (TYPE_SET.has(t)) return t as RaidSignupType;
  return null;
}

export function isRaidSignupType(s: string): s is RaidSignupType {
  return normalizeSignupType(s) !== null;
}

/** Legacy DB-Wert `main` → `normal`. */
export function signupTypeNorm(raw: string): string {
  return raw === 'main' ? 'normal' : raw;
}

/** „Unklar“ / „Nicht da“ — bei Ankündigung/Speichern nicht durch Reserve ersetzen. */
export function isPreservedAttendanceSignupType(raw: string): boolean {
  const t = signupTypeNorm(raw);
  return t === 'uncertain' || t === 'declined';
}

export const RAID_SIGNUP_PUNCTUALITY = ['on_time', 'tight', 'late'] as const;
export type RaidSignupPunctuality = (typeof RAID_SIGNUP_PUNCTUALITY)[number];

const PUNCTUALITY_SET = new Set<string>(RAID_SIGNUP_PUNCTUALITY);

/** API/Client: punctuality string; fallback aus Legacy isLate. */
export function normalizeSignupPunctuality(
  raw: unknown,
  isLateFallback: boolean
): RaidSignupPunctuality {
  if (typeof raw === 'string' && PUNCTUALITY_SET.has(raw)) {
    return raw as RaidSignupPunctuality;
  }
  return isLateFallback ? 'late' : 'on_time';
}
