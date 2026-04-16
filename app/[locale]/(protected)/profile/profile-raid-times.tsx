'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useMemo } from 'react';
import { AvailabilityGrid } from '@/components/availability-grid';

type RaidTimeRow = {
  id: string;
  weekday: string;
  timeSlot: string;
  preference: string;
  weekFocus: string | null;
};

type Slot = { weekday: string; timeSlot: string; preference: string };

export function ProfileRaidTimes({ initialData }: { initialData: RaidTimeRow[] }) {
  const t = useTranslations('profile');
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  /** Nach Speichern: gespeicherte Slots anzeigen, damit die Auswahl nicht verschwindet (bis Reload). */
  const [lastSavedSlots, setLastSavedSlots] = useState<Slot[] | null>(null);
  const [lastSavedWeekFocus, setLastSavedWeekFocus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const serverSlots = useMemo(
    () =>
      initialData.map((r) => ({
        weekday: r.weekday,
        timeSlot: r.timeSlot,
        preference: r.preference,
      })),
    [initialData]
  );
  const serverWeekFocus = initialData[0]?.weekFocus ?? null;

  const initialSlots = lastSavedSlots ?? serverSlots;
  const initialWeekFocus = lastSavedWeekFocus ?? serverWeekFocus;

  const handleSave = async (slots: Slot[], weekFocus: string | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/user/raid-times/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slots, weekFocus }),
      });
      if (res.ok) {
        setLastSavedSlots(slots);
        setLastSavedWeekFocus(weekFocus);
        router.refresh();
      } else {
        const text = await res.text();
        let msg = 'Raidzeiten speichern fehlgeschlagen.';
        try {
          const data = JSON.parse(text);
          if (data?.error) msg = data.error;
        } catch {
          if (text) msg = text;
        }
        setSaveError(msg);
        console.error('Raidzeiten speichern fehlgeschlagen:', res.status, msg);
      }
    } catch (err) {
      setSaveError('Raidzeiten speichern fehlgeschlagen.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-8" aria-labelledby="raid-times-heading">
      <div className="pb-3 border-b border-border mb-4">
        <h2 id="raid-times-heading" className="text-base font-semibold text-foreground tracking-tight">
          {t('raidTimes')}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">{t('raidTimesDescription')}</p>
      </div>
      {saveError && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {saveError}
        </div>
      )}
      <AvailabilityGrid
        initialSlots={initialSlots}
        initialWeekFocus={initialWeekFocus}
        onSave={handleSave}
        saving={saving}
      />
    </section>
  );
}
