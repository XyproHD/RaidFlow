/**
 * Konstanten für Profil: Raidzeiten (30-Min-Slots 16–03 Uhr), Wochentage, Präferenzen.
 */

/** 30-Minuten-Slots von 16:00 bis 03:00 (22 Slots) */
export const TIME_SLOTS_30MIN = [
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30',
  '00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00',
] as const;

/** Legacy 1h-Slots (für Kompatibilität) */
export const TIME_SLOTS = [
  '16-17', '17-18', '18-19', '19-20', '20-21', '21-22', '22-23', '23-00',
  '00-01', '01-02', '02-03',
] as const;

export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const WEEKDAY_ALL = 'all' as const;

export const PREFERENCE_LIKELY = 'likely';
export const PREFERENCE_MAYBE = 'maybe';
export type PreferenceType = typeof PREFERENCE_LIKELY | typeof PREFERENCE_MAYBE;

export const WEEK_FOCUS_WEEKDAY = 'weekday';
export const WEEK_FOCUS_WEEKEND = 'weekend';
export type WeekFocusType = typeof WEEK_FOCUS_WEEKDAY | typeof WEEK_FOCUS_WEEKEND;
