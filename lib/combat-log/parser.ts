import { parseLogLine, csvFields, firstCsvField } from "./parse-line";
import { isSpuriousFollowUpEncounter } from "./encounter-merge";
import { instanceKey, parseMapChangePayload } from "./instance-map";
import {
  extractPlayersFromLine,
  mergePlayer,
  playerFromGuidAndName,
  playerKey,
} from "./player";
import type {
  CombatLogAnalysis,
  CombatLogPlayer,
  InstancePlayerSummary,
  InstanceSummary,
  ParseCombatLogOptions,
} from "./types";

interface CompletedEncounter {
  instanceKey: string;
  instanceName: string;
  instanceMapId: number;
  encounterId: number;
  bossName: string;
  startMs: number;
  endMs: number;
  success?: boolean;
  participants: Map<string, CombatLogPlayer>;
}

interface ActiveEncounter {
  instanceKey: string;
  instanceName: string;
  instanceMapId: number;
  encounterId: number;
  bossName: string;
  startMs: number;
  players: Map<string, CombatLogPlayer>;
}

export class CombatLogParser {
  private lineCount = 0;
  private instanceNames = new Set<string>();
  private completedEncounters: CompletedEncounter[] = [];

  private activeEncounter: ActiveEncounter | null = null;

  private inInstance = false;
  private currentMapId = 0;
  private currentInstanceName: string | null = null;
  private currentInstanceKey: string | null = null;

  processLine(raw: string): void {
    this.lineCount++;
    const parsed = parseLogLine(raw);
    if (!parsed) return;

    const { timestampMs: ts, event, payload, raw: line } = parsed;

    if (event === "MAP_CHANGE") {
      const ctx = parseMapChangePayload(payload);
      if (ctx) {
        this.inInstance = ctx.inInstance;
        this.currentMapId = ctx.mapId;
        if (ctx.inInstance) {
          this.currentInstanceName = ctx.mapName;
          this.currentInstanceKey = instanceKey(ctx.mapId, ctx.mapName);
          this.instanceNames.add(ctx.mapName);
        } else {
          this.currentInstanceName = null;
          this.currentInstanceKey = null;
        }
      }
    }

    if (event === "ENCOUNTER_START") {
      if (!this.inInstance || !this.currentInstanceKey || !this.currentInstanceName) {
        return;
      }
      const fields = csvFields(payload, 3);
      const encounterId = Number(fields[0]);
      const bossName = fields[1]?.replace(/^"|"$/g, "") ?? "Unknown";
      this.closeEncounter(ts);
      this.activeEncounter = {
        instanceKey: this.currentInstanceKey,
        instanceName: this.currentInstanceName,
        instanceMapId: this.currentMapId,
        encounterId,
        bossName,
        startMs: ts,
        players: new Map(),
      };
      return;
    }

    if (event === "COMBATANT_INFO" && this.activeEncounter) {
      const guid = firstCsvField(payload);
      const p = playerFromGuidAndName(guid, guid);
      if (p) this.addPlayer(this.activeEncounter.players, p);
      return;
    }

    if (event === "ENCOUNTER_END" && this.activeEncounter) {
      const fields = csvFields(payload, 5);
      const success = fields[4] === "1";
      this.ingestLinePlayers(this.activeEncounter.players, line);
      this.finishEncounter(ts, success);
      return;
    }

    if (this.activeEncounter) {
      this.ingestLinePlayers(this.activeEncounter.players, line);
    }
  }

  private addPlayer(map: Map<string, CombatLogPlayer>, player: CombatLogPlayer): void {
    const key = playerKey(player.blizzardGuid);
    const existing = map.get(key);
    map.set(key, existing ? mergePlayer(existing, player) : player);
  }

  private ingestLinePlayers(
    map: Map<string, CombatLogPlayer>,
    line: string,
  ): void {
    for (const p of extractPlayersFromLine(line)) {
      this.addPlayer(map, p);
    }
  }

  private mergeParticipants(
    into: Map<string, CombatLogPlayer>,
    from: Map<string, CombatLogPlayer>,
  ): void {
    for (const [key, player] of from) {
      const existing = into.get(key);
      into.set(key, existing ? mergePlayer(existing, player) : player);
    }
  }

  private commitEncounter(enc: CompletedEncounter): void {
    if (enc.participants.size === 0) return;

    const last = this.completedEncounters.at(-1);
    if (
      last &&
      isSpuriousFollowUpEncounter(last, enc)
    ) {
      this.mergeParticipants(last.participants, enc.participants);
      last.endMs = enc.endMs;
      return;
    }

    this.completedEncounters.push(enc);
  }

  private finishEncounter(endMs: number, success?: boolean): void {
    if (!this.activeEncounter) return;
    const enc = this.activeEncounter;
    this.activeEncounter = null;
    this.commitEncounter({
      instanceKey: enc.instanceKey,
      instanceName: enc.instanceName,
      instanceMapId: enc.instanceMapId,
      encounterId: enc.encounterId,
      bossName: enc.bossName,
      startMs: enc.startMs,
      endMs,
      success,
      participants: enc.players,
    });
  }

  private closeEncounter(endMs: number): void {
    if (!this.activeEncounter) return;
    this.finishEncounter(endMs);
  }

  private buildInstanceSummaries(): InstanceSummary[] {
    const byInstance = new Map<
      string,
      { instanceName: string; instanceMapId: number; encounters: CompletedEncounter[] }
    >();

    for (const enc of this.completedEncounters) {
      let bucket = byInstance.get(enc.instanceKey);
      if (!bucket) {
        bucket = {
          instanceName: enc.instanceName,
          instanceMapId: enc.instanceMapId,
          encounters: [],
        };
        byInstance.set(enc.instanceKey, bucket);
      }
      bucket.encounters.push(enc);
    }

    const summaries: InstanceSummary[] = [];

    for (const [key, bucket] of byInstance) {
      const y = bucket.encounters.length;
      const playerCounts = new Map<string, { player: CombatLogPlayer; count: number }>();

      for (const enc of bucket.encounters) {
        for (const [pKey, player] of enc.participants) {
          const row = playerCounts.get(pKey);
          if (row) {
            row.count++;
            row.player = mergePlayer(row.player, player);
          } else {
            playerCounts.set(pKey, { player, count: 1 });
          }
        }
      }

      const players: InstancePlayerSummary[] = [...playerCounts.values()]
        .map(({ player, count }) => ({
          ...player,
          encountersPresent: count,
          encountersTotal: y,
        }))
        .sort((a, b) => {
          if (b.encountersPresent !== a.encountersPresent) {
            return b.encountersPresent - a.encountersPresent;
          }
          return a.name.localeCompare(b.name, "de");
        });

      summaries.push({
        instanceName: bucket.instanceName,
        instanceMapId: bucket.instanceMapId,
        instanceKey: key,
        totalEncounters: y,
        players,
      });
    }

    summaries.sort((a, b) => a.instanceName.localeCompare(b.instanceName, "de"));
    return summaries;
  }

  finish(lastTs = Date.now()): CombatLogAnalysis {
    this.closeEncounter(lastTs);
    return {
      meta: {
        lineCount: this.lineCount,
        parseDurationMs: 0,
        instances: [...this.instanceNames].sort((a, b) => a.localeCompare(b, "de")),
      },
      instances: this.buildInstanceSummaries(),
    };
  }
}

/** Parse full text (for tests); prefer streaming API for large files. */
export function parseCombatLogText(
  text: string,
  options?: ParseCombatLogOptions,
): CombatLogAnalysis {
  const start = performance.now();
  const parser = new CombatLogParser();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    parser.processLine(lines[i]!);
    options?.onProgress?.({
      linesProcessed: i + 1,
      percent: lines.length ? ((i + 1) / lines.length) * 100 : undefined,
    });
  }
  const result = parser.finish();
  result.meta.parseDurationMs = performance.now() - start;
  result.meta.fileName = options?.fileName;
  return result;
}

/** Stream lines from a UTF-8 byte stream (browser File.stream()). */
export async function parseCombatLogStream(
  stream: ReadableStream<Uint8Array>,
  options?: ParseCombatLogOptions,
): Promise<CombatLogAnalysis> {
  const start = performance.now();
  const parser = new CombatLogParser();
  const decoder = new TextDecoder();
  let buffer = "";
  let linesProcessed = 0;

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        parser.processLine(line.endsWith("\r") ? line.slice(0, -1) : line);
        linesProcessed++;
        if (linesProcessed % 5000 === 0) {
          options?.onProgress?.({ linesProcessed });
        }
        nl = buffer.indexOf("\n");
      }
    }
    if (buffer.length) {
      parser.processLine(buffer);
      linesProcessed++;
    }
  } finally {
    reader.releaseLock();
  }

  const result = parser.finish();
  result.meta.parseDurationMs = performance.now() - start;
  result.meta.fileName = options?.fileName;
  result.meta.lineCount = linesProcessed;
  options?.onProgress?.({ linesProcessed, percent: 100 });
  return result;
}

/** Parse a browser File with streaming. */
export function parseCombatLogFile(
  file: File,
  options?: ParseCombatLogOptions,
): Promise<CombatLogAnalysis> {
  return parseCombatLogStream(file.stream(), {
    ...options,
    fileName: options?.fileName ?? file.name,
  });
}
