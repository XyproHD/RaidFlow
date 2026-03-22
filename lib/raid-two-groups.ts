import {
  countRolesFromSignups,
  type CompositionSignupRow,
} from '@/lib/raid-composition-summary';

function parseMinSpecs(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k.trim()] = Math.floor(v);
    }
  }
  return out;
}

function effectiveSpec(s: CompositionSignupRow): string | null {
  const a = s.signedSpec?.trim();
  if (a) return a;
  return s.character?.mainSpec?.trim() ?? null;
}

/**
 * Zählt Specs aus Anmeldungen (ohne Reserve).
 */
function countSpecsFromSignups(signups: CompositionSignupRow[]): Record<string, number> {
  const specCounts: Record<string, number> = {};
  for (const s of signups) {
    if (s.type === 'reserve') continue;
    const name = effectiveSpec(s);
    if (name) specCounts[name] = (specCounts[name] ?? 0) + 1;
  }
  return specCounts;
}

/**
 * Prüfung „2 Gruppen möglich“: 2× max_players, 2× Min Rollen, 2× Min Specs.
 * Nutzt dieselbe Logik wie die Mindestbesetzung (keine Reserve).
 */
export function computeTwoGroupsPossible(args: {
  maxPlayers: number;
  minTanks: number;
  minMelee: number;
  minRange: number;
  minHealers: number;
  minSpecs: unknown;
  signups: CompositionSignupRow[];
}): boolean {
  const pool = args.signups.filter((s) => s.type !== 'reserve');
  const n = pool.length;
  if (n < args.maxPlayers * 2) return false;

  const roles = countRolesFromSignups(pool);
  const need = [
    { key: 'Tank' as const, min: args.minTanks },
    { key: 'Melee' as const, min: args.minMelee },
    { key: 'Range' as const, min: args.minRange },
    { key: 'Healer' as const, min: args.minHealers },
  ];
  for (const { key, min } of need) {
    if (min <= 0) continue;
    if (roles[key] < min * 2) return false;
  }

  const specNeed = parseMinSpecs(args.minSpecs);
  const specCounts = countSpecsFromSignups(pool);
  for (const [specName, need] of Object.entries(specNeed)) {
    const have = specCounts[specName] ?? 0;
    if (have < need * 2) return false;
  }

  return true;
}
