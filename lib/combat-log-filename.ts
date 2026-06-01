/** WoW default: `WoWCombatLog-MMDDYY_HHMMSS.txt` (local file creation time). */
const WOW_LOG_NAME_RE = /^WoWCombatLog-(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.txt$/i;

export interface ParsedCombatLogFileDate {
  /** Calendar date at local midnight (from filename). */
  date: Date;
  fileName: string;
}

export function parseCombatLogFileName(fileName: string): ParsedCombatLogFileDate | null {
  const base = fileName.replace(/^.*[/\\]/, '').trim();
  const m = WOW_LOG_NAME_RE.exec(base);
  if (!m) return null;
  const [, mm, dd, yy, hh, min, sec] = m;
  const year = 2000 + Number(yy);
  const month = Number(mm) - 1;
  const day = Number(dd);
  const date = new Date(year, month, day, Number(hh), Number(min), Number(sec));
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return { date, fileName: base };
}

/** Same calendar day in local timezone. */
export function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatCombatLogFileDateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function combatLogDateMatchesRaid(
  fileName: string,
  raidScheduledAtIso: string,
  raidScheduledEndAtIso: string | null
): { ok: boolean; logDate: Date | null; raidDay: Date } {
  const parsed = parseCombatLogFileName(fileName);
  const raidStart = new Date(raidScheduledAtIso);
  const raidEnd = raidScheduledEndAtIso ? new Date(raidScheduledEndAtIso) : null;
  const raidDay = raidEnd && !Number.isNaN(raidEnd.getTime()) ? raidEnd : raidStart;

  if (!parsed) {
    return { ok: false, logDate: null, raidDay };
  }

  const logDay = new Date(
    parsed.date.getFullYear(),
    parsed.date.getMonth(),
    parsed.date.getDate()
  );
  const raidDayLocal = new Date(
    raidDay.getFullYear(),
    raidDay.getMonth(),
    raidDay.getDate()
  );

  return {
    ok: isSameLocalCalendarDay(logDay, raidDayLocal),
    logDate: parsed.date,
    raidDay: raidDayLocal,
  };
}
