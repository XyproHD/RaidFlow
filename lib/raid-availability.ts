/**
 * Verfügbarkeit für Raidplaner (DatePicker): Wochentag, Slot, Farbe pro Charakter.
 */

import { TIME_SLOTS_30MIN } from '@/lib/profile-constants';
import { raidSlotToLocalDate } from '@/lib/raid-planner-time';

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

export function toneForSlot(
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
 * Verfügbarkeit über mehrere 30-Min-Slots (Raid-Zeitfenster).
 * Grau, sobald ein Slot leer ist; sonst Orange wenn mind. ein „eventuell“.
 */
export function availabilityColorForSlotRange(
  prefSlots: PrefSlot[],
  weekday: string,
  timeSlots: string[]
): AvailabilityRowColor {
  if (timeSlots.length === 0) return 'gray';
  let sawMaybe = false;
  for (const slot of timeSlots) {
    const t = toneForSlot(prefSlots, weekday, slot);
    if (t === 'empty') return 'gray';
    if (t === 'maybe') sawMaybe = true;
  }
  return sawMaybe ? 'orange' : 'green';
}

/** Mehrere Slots mit korrektem Wochentag pro Slot (über Mitternacht). */
export function availabilityColorForRaidWindow(
  prefSlots: PrefSlot[],
  baseYmd: string,
  timeSlots: string[]
): AvailabilityRowColor {
  if (timeSlots.length === 0) return 'gray';
  let sawMaybe = false;
  for (const slot of timeSlots) {
    const wd = dateToRfWeekday(raidSlotToLocalDate(baseYmd, slot));
    const t = toneForSlot(prefSlots, wd, slot);
    if (t === 'empty') return 'gray';
    if (t === 'maybe') sawMaybe = true;
  }
  return sawMaybe ? 'orange' : 'green';
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

export type SlotHeat = 'green' | 'yellow' | 'orange' | 'red';

/** Erfüllungsgrad der Mindest-Spec-Zeilen (nur Zeilen mit count > 0). */
export function specFulfillmentRatio(
  counts: Record<string, number>,
  minSpecRows: { spec: string; count: number }[]
): number {
  const rows = minSpecRows.filter((r) => r.spec && r.count > 0);
  if (rows.length === 0) return 1;
  let met = 0;
  for (const r of rows) {
    if ((counts[r.spec] ?? 0) >= r.count) met += 1;
  }
  return met / rows.length;
}
