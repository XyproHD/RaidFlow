/**
 * Mindest-Specs im Raid: JSON-Objekt `min_specs` mit Spec-Anzeigenamen
 * oder Klassenzeilen `class:<classId>` (beliebige Spec dieser Klasse zählt).
 */

import {
  getClassEnglishName,
  getSpecByDisplayName,
  getSpecDisplayName,
  TBC_CLASS_IDS,
  getClassSpecs,
} from '@/lib/wow-tbc-classes';
import {
  signupAttendanceBucket,
  type OverviewAttendanceSlice,
} from '@/lib/raid-overview-attendance';

export const MIN_SPEC_CLASS_PREFIX = 'class:' as const;

/** Spec-Dropdown: nur Klasse, keine feste Spec (Speicher: `class:<id>`). */
export const MIN_SPEC_CLASS_ONLY = '__class_only__' as const;

export function isMinSpecClassKey(key: string): boolean {
  return key.trim().startsWith(MIN_SPEC_CLASS_PREFIX);
}

export function parseMinSpecClassKey(key: string): string | null {
  const t = key.trim();
  if (!t.startsWith(MIN_SPEC_CLASS_PREFIX)) return null;
  const id = t.slice(MIN_SPEC_CLASS_PREFIX.length).trim();
  return TBC_CLASS_IDS.includes(id) ? id : null;
}

export function minSpecClassKey(classId: string): string {
  return `${MIN_SPEC_CLASS_PREFIX}${classId}`;
}

/** Formularzeile: Klasse + Spec oder „nur Klasse“ ↔ Persistenz-Key in `min_specs`. */
export type MinSpecRowForm = {
  classId: string;
  /** `MIN_SPEC_CLASS_ONLY` oder Spec-ID (balance, holy, …). */
  specChoice: typeof MIN_SPEC_CLASS_ONLY | string;
  count: number;
  /** Nicht zuordenbarer Key (ältere Daten); beim Speichern unverändert, bis die Zeile geändert wird. */
  legacyDisplayKey?: string;
};

export function normalizeMinSpecRow(row: MinSpecRowForm): MinSpecRowForm {
  if (row.legacyDisplayKey) return row;
  const specs = getClassSpecs(row.classId);
  if (row.specChoice !== MIN_SPEC_CLASS_ONLY && !specs.some((s) => s.id === row.specChoice)) {
    return { ...row, specChoice: MIN_SPEC_CLASS_ONLY };
  }
  return row;
}

export function minSpecRowToStorageKey(r: MinSpecRowForm): string | null {
  const row = normalizeMinSpecRow(r);
  if (row.legacyDisplayKey?.trim()) return row.legacyDisplayKey.trim();
  if (!TBC_CLASS_IDS.includes(row.classId)) return null;
  if (row.specChoice === MIN_SPEC_CLASS_ONLY) return minSpecClassKey(row.classId);
  return getSpecDisplayName(row.classId, row.specChoice);
}

export function minSpecRowFromStorageKey(key: string, count: number): MinSpecRowForm {
  const t = key.trim();
  const cid = parseMinSpecClassKey(t);
  if (cid) return { classId: cid, specChoice: MIN_SPEC_CLASS_ONLY, count };
  const parsed = getSpecByDisplayName(t);
  if (parsed) {
    return { classId: parsed.classId, specChoice: parsed.specId, count };
  }
  return {
    classId: TBC_CLASS_IDS[0] ?? 'warrior',
    specChoice: MIN_SPEC_CLASS_ONLY,
    count,
    legacyDisplayKey: t || undefined,
  };
}

/** Für Icons: Klassen-Icon nur bei „nur Klasse“, sonst Spec-Icon. */
export function minSpecRowUsesClassIconOnly(row: MinSpecRowForm): boolean {
  if (row.legacyDisplayKey) return true;
  return row.specChoice === MIN_SPEC_CLASS_ONLY;
}

/** Spec-Anzeigename für SpecIcon, falls nicht nur Klasse. */
export function minSpecRowSpecDisplayName(row: MinSpecRowForm): string | null {
  const rowN = normalizeMinSpecRow(row);
  if (rowN.legacyDisplayKey || rowN.specChoice === MIN_SPEC_CLASS_ONLY) return null;
  return getSpecDisplayName(rowN.classId, rowN.specChoice);
}

export function isValidMinSpecKey(key: string): boolean {
  const k = key.trim();
  if (!k || k.length > 120) return false;
  if (isMinSpecClassKey(k)) return parseMinSpecClassKey(k) !== null;
  return true;
}

/** Kurztext für Lücken (z. B. Discord), konsistent englische Klassennamen. */
export function formatMinSpecGapLabel(key: string): string {
  const cid = parseMinSpecClassKey(key);
  if (cid) return getClassEnglishName(cid);
  return key.trim();
}

/** i18n-Keys unter `profile` für Klassennamen (wie Raidplaner). */
export const MIN_SPEC_CLASS_PROFILE_KEY: Record<string, string> = {
  druid: 'classDruid',
  hunter: 'classHunter',
  mage: 'classMage',
  paladin: 'classPaladin',
  priest: 'classPriest',
  rogue: 'classRogue',
  shaman: 'classShaman',
  warlock: 'classWarlock',
  warrior: 'classWarrior',
};

/** UI-Titel für eine Mindest-Zeile (Spec-Name oder lokalisierte Klasse). */
export function minSpecKeyTitle(key: string, tProfile: (k: string) => string): string {
  const cid = parseMinSpecClassKey(key);
  if (cid) {
    const pk = MIN_SPEC_CLASS_PROFILE_KEY[cid];
    return pk ? tProfile(pk) : getClassEnglishName(cid);
  }
  return key.trim();
}

export type MinSpecSignupLike = {
  type: string;
  signedSpec?: string | null;
  character?: { mainSpec: string } | null;
};

function effectiveSpec(s: MinSpecSignupLike): string | null {
  const a = s.signedSpec?.trim();
  if (a) return a;
  return s.character?.mainSpec?.trim() ?? null;
}

/** Zählt Anmeldungen (ohne Reserve), die eine Mindest-Zeile erfüllen. */
export function countSignupsMatchingMinSpecKey(key: string, signups: MinSpecSignupLike[]): number {
  let n = 0;
  for (const s of signups) {
    if (s.type === 'reserve') continue;
    const name = effectiveSpec(s);
    if (!name) continue;
    if (isMinSpecClassKey(key)) {
      const cid = parseMinSpecClassKey(key);
      if (cid && getSpecByDisplayName(name)?.classId === cid) n++;
    } else if (name === key.trim()) {
      n++;
    }
  }
  return n;
}

/**
 * Zählt aus einer Map Spec-Displayname → Anzahl (z. B. Verfügbarkeits-Heatmap),
 * wie viele Spieler die Mindest-Zeile `key` erfüllen.
 */
export function countFromSpecDisplayCounts(key: string, specCounts: Record<string, number>): number {
  if (!isMinSpecClassKey(key)) {
    return specCounts[key.trim()] ?? 0;
  }
  const cid = parseMinSpecClassKey(key);
  if (!cid) return 0;
  let n = 0;
  for (const [specName, cnt] of Object.entries(specCounts)) {
    if (getSpecByDisplayName(specName)?.classId === cid) n += cnt;
  }
  return n;
}

export type SignupTypeStat = { type: string; signedSpec: string | null; character: { mainSpec: string } | null };

function typeNorm(v: string) {
  return v === 'main' ? 'normal' : v;
}

export type RoleStatSlice = { normal: number; uncertain: number; reserve: number };

/** API: `min_specs` aus JSON parsen und Keys validieren (Spec-Anzeigename oder `class:<id>`). */
export function parseMinSpecsPayload(raw: unknown): Record<string, number> | null {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 99) return null;
    const key = k.trim();
    if (key.length === 0) return null;
    if (!isValidMinSpecKey(key)) return null;
    out[key] = Math.floor(v);
  }
  return out;
}

export function buildSpecStatsByMinKeys(
  signups: SignupTypeStat[],
  minSpecsObj: Record<string, number> | null
): Record<string, RoleStatSlice> {
  const out: Record<string, RoleStatSlice> = {};
  if (!minSpecsObj) return out;
  const keys = Object.keys(minSpecsObj).filter((k) => {
    const n = minSpecsObj[k];
    return typeof n === 'number' && Number.isFinite(n) && n > 0;
  });
  for (const k of keys) {
    out[k] = { normal: 0, uncertain: 0, reserve: 0 };
  }
  for (const s of signups) {
    const spec = (s.signedSpec?.trim() || s.character?.mainSpec?.trim() || '').trim();
    if (!spec) continue;
    const tn = typeNorm(s.type);
    if (tn !== 'normal' && tn !== 'uncertain' && tn !== 'reserve') continue;
    for (const k of keys) {
      if (isMinSpecClassKey(k)) {
        const cid = parseMinSpecClassKey(k);
        if (cid && getSpecByDisplayName(spec)?.classId === cid) {
          out[k][tn]++;
        }
      } else if (spec === k.trim()) {
        out[k][tn]++;
      }
    }
  }
  return out;
}

export type MinSpecSignupAttendanceLike = SignupTypeStat & {
  punctuality?: string | null;
  isLate: boolean;
};

/** Wie buildSpecStatsByMinKeys, aber Zählung clear/unclear (Raid-Übersicht). */
export function buildSpecAttendanceByMinKeys(
  signups: MinSpecSignupAttendanceLike[],
  minSpecsObj: Record<string, number> | null
): Record<string, OverviewAttendanceSlice> {
  const out: Record<string, OverviewAttendanceSlice> = {};
  if (!minSpecsObj) return out;
  const keys = Object.keys(minSpecsObj).filter((k) => {
    const n = minSpecsObj[k];
    return typeof n === 'number' && Number.isFinite(n) && n > 0;
  });
  for (const k of keys) {
    out[k] = { clear: 0, unclear: 0 };
  }
  for (const s of signups) {
    const spec = (s.signedSpec?.trim() || s.character?.mainSpec?.trim() || '').trim();
    if (!spec) continue;
    const bucket = signupAttendanceBucket(s);
    if (!bucket) continue;
    for (const k of keys) {
      let match = false;
      if (isMinSpecClassKey(k)) {
        const cid = parseMinSpecClassKey(k);
        if (cid && getSpecByDisplayName(spec)?.classId === cid) match = true;
      } else if (spec === k.trim()) {
        match = true;
      }
      if (match) out[k][bucket]++;
    }
  }
  return out;
}
