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
  return buildWeightMapFromInstances([instance]);
}

export function buildWeightMapFromInstances(
  instances: InstanceSummary[]
): CombatLogWeightByCharacterName {
  const map = new Map<string, number>();
  if (instances.length === 0) return map;

  const totalEncounters = instances.reduce((s, i) => s + i.totalEncounters, 0);
  if (totalEncounters <= 0) return map;

  const presentByName = new Map<string, number>();
  for (const inst of instances) {
    for (const p of inst.players) {
      const key = normName(p.name);
      if (!key) continue;
      presentByName.set(key, (presentByName.get(key) ?? 0) + p.encountersPresent);
    }
  }

  for (const [name, present] of presentByName) {
    map.set(name, encounterRatioToWeight(present, totalEncounters));
  }
  return map;
}

export function defaultSelectedInstanceKeys(
  analysis: CombatLogAnalysis,
  dungeonLabel: string
): Set<string> {
  const keys = new Set<string>();
  if (analysis.instances.length === 0) return keys;

  const parts = dungeonLabel
    .split(/[/|+]/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const matched = analysis.instances.filter((inst) => {
    const name = inst.instanceName.toLowerCase();
    return parts.some(
      (part) => part && (name.includes(part) || part.includes(name))
    );
  });

  if (matched.length > 0) {
    for (const inst of matched) keys.add(inst.instanceKey);
    return keys;
  }

  const best = [...analysis.instances].sort(
    (a, b) => b.totalEncounters - a.totalEncounters
  )[0];
  if (best) keys.add(best.instanceKey);
  return keys;
}

export function summarizeInstancesForUi(instances: InstanceSummary[]): string {
  if (instances.length === 0) return '—';
  return instances.map(summarizeInstanceForUi).join('; ');
}

export function summarizeInstanceForUi(instance: InstanceSummary): string {
  return `${instance.instanceName} · ${instance.totalEncounters} Encounters · ${instance.players.length} Spieler`;
}

export type { InstancePlayerSummary };
