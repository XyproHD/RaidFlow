/**
 * Verfügbarkeit für Raidplaner (DatePicker): Wochentag, Slot, Farbe pro Charakter.
 */

import { TIME_SLOTS_30MIN } from '@/lib/profile-constants';

/** Wochentags-Kürzel wie im Profil-Grid: Mo … So */
const JS_DAY_TO_RF: Record<number, string> = {
  0: 'So',
  1: 'Mo',
  2: 'Di',
  3: 'Mi',
  4: 'Do',
  5: 'Fr',
  6: 'Sa',
};

export type AvailabilityRowColor = 'green' | 'orange' | 'gray';

export function dateToRfWeekday(d: Date): string {
  return JS_DAY_TO_RF[d.getDay()] ?? 'Mo';
}

/** Rundet auf den 30-Minuten-Slot (lokale Zeit), z. B. 20:44 → "20:30". */
export function dateToTimeSlot30(d: Date): string {
  const total = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.floor(total / 30) * 30;
  const hh = Math.floor(rounded / 60) % 24;
  const mm = rounded % 60;
  return `${hh}:${mm === 0 ? '00' : '30'}`;
}

/** Prüft, ob ein Slot-String in der erlaubten Raidzeit 16:00–03:00 liegt. */
export function isRaidPlannerTimeSlot(slot: string): boolean {
  return (TIME_SLOTS_30MIN as readonly string[]).includes(slot);
}

export interface PrefSlot {
  weekday: string;
  timeSlot: string;
  preference: string;
}

function toneForSlot(
  slots: PrefSlot[],
  weekday: string,
  timeSlot: string
): 'likely' | 'maybe' | 'empty' {
  const hit = slots.find((s) => s.weekday === weekday && s.timeSlot === timeSlot);
  if (!hit) return 'empty';
  if (hit.preference === 'likely') return 'likely';
  if (hit.preference === 'maybe') return 'maybe';
  return 'empty';
}

/**
 * Farbe für einen Charakter am gewählten Raid-Termin (ein 30-Min-Slot).
 * Grün = wahrscheinlich, Orange = eventuell, Grau = nicht / außerhalb.
 */
export function availabilityColorForRaidStart(
  prefSlots: PrefSlot[],
  scheduledAt: Date
): AvailabilityRowColor {
  const wd = dateToRfWeekday(scheduledAt);
  let slot = dateToTimeSlot30(scheduledAt);
  if (!isRaidPlannerTimeSlot(slot)) {
    slot = '20:00';
  }
  const t = toneForSlot(prefSlots, wd, slot);
  if (t === 'likely') return 'green';
  if (t === 'maybe') return 'orange';
  return 'gray';
}
