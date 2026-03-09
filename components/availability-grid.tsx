'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { WEEKDAYS, TIME_SLOTS_30MIN, type PreferenceType, type WeekFocusType } from '@/lib/profile-constants';

type CellValue = '' | 'likely' | 'maybe';

interface AvailabilityGridProps {
  initialSlots: { weekday: string; timeSlot: string; preference: string }[];
  initialWeekFocus: string | null;
  onSave: (slots: { weekday: string; timeSlot: string; preference: string }[], weekFocus: string | null) => Promise<void>;
  saving?: boolean;
}

export function AvailabilityGrid({
  initialSlots,
  initialWeekFocus,
  onSave,
  saving = false,
}: AvailabilityGridProps) {
  const t = useTranslations('profile');
  const [preference, setPreference] = useState<PreferenceType>('likely');
  const [weekFocus, setWeekFocus] = useState<WeekFocusType | ''>(initialWeekFocus === 'weekday' ? 'weekday' : initialWeekFocus === 'weekend' ? 'weekend' : '');
  const [grid, setGrid] = useState<Record<string, Record<string, CellValue>>>(() => {
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
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'mark' | 'clear' | null>(null);

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

  const handleClearDay = useCallback(
    (day: string) => {
      setGrid((prev) => {
        const next = { ...prev };
        next[day] = {};
        for (const s of TIME_SLOTS_30MIN) next[day][s] = '';
        const slots: { weekday: string; timeSlot: string; preference: string }[] = [];
        for (const d of WEEKDAYS) {
          const row = d === day ? next[d] : prev[d];
          if (!row) continue;
          for (const slot of TIME_SLOTS_30MIN) {
            const v = row[slot];
            if (v === 'likely' || v === 'maybe') slots.push({ weekday: d, timeSlot: slot, preference: v });
          }
        }
        onSave(slots, weekFocus || null);
        return next;
      });
    },
    [weekFocus, onSave]
  );

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

      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse select-none"
          role="grid"
          aria-label={t('raidTimes')}
          onMouseLeave={handleMouseUp}
          onMouseUp={handleMouseUp}
        >
          <thead>
            <tr>
              <th className="w-10 border border-border bg-muted/50 p-1 text-left text-xs font-medium text-muted-foreground">
                {t('weekday')}
              </th>
              {TIME_SLOTS_30MIN.map((slot) => (
                <th
                  key={slot}
                  className="min-w-[28px] max-w-[32px] border border-border bg-muted/50 p-0.5 text-center text-[10px] text-muted-foreground"
                >
                  {slot}
                </th>
              ))}
              <th className="w-8 border border-border bg-muted/50 p-0" aria-label={t('deleteRaidTime')} />
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day) => (
              <tr key={day}>
                <td className="border border-border bg-muted/30 p-1 text-xs font-medium text-foreground">
                  {day}
                </td>
                {TIME_SLOTS_30MIN.map((slot) => {
                  const val = grid[day]?.[slot] ?? '';
                  return (
                    <td
                      key={slot}
                      className="min-w-[28px] max-w-[32px] h-6 border border-border p-0"
                      onMouseDown={() => handleMouseDown(day, slot)}
                      onMouseEnter={() => handleMouseEnter(day, slot)}
                      role="gridcell"
                      aria-selected={!!val}
                    >
                      <span
                        className={`block h-full min-w-[24px] cursor-pointer ${
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
                <td className="border border-border p-0 align-middle">
                  <button
                    type="button"
                    onClick={() => handleClearDay(day)}
                    className="flex h-6 w-6 items-center justify-center text-destructive hover:bg-destructive/10 rounded"
                    aria-label={`${t('deleteRaidTime')} ${day}`}
                    title={`${day} ${t('deleteRaidTime')}`}
                  >
                    <span className="text-sm font-bold">×</span>
                  </button>
                </td>
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
