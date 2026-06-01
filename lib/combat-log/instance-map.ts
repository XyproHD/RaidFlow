/** Continent / city map IDs (open world) — not counted as instances. */
const OPEN_WORLD_MAP_IDS = new Set([
  0, 1, 530, 571, 870, 1116, 1220, 1642, 2222,
  1946, // Outland zones (e.g. Zangarmarschen outdoor)
  1955, // Shattrath
]);

/**
 * Instance interior maps use lower Z in TBC/outland logs;
 * outdoor Zangarmarsh etc. uses very high Z (~9475).
 */
const OUTDOOR_Z_THRESHOLD = 2000;

export interface MapContext {
  mapId: number;
  mapName: string;
  inInstance: boolean;
}

export function parseMapChangePayload(payload: string): MapContext | null {
  const comma1 = payload.indexOf(",");
  if (comma1 === -1) return null;

  const mapId = Number(payload.slice(0, comma1));
  if (!Number.isFinite(mapId)) return null;

  let mapName: string;
  let rest: string;
  if (payload[comma1 + 1] === '"') {
    let end = comma1 + 2;
    while (end < payload.length && payload[end] !== '"') end++;
    mapName = payload.slice(comma1 + 2, end);
    rest = payload.slice(end + 2);
  } else {
    const comma2 = payload.indexOf(",", comma1 + 1);
    if (comma2 === -1) return null;
    mapName = payload.slice(comma1 + 1, comma2);
    rest = payload.slice(comma2);
  }

  const coords = rest.split(",").map((s) => Number(s.trim()));
  const z = coords[2];
  const openWorld =
    OPEN_WORLD_MAP_IDS.has(mapId) ||
    (Number.isFinite(z) && z > OUTDOOR_Z_THRESHOLD);

  return {
    mapId,
    mapName,
    inInstance: !openWorld,
  };
}

export function instanceKey(mapId: number, mapName: string): string {
  return `${mapId}:${mapName}`;
}
