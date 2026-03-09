'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TIME_SLOTS, WEEKDAYS, WEEKDAY_ALL } from '@/lib/profile-constants';

type RaidTimeRow = {
  id: string;
  weekday: string;
  timeSlot: string;
  preference: string;
  weekFocus: string | null;
};

export function ProfileRaidTimes({ initialData }: { initialData: RaidTimeRow[] }) {
  const t = useTranslations('profile');
  const router = useRouter();
  const [list, setList] = useState(initialData);
  const [weekday, setWeekday] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [preference, setPreference] = useState('likely');
  const [weekFocus, setWeekFocus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weekday || !timeSlot) return;
    setLoading(true);
    try {
      const res = await fetch('/api/user/raid-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekday,
          timeSlot,
          preference,
          weekFocus: weekFocus || null,
        }),
      });
      if (res.ok) {
        router.refresh();
        const data = await res.json();
        setList((prev) => [...prev, data.raidTime]);
        setWeekday('');
        setTimeSlot('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/raid-times/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
        setList((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-8" aria-labelledby="raid-times-heading">
      <h2 id="raid-times-heading" className="text-lg font-semibold text-foreground mb-2">
        {t('raidTimes')}
      </h2>
      <p className="text-muted-foreground text-sm mb-4">{t('raidTimesDescription')}</p>
      {list.length === 0 ? (
        <p className="text-muted-foreground text-sm mb-4">{t('noRaidTimes')}</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {list.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 p-2 rounded border border-border bg-card text-sm"
            >
              <span>{r.weekday === WEEKDAY_ALL ? t('weekdayAll') : r.weekday}</span>
              <span>{r.timeSlot}</span>
              <span>{r.preference === 'likely' ? t('preferenceLikely') : t('preferenceMaybe')}</span>
              {r.weekFocus && (
                <span>{r.weekFocus === 'weekend' ? t('weekFocusWeekend') : t('weekFocusWeekday')}</span>
              )}
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                disabled={loading}
                className="text-destructive hover:underline text-xs"
              >
                {t('deleteRaidTime')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1 text-sm">
          {t('weekday')}
          <select
            value={weekday}
            onChange={(e) => setWeekday(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1 min-w-[100px]"
          >
            <option value="">–</option>
            <option value={WEEKDAY_ALL}>{t('weekdayAll')}</option>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('timeSlot')}
          <select
            value={timeSlot}
            onChange={(e) => setTimeSlot(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1 min-w-[80px]"
          >
            <option value="">–</option>
            {TIME_SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('preference')}
          <select
            value={preference}
            onChange={(e) => setPreference(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1"
          >
            <option value="likely">{t('preferenceLikely')}</option>
            <option value="maybe">{t('preferenceMaybe')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('weekFocus')}
          <select
            value={weekFocus}
            onChange={(e) => setWeekFocus(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1"
          >
            <option value="">–</option>
            <option value="weekday">{t('weekFocusWeekday')}</option>
            <option value="weekend">{t('weekFocusWeekend')}</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={loading || !weekday || !timeSlot}
          className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
        >
          {t('addRaidTime')}
        </button>
      </form>
    </section>
  );
}
