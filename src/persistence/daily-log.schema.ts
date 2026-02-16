import { z } from 'zod';

import { ISLAMIC_TIME_SLOTS } from '../common/types/islamic-time-slot';

/**
 * Status for a habit or task entry.
 */
export const STATUS_VALUES = ['pending', 'done', 'skipped', 'shifted'] as const;
export type Status = (typeof STATUS_VALUES)[number];

/**
 * Schema for a habit entry in the daily log.
 */
export const habitEntrySchema = z.object({
  /** Reference to the habit ID */
  habitId: z.string(),

  /** Current status */
  status: z.enum(STATUS_VALUES).default('pending'),

  /** Justification for skipping (if status is 'skipped') */
  justification: z.string().nullable().default(null),

  /** Timestamp when completed (ISO string) */
  completedAt: z.string().nullable().default(null),

  /** Associated image paths */
  images: z.array(z.string()).default([]),
});

export type HabitEntry = z.infer<typeof habitEntrySchema>;

/**
 * Schema for a task entry in the daily log.
 */
export const taskEntrySchema = z.object({
  /** Unique task ID (e.g., "t-001") */
  id: z.string(),

  /** Task title */
  title: z.string(),

  /** Optional description */
  description: z.string().optional(),

  /** Islamic time slot for the task */
  islamicTimeSlot: z.enum(ISLAMIC_TIME_SLOTS),

  /** Current status */
  status: z.enum(STATUS_VALUES).default('pending'),

  /** If shifted, the target date (ISO date string) */
  shiftedTo: z.string().optional(),

  /** Reason for shifting */
  shiftReason: z.string().optional(),

  /** Origin date if this task was shifted from another day */
  origin: z.string().optional(),

  /** Timestamp when completed (ISO string) */
  completedAt: z.string().nullable().default(null),

  /** Timestamp when created (ISO string) */
  createdAt: z.string(),

  /** Associated image paths */
  images: z.array(z.string()).default([]),
});

export type TaskEntry = z.infer<typeof taskEntrySchema>;

/**
 * Schema for the daily log file (data/days/YYYY-MM-DD.json).
 */
export const dailyLogSchema = z.object({
  /** Date of this log (ISO date string: YYYY-MM-DD) */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  /** Habit entries for the day */
  habits: z.array(habitEntrySchema).default([]),

  /** Task entries for the day */
  tasks: z.array(taskEntrySchema).default([]),

  /** Next task ID counter */
  nextTaskId: z.number().int().positive().default(1),
});

export type DailyLog = z.infer<typeof dailyLogSchema>;

/**
 * Create an empty daily log for a given date.
 */
export function createEmptyDailyLog(date: string): DailyLog {
  return {
    date,
    habits: [],
    tasks: [],
    nextTaskId: 1,
  };
}

/**
 * Validate a daily log object against the schema.
 */
export function validateDailyLog(data: unknown, date?: string): DailyLog {
  const result = dailyLogSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    const source = date ? ` for ${date}` : '';
    throw new Error(`Invalid daily log${source}:\n${errors}`);
  }

  return result.data;
}
