'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AvailabilityGrid } from '@/components/availability-grid';

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
  const [saving, setSaving] = useState(false);

  const initialSlots = initialData.map((r) => ({
    weekday: r.weekday,
    timeSlot: r.timeSlot,
    preference: r.preference,
  }));
  const initialWeekFocus = initialData[0]?.weekFocus ?? null;

  const handleSave = async (
    slots: { weekday: string; timeSlot: string; preference: string }[],
    weekFocus: string | null
  ) => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/raid-times/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slots, weekFocus }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Raidzeiten speichern fehlgeschlagen:', res.status, err);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-8" aria-labelledby="raid-times-heading">
      <h2 id="raid-times-heading" className="text-lg font-semibold text-foreground mb-2">
        {t('raidTimes')}
      </h2>
      <p className="text-muted-foreground text-sm mb-4">{t('raidTimesDescription')}</p>
      <AvailabilityGrid
        initialSlots={initialSlots}
        initialWeekFocus={initialWeekFocus}
        onSave={handleSave}
        saving={saving}
      />
    </section>
  );
}
