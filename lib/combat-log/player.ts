import type { CombatLogPlayer } from "./types";

const PLAYER_GUID_RE = /^Player-\d+-([0-9A-Fa-f]+)$/;

/** True when the log supplied a character name, not only a GUID / UID placeholder. */
export function hasResolvedDisplayName(
  displayName: string,
  blizzardGuid: string,
): boolean {
  if (!displayName || displayName === blizzardGuid) return false;
  if (displayName.startsWith("Player-")) return false;
  return displayName.includes("-");
}

/** Split `Name-Realm-Region` or `Name-Realm` from advanced combat log names. */
export function parsePlayerDisplayName(displayName: string): Pick<
  CombatLogPlayer,
  "name" | "realm" | "region"
> {
  const parts = displayName.split("-");
  if (parts.length >= 3) {
    const region = parts[parts.length - 1]!;
    const realm = parts[parts.length - 2]!;
    const name = parts.slice(0, -2).join("-");
    return { name, realm, region };
  }
  if (parts.length === 2) {
    return { name: parts[0]!, realm: parts[1]!, region: null };
  }
  return { name: displayName, realm: "", region: null };
}

export function playerFromGuidAndName(
  guid: string,
  displayName: string,
): CombatLogPlayer | null {
  if (!guid.startsWith("Player-")) return null;
  const m = PLAYER_GUID_RE.exec(guid);
  const characterUid = m?.[1] ?? guid.split("-").pop() ?? guid;
  const resolved = hasResolvedDisplayName(displayName, guid);
  const { name, realm, region } = resolved
    ? parsePlayerDisplayName(displayName)
    : { name: characterUid, realm: "", region: null };
  return {
    blizzardGuid: guid,
    characterUid,
    name,
    realm,
    region,
    displayName: resolved ? displayName : guid,
  };
}

/** Prefer richer display names when the same GUID appears again. */
export function mergePlayer(
  existing: CombatLogPlayer,
  incoming: CombatLogPlayer,
): CombatLogPlayer {
  const existingOk = hasResolvedDisplayName(
    existing.displayName,
    existing.blizzardGuid,
  );
  const incomingOk = hasResolvedDisplayName(
    incoming.displayName,
    incoming.blizzardGuid,
  );
  if (!existingOk && incomingOk) return incoming;
  if (existingOk && incomingOk && incoming.name !== incoming.characterUid) {
    return incoming;
  }
  return existing;
}

/** Extract `Player-…` tokens with following quoted name from a line tail. */
export function extractPlayersFromLine(line: string): CombatLogPlayer[] {
  const found: CombatLogPlayer[] = [];
  const re = /Player-\d+-[0-9A-Fa-f]+,"(?:[^"\\]|\\.)*"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const chunk = m[0];
    const comma = chunk.indexOf(",");
    if (comma === -1) continue;
    const guid = chunk.slice(0, comma);
    const nameRaw = chunk.slice(comma + 2, -1);
    const p = playerFromGuidAndName(guid, nameRaw);
    if (p) found.push(p);
  }
  return found;
}

export function playerKey(guid: string): string {
  return guid.toLowerCase();
}
