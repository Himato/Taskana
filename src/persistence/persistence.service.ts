import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IslamicTimeSlot } from '../common/types/islamic-time-slot';
import { atomicWrite, readJsonFile } from '../common/utils/atomic-write';

import {
  createEmptyDailyLog,
  DailyLog,
  HabitEntry,
  Status,
  TaskEntry,
  validateDailyLog,
} from './daily-log.schema';

/**
 * Service for persisting daily habit and task logs.
 * Each day has its own JSON file in data/days/YYYY-MM-DD.json
 */
@Injectable()
export class PersistenceService {
  private readonly logger = new Logger(PersistenceService.name);
  private readonly daysDir: string;

  /** In-memory cache of loaded day files */
  private cache: Map<string, DailyLog> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.daysDir = this.configService.get<string>('paths.days', './data/days');
  }

  /**
   * Get the file path for a given date.
   */
  private getFilePath(date: string): string {
    return path.join(path.resolve(this.daysDir), `${date}.json`);
  }

  /**
   * Load the daily log for a given date.
   * Creates an empty log if it doesn't exist.
   */
  async loadDay(date: string): Promise<DailyLog> {
    // Check cache first
    if (this.cache.has(date)) {
      return this.cache.get(date)!;
    }

    const filePath = this.getFilePath(date);
    const data = await readJsonFile<unknown>(filePath);

    let dailyLog: DailyLog;

    if (data === null) {
      // File doesn't exist, create empty log
      this.logger.debug(`Creating new daily log for ${date}`);
      dailyLog = createEmptyDailyLog(date);
      await this.saveDay(date, dailyLog);
    } else {
      // Validate and use existing data
      dailyLog = validateDailyLog(data, date);
    }

    this.cache.set(date, dailyLog);
    return dailyLog;
  }

  /**
   * Save the daily log for a given date.
   * Uses atomic write to prevent corruption.
   */
  async saveDay(date: string, data: DailyLog): Promise<void> {
    const filePath = this.getFilePath(date);
    await atomicWrite(filePath, data);
    this.cache.set(date, data);
    this.logger.debug(`Saved daily log for ${date}`);
  }

  /**
   * Get the daily log for a date (from cache or disk).
   */
  async getDay(date: string): Promise<DailyLog> {
    return this.loadDay(date);
  }

  /**
   * Update a habit's status for a given date.
   */
  async updateHabitStatus(
    date: string,
    habitId: string,
    status: Status,
    justification?: string,
  ): Promise<HabitEntry> {
    const log = await this.loadDay(date);

    // Find or create habit entry
    let entry = log.habits.find((h) => h.habitId === habitId);

    if (!entry) {
      entry = {
        habitId,
        status: 'pending',
        justification: null,
        completedAt: null,
        images: [],
      };
      log.habits.push(entry);
    }

    // Update status
    entry.status = status;

    if (status === 'done') {
      entry.completedAt = new Date().toISOString();
    }

    if (status === 'skipped' && justification) {
      entry.justification = justification;
    }

    await this.saveDay(date, log);
    return entry;
  }

  /**
   * Add a new task to a given date.
   */
  async addTask(
    date: string,
    task: Omit<TaskEntry, 'id' | 'createdAt' | 'status' | 'completedAt' | 'images'>,
  ): Promise<TaskEntry> {
    const log = await this.loadDay(date);

    // Generate task ID
    const taskId = `t-${String(log.nextTaskId).padStart(3, '0')}`;
    log.nextTaskId++;

    const newTask: TaskEntry = {
      id: taskId,
      title: task.title,
      description: task.description,
      islamicTimeSlot: task.islamicTimeSlot,
      status: 'pending',
      completedAt: null,
      createdAt: new Date().toISOString(),
      images: [],
      origin: task.origin,
      shiftedTo: task.shiftedTo,
      shiftReason: task.shiftReason,
    };

    log.tasks.push(newTask);
    await this.saveDay(date, log);

    this.logger.log(`Added task ${taskId} to ${date}: "${task.title}"`);
    return newTask;
  }

  /**
   * Update an existing task.
   */
  async updateTask(
    date: string,
    taskId: string,
    updates: Partial<Omit<TaskEntry, 'id' | 'createdAt'>>,
  ): Promise<TaskEntry | null> {
    const log = await this.loadDay(date);
    const task = log.tasks.find((t) => t.id === taskId);

    if (!task) {
      this.logger.warn(`Task ${taskId} not found in ${date}`);
      return null;
    }

    // Apply updates
    Object.assign(task, updates);

    // Set completedAt if marking as done
    if (updates.status === 'done' && !task.completedAt) {
      task.completedAt = new Date().toISOString();
    }

    await this.saveDay(date, log);
    return task;
  }

  /**
   * Get a specific task by ID.
   */
  async getTask(date: string, taskId: string): Promise<TaskEntry | null> {
    const log = await this.loadDay(date);
    return log.tasks.find((t) => t.id === taskId) ?? null;
  }

  /**
   * Get all tasks for a date grouped by Islamic time slot.
   */
  async getTasksBySlot(date: string): Promise<Map<IslamicTimeSlot, TaskEntry[]>> {
    const log = await this.loadDay(date);
    const grouped = new Map<IslamicTimeSlot, TaskEntry[]>();

    for (const task of log.tasks) {
      const slot = task.islamicTimeSlot;
      if (!grouped.has(slot)) {
        grouped.set(slot, []);
      }
      grouped.get(slot)!.push(task);
    }

    return grouped;
  }

  /**
   * Get a habit entry for a specific date.
   */
  async getHabitEntry(date: string, habitId: string): Promise<HabitEntry | null> {
    const log = await this.loadDay(date);
    return log.habits.find((h) => h.habitId === habitId) ?? null;
  }

  /**
   * Add an image path to a habit or task.
   */
  async addImage(
    date: string,
    type: 'habit' | 'task',
    id: string,
    imagePath: string,
  ): Promise<boolean> {
    const log = await this.loadDay(date);

    if (type === 'habit') {
      const entry = log.habits.find((h) => h.habitId === id);
      if (!entry) return false;
      entry.images.push(imagePath);
    } else {
      const entry = log.tasks.find((t) => t.id === id);
      if (!entry) return false;
      entry.images.push(imagePath);
    }

    await this.saveDay(date, log);
    return true;
  }

  /**
   * Clear the cache (useful for testing).
   */
  clearCache(): void {
    this.cache.clear();
  }
}
