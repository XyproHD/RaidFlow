export interface ParsedLogLine {
  timestampMs: number;
  event: string;
  payload: string;
  raw: string;
}

const LINE_RE =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\.(\d+)\s{2}([A-Z0-9_]+),(.*)$/;

export function parseLogLine(raw: string): ParsedLogLine | null {
  const line = raw.trimEnd();
  if (!line) return null;
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const [, mo, da, yr, hh, mm, ss, frac, event, payload] = m;
  const ms = Date.UTC(
    Number(yr),
    Number(mo) - 1,
    Number(da),
    Number(hh),
    Number(mm),
    Number(ss),
    Number(frac.padEnd(3, "0").slice(0, 3)),
  );
  return { timestampMs: ms, event, payload, raw: line };
}

/** First CSV field (handles quoted strings). */
export function firstCsvField(payload: string): string {
  if (payload.startsWith('"')) {
    let i = 1;
    while (i < payload.length) {
      if (payload[i] === "\\") {
        i += 2;
        continue;
      }
      if (payload[i] === '"') return payload.slice(1, i);
      i++;
    }
  }
  const comma = payload.indexOf(",");
  return comma === -1 ? payload : payload.slice(0, comma);
}

export function csvFields(payload: string, max = 8): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < payload.length && out.length < max) {
    if (payload[i] === '"') {
      let j = i + 1;
      let val = "";
      while (j < payload.length) {
        if (payload[j] === "\\") {
          val += payload[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (payload[j] === '"') {
          out.push(val);
          j++;
          if (payload[j] === ",") j++;
          i = j;
          break;
        }
        val += payload[j];
        j++;
      }
      if (j >= payload.length) break;
      continue;
    }
    const comma = payload.indexOf(",", i);
    if (comma === -1) {
      out.push(payload.slice(i));
      break;
    }
    out.push(payload.slice(i, comma));
    i = comma + 1;
  }
  return out;
}
