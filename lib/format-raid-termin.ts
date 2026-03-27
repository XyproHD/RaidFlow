/**
 * Einzeiler z. B. „23.03.26 19:00–23:30“ (Datum einmal, Zeitbereich).
 */
export function formatRaidTerminLine(
  locale: string,
  start: Date,
  end: Date | null
): string {
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const d = dateFmt.format(start);
  const t1 = timeFmt.format(start);
  if (!end) return `${d} ${t1}`;
  const t2 = timeFmt.format(end);
  return `${d} ${t1}–${t2}`;
}
