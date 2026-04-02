/**
 * Mindest-Specs im Raid: JSON-Objekt `min_specs` mit Spec-Anzeigenamen
 * oder Klassenzeilen `class:<classId>` (beliebige Spec dieser Klasse zählt).
 */

import {
  getClassEnglishName,
  getSpecByDisplayName,
  TBC_CLASS_IDS,
} from '@/lib/wow-tbc-classes';

export const MIN_SPEC_CLASS_PREFIX = 'class:' as const;

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

/** Formularzeile (Wizard / Bearbeiten) ↔ Persistenz-Key in `min_specs`. */
export type MinSpecRowForm =
  | { kind: 'spec'; spec: string; count: number }
  | { kind: 'class'; classId: string; count: number };

export function minSpecRowToStorageKey(r: MinSpecRowForm): string | null {
  if (r.kind === 'spec') {
    const s = r.spec.trim();
    return s.length > 0 ? s : null;
  }
  return minSpecClassKey(r.classId);
}

export function minSpecRowFromStorageKey(key: string, count: number): MinSpecRowForm {
  const cid = parseMinSpecClassKey(key);
  if (cid) return { kind: 'class', classId: cid, count };
  return { kind: 'spec', spec: key, count };
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

/**
 * Statistik pro Eintrag in `min_specs` (normal / uncertain / reserve), für die Übersicht.
 */
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
