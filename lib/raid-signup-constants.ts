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

/** DB-Marker: explizite Abmeldung (type bleibt `declined`, unterscheidbar von „Nicht da“). */
export const WITHDRAWN_SIGNUP_ORIGINAL_TYPE = 'withdrawn';

/** Legacy DB-Wert `main` → `normal`. */
export function signupTypeNorm(raw: string): string {
  return raw === 'main' ? 'normal' : raw;
}

/** Aktive Anmeldung (zählt für Plätze / Kader-Pool). */
export function isActiveRaidSignup(row: { type?: string | null }): boolean {
  return signupTypeNorm(row.type ?? 'normal') !== 'declined';
}

export function isWithdrawnRaidSignup(row: {
  type?: string | null;
  originalSignupType?: string | null;
}): boolean {
  if (signupTypeNorm(row.type ?? '') !== 'declined') return false;
  return signupTypeNorm(row.originalSignupType ?? 'declined') === WITHDRAWN_SIGNUP_ORIGINAL_TYPE;
}

/** „Nicht da“ ohne explizite Abmeldung. */
export function isNotAttendingRaidSignup(row: {
  type?: string | null;
  originalSignupType?: string | null;
}): boolean {
  return signupTypeNorm(row.type ?? '') === 'declined' && !isWithdrawnRaidSignup(row);
}

/** Planer/Listen: declined oder Legacy-Marker withdrawn. */
export function isDeclinedLikeSignupType(raw: string | null | undefined): boolean {
  const t = signupTypeNorm(raw ?? '');
  return t === 'declined' || t === WITHDRAWN_SIGNUP_ORIGINAL_TYPE;
}

/** Prisma: Legacy-Abmeldungen (vor Delete-Fix) aus Listen ausblenden. */
export const PRISMA_VISIBLE_SIGNUP_WHERE = {
  NOT: {
    type: 'declined' as const,
    originalSignupType: WITHDRAWN_SIGNUP_ORIGINAL_TYPE,
  },
};

/** Prisma-Filter für Zählungen aktiver Anmeldungen. */
export const PRISMA_ACTIVE_SIGNUP_WHERE = { type: { not: 'declined' as const } };

export const PRISMA_ACTIVE_SIGNUP_COUNT_SELECT = {
  signups: { where: PRISMA_ACTIVE_SIGNUP_WHERE },
} as const;

export function isPlannableRaidSignup(row: {
  type: string;
  originalSignupType?: string | null;
}): boolean {
  if (!isActiveRaidSignup(row)) return false;
  const orig = signupTypeNorm(row.originalSignupType ?? row.type);
  return orig !== 'declined' && orig !== WITHDRAWN_SIGNUP_ORIGINAL_TYPE;
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
