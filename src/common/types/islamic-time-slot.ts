/**
 * Islamic time slots based on daily prayer times.
 * Used for scheduling habits and tasks.
 */
export const ISLAMIC_TIME_SLOTS = [
  'after_fajr',
  'before_dhuhr',
  'after_dhuhr',
  'before_asr',
  'after_asr',
  'before_maghrib',
  'after_maghrib',
  'before_isha',
  'after_isha',
] as const;

export type IslamicTimeSlot = (typeof ISLAMIC_TIME_SLOTS)[number];

/**
 * Days of the week for habit scheduling.
 */
export const DAYS_OF_WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];
