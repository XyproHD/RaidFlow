import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import {
  countSignupsMatchingMinSpecKey,
  formatMinSpecGapLabel,
} from '@/lib/min-spec-keys';

type MinSpecs = Record<string, number> | null | undefined;

export type CompositionSignupRow = {
  type: string;
  signedSpec: string | null;
  character: { mainSpec: string } | null;
};

function effectiveSpec(s: CompositionSignupRow): string | null {
  const a = s.signedSpec?.trim();
  if (a) return a;
  return s.character?.mainSpec?.trim() ?? null;
}

/**
 * Zählt Tank/Melee/Range/Healer aus Anmeldungen (normal + uncertain, keine Reserve).
 */
export function countRolesFromSignups(signups: CompositionSignupRow[]) {
  const counts = { Tank: 0, Melee: 0, Range: 0, Healer: 0 };
  for (const s of signups) {
    if (s.type === 'reserve') continue;
    const role = roleFromSpecDisplayName(effectiveSpec(s));
    if (role && role in counts) {
      counts[role]++;
    }
  }
  return counts;
}

function parseMinSpecs(raw: MinSpecs): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k.trim()] = Math.floor(v);
    }
  }
  return out;
}

/**
 * Kurztext: fehlende Rollen + fehlende Specs (Mindestvorgaben vs. Zählung).
 */
export function formatCompositionGaps(args: {
  minTanks: number;
  minMelee: number;
  minRange: number;
  minHealers: number;
  minSpecs: MinSpecs;
  signups: CompositionSignupRow[];
}): string {
  const roleCounts = countRolesFromSignups(args.signups);
  const parts: string[] = [];

  const roleNeed: { key: keyof typeof roleCounts; min: number; label: string }[] = [
    { key: 'Tank', min: args.minTanks, label: 'Tank' },
    { key: 'Melee', min: args.minMelee, label: 'Melee' },
    { key: 'Range', min: args.minRange, label: 'Range' },
    { key: 'Healer', min: args.minHealers, label: 'Healer' },
  ];
  for (const { key, min, label } of roleNeed) {
    if (min <= 0) continue;
    const have = roleCounts[key];
    const miss = min - have;
    if (miss > 0) parts.push(`${label} −${miss}`);
  }

  const specNeed = parseMinSpecs(args.minSpecs);
  for (const [specName, need] of Object.entries(specNeed)) {
    const have = countSignupsMatchingMinSpecKey(specName, args.signups);
    const miss = need - have;
    if (miss > 0) parts.push(`${formatMinSpecGapLabel(specName)} −${miss}`);
  }

  return parts.length ? parts.join(', ') : '—';
}

export type CompositionGapRole = {
  role: 'Tank' | 'Melee' | 'Range' | 'Healer';
  missing: number;
};

export type CompositionGapSpec = { spec: string; missing: number };

/**
 * Strukturierte Lücken für Icon-Darstellung (Rollen + Mindest-Specs).
 */
export function getCompositionGapsStructured(args: {
  minTanks: number;
  minMelee: number;
  minRange: number;
  minHealers: number;
  minSpecs: MinSpecs;
  signups: CompositionSignupRow[];
}): { roles: CompositionGapRole[]; specs: CompositionGapSpec[] } {
  const roleCounts = countRolesFromSignups(args.signups);
  const roles: CompositionGapRole[] = [];
  const roleNeed: { key: keyof typeof roleCounts; min: number }[] = [
    { key: 'Tank', min: args.minTanks },
    { key: 'Melee', min: args.minMelee },
    { key: 'Range', min: args.minRange },
    { key: 'Healer', min: args.minHealers },
  ];
  for (const { key, min } of roleNeed) {
    if (min <= 0) continue;
    const have = roleCounts[key];
    const miss = min - have;
    if (miss > 0) roles.push({ role: key, missing: miss });
  }

  const specNeed = parseMinSpecs(args.minSpecs);
  const specs: CompositionGapSpec[] = [];
  for (const [specName, need] of Object.entries(specNeed)) {
    const have = countSignupsMatchingMinSpecKey(specName, args.signups);
    const miss = need - have;
    if (miss > 0) specs.push({ spec: specName, missing: miss });
  }

  return { roles, specs };
}

/** Für Min-Spec-Zeile: Ist / Soll (Spec-Anzeigename oder `class:<id>`). */
export function countSignedPerSpec(
  signups: CompositionSignupRow[],
  minSpecKey: string
): number {
  return countSignupsMatchingMinSpecKey(minSpecKey, signups);
}
