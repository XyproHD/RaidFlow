import type { CombatLogAnalysis, InstancePlayerSummary, InstanceSummary } from '@/lib/combat-log';
import { normalizeParticipationWeight } from '@/lib/raid-participation-weight';

export type CombatLogWeightByCharacterName = Map<string, number>;

function normName(name: string): string {
  return name.trim().toLowerCase();
}

/** Participation ratio rounded to one decimal (0.1 steps). */
export function encounterRatioToWeight(
  encountersPresent: number,
  encountersTotal: number
): number {
  if (encountersTotal <= 0) return 0;
  const raw = encountersPresent / encountersTotal;
  const stepped = Math.round(raw * 10) / 10;
  return normalizeParticipationWeight(stepped) ?? 0;
}

export function pickRaidInstance(
  analysis: CombatLogAnalysis,
  dungeonLabel: string
): InstanceSummary | null {
  if (analysis.instances.length === 0) return null;
  const parts = dungeonLabel
    .split(/[/|+]/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const scored = analysis.instances.map((inst) => {
    const name = inst.instanceName.toLowerCase();
    let score = 0;
    for (const part of parts) {
      if (!part) continue;
      if (name.includes(part) || part.includes(name)) score += 10;
    }
    return { inst, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.inst.totalEncounters - a.inst.totalEncounters;
  });

  if (scored[0]!.score > 0) return scored[0]!.inst;

  return [...analysis.instances].sort(
    (a, b) => b.totalEncounters - a.totalEncounters
  )[0]!;
}

export function buildWeightMapFromInstance(
  instance: InstanceSummary
): CombatLogWeightByCharacterName {
  const map = new Map<string, number>();
  for (const p of instance.players) {
    const w = encounterRatioToWeight(p.encountersPresent, p.encountersTotal);
    const key = normName(p.name);
    if (!key) continue;
    const prev = map.get(key);
    if (prev == null || w > prev) map.set(key, w);
  }
  return map;
}

export function combatLogPlayerNames(instance: InstanceSummary): Set<string> {
  const set = new Set<string>();
  for (const p of instance.players) {
    const n = normName(p.name);
    if (n) set.add(n);
  }
  return set;
}

export function summarizeInstanceForUi(instance: InstanceSummary): string {
  return `${instance.instanceName} · ${instance.totalEncounters} Encounters · ${instance.players.length} Spieler`;
}

export type { InstancePlayerSummary };
