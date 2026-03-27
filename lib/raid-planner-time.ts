/**
 * Raid-Abend 16:00–03:00: Slots 00:00–03:00 liegen am nächsten Kalendertag zum gewählten Raid-Tag.
 */

import { TIME_SLOTS_30MIN } from '@/lib/profile-constants';

export function raidSlotToLocalDate(baseYmd: string, slot: string): Date {
  const [y, m, d] = baseYmd.split('-').map(Number);
  const [hh, mm] = slot.split(':').map(Number);
  let year = y ?? 2020;
  let month = m ?? 1;
  let day = d ?? 1;
  const h = hh ?? 0;
  if (h < 16) {
    const t = new Date(year, month - 1, day);
    t.setDate(t.getDate() + 1);
    year = t.getFullYear();
    month = t.getMonth() + 1;
    day = t.getDate();
  }
  return new Date(year, month - 1, day, h, mm ?? 0, 0, 0);
}

export function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

/** Inklusive Indizes von Start bis Ende im Uhrzeigersinn entlang 16→03. */
export function expandSlotIndicesForward(startIdx: number, endIdx: number): number[] {
  const slots = TIME_SLOTS_30MIN as readonly string[];
  const N = slots.length;
  const out: number[] = [];
  let i = startIdx;
  for (let guard = 0; guard <= N + 1; guard++) {
    out.push(i);
    if (i === endIdx) break;
    i = (i + 1) % N;
  }
  return out;
}

export function slotStringsForIndices(indices: number[]): string[] {
  const slots = TIME_SLOTS_30MIN as readonly string[];
  return indices.map((i) => slots[i] ?? '19:00');
}
