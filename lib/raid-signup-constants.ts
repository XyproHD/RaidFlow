/** Anmeldungstypen (DB, API). Legacy: main → normal. */
export const RAID_SIGNUP_TYPES = ['normal', 'uncertain', 'reserve'] as const;
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
