'use client';

import { useCallback, useState, useEffect } from 'react';
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
    if (WEEKDAYS.includes(s.weekday as typeof WEEKDAYS[number]) && g[s.weekday]) {
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
  const [preference, setPreference] = useState<PreferenceType>('likely');
  const [weekFocus, setWeekFocus] = useState<WeekFocusType | ''>(
    initialWeekFocus === 'weekday' ? 'weekday' : initialWeekFocus === 'weekend' ? 'weekend' : 'weekend'
  );
  const [grid, setGrid] = useState<Record<string, Record<string, CellValue>>>(() =>
    buildGridFromSlots(initialSlots)
  );
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'mark' | 'clear' | null>(null);

  useEffect(() => {
    setGrid(buildGridFromSlots(initialSlots));
    setWeekFocus(
      initialWeekFocus === 'weekday' ? 'weekday' : initialWeekFocus === 'weekend' ? 'weekend' : 'weekend'
    );
  }, [initialSlots, initialWeekFocus]);

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

  const handleSave = useCallback(async () => {
    const slots = collectSlots();
    await onSave(slots, weekFocus || null);
  }, [collectSlots, weekFocus, onSave]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium text-foreground">{t('preference')}:</span>
        <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
          <button
            type="button"
            onClick={() => setPreference('likely')}
            className={`rounded-md px-3 py-1.5 text-sm ${preference === 'likely' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {t('preferenceLikely')}
          </button>
          <button
            type="button"
            onClick={() => setPreference('maybe')}
            className={`rounded-md px-3 py-1.5 text-sm ${preference === 'maybe' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {t('preferenceMaybe')}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-2">
        <table
          className="w-full border-collapse select-none text-[10px] sm:text-xs"
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

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
        <span className="text-sm font-medium text-foreground">{t('weekFocus')}:</span>
        <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
          <button
            type="button"
            onClick={() => setWeekFocus('weekday')}
            className={`rounded-md px-3 py-1.5 text-sm ${weekFocus === 'weekday' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {t('weekFocusWeekday')}
          </button>
          <button
            type="button"
            onClick={() => setWeekFocus('weekend')}
            className={`rounded-md px-3 py-1.5 text-sm ${weekFocus === 'weekend' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {t('weekFocusWeekend')}
          </button>
        </div>
        <p className="text-muted-foreground text-xs max-w-md">
          {t('weekFocusHint')}
        </p>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {saving ? t('saving') : t('save')}
      </button>
    </div>
  );
}
