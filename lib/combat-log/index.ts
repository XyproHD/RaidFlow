export type {
  CombatLogAnalysis,
  CombatLogMeta,
  CombatLogPlayer,
  InstancePlayerSummary,
  InstanceSummary,
  ParseCombatLogOptions,
} from "./types";

export {
  CombatLogParser,
  parseCombatLogFile,
  parseCombatLogStream,
  parseCombatLogText,
} from "./parser";

export {
  hasResolvedDisplayName,
  parsePlayerDisplayName,
  playerFromGuidAndName,
} from "./player";
export { parseMapChangePayload } from "./instance-map";
export {
  isSpuriousFollowUpEncounter,
  SPURIOUS_ENCOUNTER_GAP_MS,
  SPURIOUS_ENCOUNTER_MAX_DURATION_MS,
} from "./encounter-merge";
