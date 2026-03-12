'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { WEEKDAYS, TIME_SLOTS_30MIN, type PreferenceType, type WeekFocusType } from '@/lib/profile-constants';

type CellValue = '' | 'likely' | 'maybe';

interface AvailabilityGridProps {
  initialSlots: { weekday: string; timeSlot: string; preference: string }[];
  initialWeekFocus: string | null;
  onSave: (slots: { weekday: string; timeSlot: string; preference: string }[], weekFocus: string | null) => Promise<void>;
  saving?: boolean;
}

function buildGridFromSlots(
  initialSlots: { weekday: string; timeSlot: string; preference: string }[]
): Record<string, Record<string, CellValue>> {
  const g: Record<string, Record<string, CellValue>> = {};
  for (const d of WEEKDAYS) {
    g[d] = {};
    for (const slot of TIME_SLOTS_30MIN) {
      g[d][slot] = '';
    }
  }
  for (const s of initialSlots) {
    if (WEEKDAYS.includes(s.weekday as (typeof WEEKDAYS)[number]) && g[s.weekday]) {
      const val = s.preference === 'likely' ? 'likely' : s.preference === 'maybe' ? 'maybe' : '';
      if (val) g[s.weekday][s.timeSlot] = val;
    }
  }
  return g;
}

export function AvailabilityGrid({
  initialSlots,
  initialWeekFocus,
  onSave,
  saving = false,
}: AvailabilityGridProps) {
  const t = useTranslations('profile');
  const initialFocus: WeekFocusType | '' =
    initialWeekFocus === 'weekday' ? 'weekday' : initialWeekFocus === 'weekend' ? 'weekend' : 'weekend';

  const [preference, setPreference] = useState<PreferenceType>('likely');
  const [weekFocus, setWeekFocus] = useState<WeekFocusType | ''>(initialFocus);
  const [grid, setGrid] = useState<Record<string, Record<string, CellValue>>>(() =>
    buildGridFromSlots(initialSlots)
  );
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'mark' | 'clear' | null>(null);

  useEffect(() => {
    setGrid(buildGridFromSlots(initialSlots));
    setWeekFocus(initialFocus);
  }, [initialSlots, initialWeekFocus, initialFocus]);

  const setCell = useCallback((day: string, slot: string, value: CellValue) => {
    setGrid((prev) => {
      const next = { ...prev };
      if (!next[day]) next[day] = { ...prev[day] };
      next[day] = { ...next[day], [slot]: value };
      return next;
    });
  }, []);

  const handleMouseDown = useCallback(
    (day: string, slot: string) => {
      const current = grid[day]?.[slot] ?? '';
      const willMark = current === '' ? true : current !== preference;
      setIsDragging(true);
      setDragMode(willMark ? 'mark' : 'clear');
      setCell(day, slot, willMark ? preference : '');
    },
    [grid, preference, setCell]
  );

  const handleMouseEnter = useCallback(
    (day: string, slot: string) => {
      if (!isDragging || dragMode === null) return;
      setCell(day, slot, dragMode === 'mark' ? preference : '');
    },
    [isDragging, dragMode, preference, setCell]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragMode(null);
  }, []);

  const collectSlots = useCallback(() => {
    const slots: { weekday: string; timeSlot: string; preference: string }[] = [];
    for (const day of WEEKDAYS) {
      const row = grid[day];
      if (!row) continue;
      for (const slot of TIME_SLOTS_30MIN) {
        const v = row[slot];
        if (v === 'likely' || v === 'maybe') slots.push({ weekday: day, timeSlot: slot, preference: v });
      }
    }
    return slots;
  }, [grid]);

  const isGridDirty = useMemo(() => {
    const initial = buildGridFromSlots(initialSlots);
    for (const day of WEEKDAYS) {
      for (const slot of TIME_SLOTS_30MIN) {
        if ((grid[day]?.[slot] ?? '') !== (initial[day]?.[slot] ?? '')) return true;
      }
    }
    return false;
  }, [grid, initialSlots]);

  const isFocusDirty = weekFocus !== initialFocus;
  const isDirty = isGridDirty || isFocusDirty;

  const handleSave = useCallback(async () => {
    if (!isDirty) return;
    const slots = collectSlots();
    await onSave(slots, weekFocus || null);
  }, [collectSlots, weekFocus, onSave, isDirty]);

  return (
    <div className="relative">
      {saving && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-muted-foreground">{t('savingInProgress')}</p>
        </div>
      )}

      <div
        className={`grid gap-6 sm:grid-cols-[1fr_auto] ${saving ? 'pointer-events-none select-none opacity-60' : ''}`}
      >
        {/* Linke Spalte: Zeitslot-Tabelle + Legende */}
        <div className="space-y-3">
          <div className="overflow-x-auto -mx-2 w-max max-w-full">
            <table
              className="border-collapse select-none text-[10px] sm:text-xs"
              role="grid"
              aria-label={t('raidTimes')}
              onMouseLeave={handleMouseUp}
              onMouseUp={handleMouseUp}
            >
              <thead>
                <tr>
                  <th className="w-9 min-w-[36px] border border-border bg-muted/50 p-0.5 text-left font-medium text-muted-foreground">
                    {t('timeSlot')}
                  </th>
                  {WEEKDAYS.map((day) => (
                    <th
                      key={day}
                      className="w-7 min-w-[28px] max-w-[32px] border border-border bg-muted/50 p-0.5 text-center font-medium text-muted-foreground"
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS_30MIN.map((slot) => (
                  <tr key={slot}>
                    <td className="border border-border bg-muted/30 p-0.5 font-medium text-foreground whitespace-nowrap">
                      {slot}
                    </td>
                    {WEEKDAYS.map((day) => {
                      const val = grid[day]?.[slot] ?? '';
                      return (
                        <td
                          key={day}
                          className="w-7 min-w-[28px] max-w-[32px] h-5 sm:h-6 border border-border p-0"
                          onMouseDown={() => handleMouseDown(day, slot)}
                          onMouseEnter={() => handleMouseEnter(day, slot)}
                          role="gridcell"
                          aria-selected={!!val}
                        >
                          <span
                            className={`block h-full min-h-[20px] min-w-[24px] cursor-pointer ${
                              val === 'likely'
                                ? 'bg-green-500/80 hover:bg-green-500'
                                : val === 'maybe'
                                  ? 'bg-amber-500/80 hover:bg-amber-500'
                                  : 'bg-background hover:bg-muted/50'
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs" role="note">
            <span className="inline-block w-3 h-3 bg-amber-500/80 rounded-sm align-middle mr-1" aria-hidden />
            {t('legendMaybe')} |{' '}
            <span className="inline-block w-3 h-3 bg-green-500/80 rounded-sm align-middle mr-1" aria-hidden />
            {t('legendLikely')}
          </p>
        </div>

        {/* Rechte Spalte: Markieren als (übereinander), Fokus, Speichern */}
        <div className="flex flex-col gap-4 min-w-[140px]">
          <div>
            <p className="text-sm font-medium text-foreground mb-2">{t('markAs')}</p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setPreference('likely')}
                className={`rounded-md border px-3 py-2 text-sm text-left w-full ${
                  preference === 'likely'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {t('preferenceLikely')}
              </button>
              <button
                type="button"
                onClick={() => setPreference('maybe')}
                className={`rounded-md border px-3 py-2 text-sm text-left w-full ${
                  preference === 'maybe'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {t('preferenceMaybe')}
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">{t('weekFocus')}</p>
            <div className="flex rounded-lg border border-border p-0.5 bg-muted/30 flex-col sm:flex-row gap-0.5">
              <button
                type="button"
                onClick={() => setWeekFocus('weekday')}
                className={`rounded-md px-3 py-1.5 text-sm flex-1 ${weekFocus === 'weekday' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {t('weekFocusWeekday')}
              </button>
              <button
                type="button"
                onClick={() => setWeekFocus('weekend')}
                className={`rounded-md px-3 py-1.5 text-sm flex-1 ${weekFocus === 'weekend' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {t('weekFocusWeekend')}
              </button>
            </div>
            <p className="text-muted-foreground text-xs mt-1.5 max-w-[200px]">{t('weekFocusHint')}</p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="mt-auto rounded bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
