import { Injectable, Logger } from '@nestjs/common';
import { addDays, format, isBefore, startOfDay, subDays } from 'date-fns';

import { IslamicTimeSlot } from '../common/types/islamic-time-slot';
import { ExtractedEntities } from '../openai/interfaces';
import { TaskEntry } from '../persistence/daily-log.schema';
import { PersistenceService } from '../persistence/persistence.service';

/**
 * Result of a task operation.
 */
export interface TaskOperationResult {
  success: boolean;
  task?: TaskEntry;
  message: string;
  error?: string;
}

/**
 * Result of a similar task search.
 */
export interface SimilarTaskResult {
  task: TaskEntry;
  date: string;
  similarity: number;
}

/**
 * Service for managing tasks.
 * Provides business logic layer on top of PersistenceService.
 */
@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(private readonly persistenceService: PersistenceService) {}

  /**
   * Create a new task from extracted entities.
   */
  async create(date: string, entities: ExtractedEntities): Promise<TaskOperationResult> {
    if (!entities.taskTitle) {
      return {
        success: false,
        message: 'لازم تحدد عنوان المهمة.',
        error: 'Missing task title',
      };
    }

    const timeSlot = entities.timeSlot ?? 'after_dhuhr';

    try {
      const task = await this.persistenceService.addTask(date, {
        title: entities.taskTitle,
        description: entities.taskDescription,
        islamicTimeSlot: timeSlot,
      });

      this.logger.log(`Created task ${task.id}: "${task.title}"`);

      return {
        success: true,
        task,
        message: `تم إضافة مهمة: "${task.title}"`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create task: ${errorMessage}`);
      return {
        success: false,
        message: 'حصل خطأ في إضافة المهمة.',
        error: errorMessage,
      };
    }
  }

  /**
   * Mark a task as completed.
   */
  async complete(date: string, taskId: string): Promise<TaskOperationResult> {
    const normalizedId = this.normalizeTaskId(taskId);
    const task = await this.persistenceService.getTask(date, normalizedId);

    if (!task) {
      return {
        success: false,
        message: `المهمة ${taskId} مش موجودة.`,
        error: 'Task not found',
      };
    }

    if (task.status === 'done') {
      return {
        success: false,
        task,
        message: `المهمة "${task.title}" خلصت قبل كده.`,
        error: 'Task already completed',
      };
    }

    if (task.status === 'shifted') {
      return {
        success: false,
        task,
        message: `المهمة "${task.title}" اتنقلت ليوم تاني.`,
        error: 'Task was shifted',
      };
    }

    const updated = await this.persistenceService.updateTask(date, normalizedId, {
      status: 'done',
    });

    this.logger.log(`Completed task ${normalizedId}: "${task.title}"`);

    return {
      success: true,
      task: updated!,
      message: `✅ تم إنهاء: "${task.title}"`,
    };
  }

  /**
   * Mark a task as skipped.
   */
  async skip(date: string, taskId: string, justification?: string): Promise<TaskOperationResult> {
    const normalizedId = this.normalizeTaskId(taskId);
    const task = await this.persistenceService.getTask(date, normalizedId);

    if (!task) {
      return {
        success: false,
        message: `المهمة ${taskId} مش موجودة.`,
        error: 'Task not found',
      };
    }

    if (task.status === 'done') {
      return {
        success: false,
        task,
        message: `المهمة "${task.title}" خلصت قبل كده، مينفعش تتخطاها.`,
        error: 'Cannot skip completed task',
      };
    }

    if (task.status === 'shifted') {
      return {
        success: false,
        task,
        message: `المهمة "${task.title}" اتنقلت ليوم تاني.`,
        error: 'Task was shifted',
      };
    }

    // Note: Unlike habits, tasks don't require justification
    const updated = await this.persistenceService.updateTask(date, normalizedId, {
      status: 'skipped',
      shiftReason: justification, // Reuse shiftReason field for skip justification
    });

    this.logger.log(`Skipped task ${normalizedId}: "${task.title}"`);

    return {
      success: true,
      task: updated!,
      message: `⏭️ تم تخطي: "${task.title}"`,
    };
  }

  /**
   * Shift a task to another date.
   */
  async shift(
    date: string,
    taskId: string,
    targetDate: string,
    reason?: string,
  ): Promise<TaskOperationResult> {
    const normalizedId = this.normalizeTaskId(taskId);

    // Validate target date is not in the past
    const today = startOfDay(new Date());
    const target = startOfDay(new Date(targetDate));

    if (isBefore(target, today)) {
      return {
        success: false,
        message: 'مينفعش تنقل المهمة لتاريخ فات.',
        error: 'Cannot shift to past date',
      };
    }

    const task = await this.persistenceService.getTask(date, normalizedId);

    if (!task) {
      return {
        success: false,
        message: `المهمة ${taskId} مش موجودة.`,
        error: 'Task not found',
      };
    }

    if (task.status === 'done') {
      return {
        success: false,
        task,
        message: `المهمة "${task.title}" خلصت، مينفعش تتنقل.`,
        error: 'Cannot shift completed task',
      };
    }

    if (task.status === 'shifted') {
      return {
        success: false,
        task,
        message: `المهمة "${task.title}" اتنقلت قبل كده.`,
        error: 'Task already shifted',
      };
    }

    // Mark original task as shifted
    await this.persistenceService.updateTask(date, normalizedId, {
      status: 'shifted',
      shiftedTo: targetDate,
      shiftReason: reason,
    });

    // Create new task in target date
    const newTask = await this.persistenceService.addTask(targetDate, {
      title: task.title,
      description: task.description,
      islamicTimeSlot: task.islamicTimeSlot,
      origin: date,
    });

    this.logger.log(`Shifted task ${normalizedId} from ${date} to ${targetDate}`);

    const formattedDate = this.formatDate(targetDate);

    return {
      success: true,
      task: newTask,
      message: `✅ تم نقل "${task.title}" لـ ${formattedDate}`,
    };
  }

  /**
   * Update a task's properties.
   */
  async update(
    date: string,
    taskId: string,
    entities: ExtractedEntities,
  ): Promise<TaskOperationResult> {
    const normalizedId = this.normalizeTaskId(taskId);
    const task = await this.persistenceService.getTask(date, normalizedId);

    if (!task) {
      return {
        success: false,
        message: `المهمة ${taskId} مش موجودة.`,
        error: 'Task not found',
      };
    }

    const updates: Partial<TaskEntry> = {};

    if (entities.taskTitle) {
      updates.title = entities.taskTitle;
    }

    if (entities.taskDescription) {
      updates.description = entities.taskDescription;
    }

    if (entities.timeSlot) {
      updates.islamicTimeSlot = entities.timeSlot;
    }

    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        task,
        message: 'مفيش تعديلات.',
        error: 'No updates provided',
      };
    }

    const updated = await this.persistenceService.updateTask(date, normalizedId, updates);

    this.logger.log(`Updated task ${normalizedId}: ${JSON.stringify(updates)}`);

    return {
      success: true,
      task: updated!,
      message: `تم تحديث المهمة "${updated!.title}"`,
    };
  }

  /**
   * Delete a task.
   */
  async delete(date: string, taskId: string): Promise<TaskOperationResult> {
    const normalizedId = this.normalizeTaskId(taskId);
    const task = await this.persistenceService.getTask(date, normalizedId);

    if (!task) {
      return {
        success: false,
        message: `المهمة ${taskId} مش موجودة.`,
        error: 'Task not found',
      };
    }

    const deleted = await this.persistenceService.deleteTask(date, normalizedId);

    if (!deleted) {
      return {
        success: false,
        message: 'حصل خطأ في حذف المهمة.',
        error: 'Delete failed',
      };
    }

    this.logger.log(`Deleted task ${normalizedId}: "${task.title}"`);

    return {
      success: true,
      task,
      message: `🗑️ تم حذف: "${task.title}"`,
    };
  }

  /**
   * Get all tasks for a date.
   */
  async listForDay(date: string): Promise<TaskEntry[]> {
    const dayLog = await this.persistenceService.getDay(date);
    return dayLog.tasks;
  }

  /**
   * Get tasks grouped by Islamic time slot.
   */
  async getBySlot(date: string): Promise<Map<IslamicTimeSlot, TaskEntry[]>> {
    return this.persistenceService.getTasksBySlot(date);
  }

  /**
   * Get a specific task by ID.
   */
  async getById(date: string, taskId: string): Promise<TaskEntry | null> {
    const normalizedId = this.normalizeTaskId(taskId);
    return this.persistenceService.getTask(date, normalizedId);
  }

  /**
   * Find similar tasks within a week (3 days before and 3 days after).
   * Returns the most similar task if found.
   */
  async findSimilarInWeek(
    currentDate: string,
    taskTitle: string,
  ): Promise<SimilarTaskResult | null> {
    const baseDate = new Date(currentDate);
    const results: SimilarTaskResult[] = [];

    // Check 3 days before and 3 days after (7 days total)
    for (let i = -3; i <= 3; i++) {
      const checkDate = i === 0 ? baseDate : i > 0 ? addDays(baseDate, i) : subDays(baseDate, -i);
      const dateStr = format(checkDate, 'yyyy-MM-dd');

      try {
        const dayLog = await this.persistenceService.getDay(dateStr);

        for (const task of dayLog.tasks) {
          // Skip shifted or completed tasks
          if (task.status === 'shifted' || task.status === 'done') {
            continue;
          }

          const similarity = this.calculateSimilarity(taskTitle, task.title);

          if (similarity >= 0.7) {
            results.push({
              task,
              date: dateStr,
              similarity,
            });
          }
        }
      } catch {
        // Day file doesn't exist, skip
        continue;
      }
    }

    if (results.length === 0) {
      return null;
    }

    // Return the most similar one
    results.sort((a, b) => b.similarity - a.similarity);
    return results[0];
  }

  /**
   * Calculate similarity between two strings (Jaccard-like similarity).
   * Returns a value between 0 and 1.
   */
  private calculateSimilarity(str1: string, str2: string): number {
    // Normalize strings
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^\u0600-\u06FFa-z0-9\s]/g, '') // Keep Arabic, Latin letters, numbers, spaces
        .split(/\s+/)
        .filter((w) => w.length > 1); // Remove single char words

    const words1 = new Set(normalize(str1));
    const words2 = new Set(normalize(str2));

    if (words1.size === 0 || words2.size === 0) {
      return 0;
    }

    // Calculate Jaccard similarity
    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) {
        intersection++;
      }
    }

    const union = words1.size + words2.size - intersection;
    return intersection / union;
  }

  /**
   * Normalize task ID to standard format (t-001).
   * Handles inputs like "1", "t-1", "001", "t-001".
   */
  private normalizeTaskId(taskId: string): string {
    // Remove 't-' prefix if present
    const numPart = taskId.replace(/^t-?/i, '');

    // Parse as number and pad
    const num = parseInt(numPart, 10);

    if (isNaN(num)) {
      return taskId; // Return as-is if not a valid number
    }

    return `t-${String(num).padStart(3, '0')}`;
  }

  /**
   * Format date for display in Arabic.
   */
  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return 'النهارده';
    }

    if (format(date, 'yyyy-MM-dd') === format(tomorrow, 'yyyy-MM-dd')) {
      return 'بكرة';
    }

    // Return day name and date
    const dayNames: Record<number, string> = {
      0: 'الأحد',
      1: 'الاثنين',
      2: 'الثلاثاء',
      3: 'الأربعاء',
      4: 'الخميس',
      5: 'الجمعة',
      6: 'السبت',
    };

    return `${dayNames[date.getDay()]} ${format(date, 'MM/dd')}`;
  }
}
