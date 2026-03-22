import type { Prisma } from '@prisma/client';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';

type MinSpecs = Record<string, number> | null | undefined;

type SignupRow = {
  type: string;
  character: { mainSpec: string } | null;
};

/**
 * Zählt Tank/Melee/Range/Healer aus Anmeldungen (normal + uncertain, keine Reserve).
 */
export function countRolesFromSignups(signups: SignupRow[]) {
  const counts = { Tank: 0, Melee: 0, Range: 0, Healer: 0 };
  for (const s of signups) {
    if (s.type === 'reserve') continue;
    const role = roleFromSpecDisplayName(s.character?.mainSpec);
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
  signups: SignupRow[];
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
  const specCounts: Record<string, number> = {};
  for (const s of args.signups) {
    if (s.type === 'reserve') continue;
    const name = s.character?.mainSpec?.trim();
    if (name) specCounts[name] = (specCounts[name] ?? 0) + 1;
  }
  for (const [specName, need] of Object.entries(specNeed)) {
    const have = specCounts[specName] ?? 0;
    const miss = need - have;
    if (miss > 0) parts.push(`${specName} −${miss}`);
  }

  return parts.length ? parts.join(', ') : '—';
}
