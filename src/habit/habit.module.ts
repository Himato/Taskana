import { Module } from '@nestjs/common';

import { HabitService } from './habit.service';

/**
 * Habit Module
 *
 * Loads, validates, and serves habit definitions from JSON files.
 */
@Module({
  imports: [],
  providers: [HabitService],
  exports: [HabitService],
})
export class HabitModule {}
