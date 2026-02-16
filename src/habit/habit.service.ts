import * as fs from 'fs/promises';
import * as path from 'path';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DayOfWeek, IslamicTimeSlot } from '../common/types/islamic-time-slot';

import { Habit, validateHabit } from './habit.schema';

/**
 * Service for loading and managing habit definitions.
 * Habits are loaded from JSON files in the configured habits directory.
 */
@Injectable()
export class HabitService implements OnModuleInit {
  private readonly logger = new Logger(HabitService.name);
  private readonly habitsDir: string;

  /** In-memory cache of loaded habits */
  private habits: Map<string, Habit> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.habitsDir = this.configService.get<string>('paths.habits', './data/habits');
  }

  async onModuleInit() {
    await this.loadAll();
  }

  /**
   * Load all habit definitions from the habits directory.
   * Validates each file and caches the results.
   */
  async loadAll(): Promise<Habit[]> {
    const resolvedPath = path.resolve(this.habitsDir);
    this.logger.log(`Loading habits from ${resolvedPath}`);

    try {
      const files = await fs.readdir(resolvedPath);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      if (jsonFiles.length === 0) {
        this.logger.warn(`No habit files found in ${resolvedPath}`);
        return [];
      }

      const loadedHabits: Habit[] = [];

      for (const file of jsonFiles) {
        const filePath = path.join(resolvedPath, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          const habit = validateHabit(data, file);

          this.habits.set(habit.id, habit);
          loadedHabits.push(habit);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to load habit from ${file}: ${message}`);
          throw error;
        }
      }

      this.logger.log(`Loaded ${loadedHabits.length} habits from ${resolvedPath}`);
      return loadedHabits;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.warn(`Habits directory not found: ${resolvedPath}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Get all loaded habits.
   */
  getAll(): Habit[] {
    return Array.from(this.habits.values());
  }

  /**
   * Get a habit by its ID.
   * Returns undefined if not found.
   */
  getById(id: string): Habit | undefined {
    return this.habits.get(id);
  }

  /**
   * Get all habits scheduled for a specific Islamic time slot.
   */
  getByTimeSlot(slot: IslamicTimeSlot): Habit[] {
    return this.getAll().filter((h) => h.schedule.islamicTimeSlot === slot);
  }

  /**
   * Get all habits scheduled for a specific day of the week.
   */
  getForDay(day: DayOfWeek): Habit[] {
    return this.getAll().filter((h) => h.schedule.days.includes(day));
  }

  /**
   * Get habits active for a specific day and time slot.
   */
  getForDayAndSlot(day: DayOfWeek, slot: IslamicTimeSlot): Habit[] {
    return this.getAll().filter(
      (h) => h.schedule.days.includes(day) && h.schedule.islamicTimeSlot === slot,
    );
  }

  /**
   * Get the number of loaded habits.
   */
  count(): number {
    return this.habits.size;
  }
}
