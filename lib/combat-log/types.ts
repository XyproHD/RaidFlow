/** Parsed WoW player identity from combat log GUID / name fields. */
export interface CombatLogPlayer {
  /** Full combat-log GUID, e.g. `Player-6409-048B6E3B`. */
  blizzardGuid: string;
  /** Hex character UID from the GUID (Battle.net character id in log terms). */
  characterUid: string;
  /** Character name without realm, e.g. `Beerheals`. */
  name: string;
  /** Realm slug from log name, e.g. `Thunderstrike`. */
  realm: string;
  /** Region suffix when present, e.g. `EU`. */
  region: string | null;
  /** Raw log name field, e.g. `Beerheals-Thunderstrike-EU`. */
  displayName: string;
}

/** Per-character participation in one dungeon/raid instance. */
export interface InstancePlayerSummary extends CombatLogPlayer {
  /** Encounters the character took part in. */
  encountersPresent: number;
  /** Total encounter attempts in this instance (same value for all players). */
  encountersTotal: number;
}

/** Aggregated stats for one instance (e.g. SSC), not per boss. */
export interface InstanceSummary {
  instanceName: string;
  instanceMapId: number;
  instanceKey: string;
  /** Total ENCOUNTER attempts (Y). */
  totalEncounters: number;
  players: InstancePlayerSummary[];
}

export interface CombatLogMeta {
  fileName?: string;
  lineCount: number;
  parseDurationMs: number;
  /** Instance names found in the log. */
  instances: string[];
}

export interface CombatLogAnalysis {
  meta: CombatLogMeta;
  /** One entry per dungeon/raid instance (open world excluded). */
  instances: InstanceSummary[];
}

export interface ParseCombatLogOptions {
  fileName?: string;
  onProgress?: (progress: { linesProcessed: number; percent?: number }) => void;
}
