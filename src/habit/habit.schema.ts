import { z } from 'zod';

import { DAYS_OF_WEEK, ISLAMIC_TIME_SLOTS } from '../common/types/islamic-time-slot';

/**
 * Zod schema for habit definition JSON files.
 * Validates habit files loaded from data/habits/
 */
export const habitSchema = z.object({
  /** Unique identifier for the habit (matches filename without .json) */
  id: z.string().min(1),

  /** Human-readable name of the habit */
  name: z.string().min(1),

  /** Optional description of the habit */
  description: z.string().optional(),

  /** Schedule configuration */
  schedule: z.object({
    /** Days when this habit is active */
    days: z.array(z.enum(DAYS_OF_WEEK)).min(1),

    /** Islamic time slot when the habit starts */
    islamicTimeSlot: z.enum(ISLAMIC_TIME_SLOTS),

    /** Duration window in minutes */
    durationMinutes: z.number().int().positive(),
  }),

  /** Reminder configuration */
  reminders: z.object({
    /** Send reminder when the time slot begins */
    atStart: z.boolean().default(true),

    /** Send reminder before the slot ends */
    beforeEnd: z.boolean().default(true),

    /** Minutes before end to send the reminder */
    beforeEndMinutes: z.number().int().positive().default(5),
  }),

  /** Whether skipping requires a justification */
  requiresJustification: z.boolean().default(true),
});

/**
 * TypeScript type inferred from the habit schema.
 */
export type Habit = z.infer<typeof habitSchema>;

/**
 * Validate a habit object against the schema.
 * Throws a descriptive error if validation fails.
 */
export function validateHabit(data: unknown, filename?: string): Habit {
  const result = habitSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    const source = filename ? ` in ${filename}` : '';
    throw new Error(`Invalid habit definition${source}:\n${errors}`);
  }

  return result.data;
}
