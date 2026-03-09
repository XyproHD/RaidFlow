/**
 * Konstanten für Profil: Raidzeiten-Slots (16–03 Uhr), Wochentage, Präferenzen.
 */

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
