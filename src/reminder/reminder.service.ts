import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { format } from 'date-fns';

import { AR } from '../common/messages/ar';
import { DayOfWeek, IslamicTimeSlot } from '../common/types/islamic-time-slot';
import { Habit } from '../habit/habit.schema';
import { HabitService } from '../habit/habit.service';
import { IMessagingService } from '../messaging/interfaces';
import { MESSAGING_SERVICE } from '../messaging/messaging.constants';
import { PrayerTimeService } from '../prayer-time/prayer-time.service';

/**
 * Represents a scheduled reminder timeout.
 */
interface ScheduledReminder {
  habitId: string;
  habitName: string;
  type: 'start' | 'before_end';
  scheduledTime: Date;
  timeout: NodeJS.Timeout;
}

/**
 * Service for scheduling and dispatching habit reminders.
 * Reminders are scheduled based on Islamic prayer times.
 */
@Injectable()
export class ReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderService.name);
  private readonly myPhoneNumber: string;

  /** Active reminder timeouts */
  private scheduledReminders: ScheduledReminder[] = [];

  constructor(
    private readonly habitService: HabitService,
    private readonly prayerTimeService: PrayerTimeService,
    private readonly configService: ConfigService,
    @Inject(MESSAGING_SERVICE) private readonly messaging: IMessagingService,
  ) {
    this.myPhoneNumber = this.configService.get<string>('whatsapp.myPhoneNumber', '');
  }

  async onModuleInit() {
    // Schedule reminders for today after a short delay to allow WhatsApp to connect
    setTimeout(() => this.scheduleDailyReminders(), 5000);
  }

  async onModuleDestroy() {
    this.cancelAllReminders();
  }

  /**
   * Schedule all reminders for today.
   * Called at startup and daily at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  scheduleDailyReminders(): void {
    // Cancel any existing reminders first
    this.cancelAllReminders();

    const today = new Date();
    const dayOfWeek = this.getDayOfWeek(today);
    const habits = this.habitService.getForDay(dayOfWeek);

    if (habits.length === 0) {
      this.logger.log('No habits scheduled for today');
      return;
    }

    let scheduledCount = 0;

    for (const habit of habits) {
      const remindersScheduled = this.scheduleHabitReminders(habit, today);
      scheduledCount += remindersScheduled;
    }

    this.logger.log(`Scheduled ${scheduledCount} reminders for today (${habits.length} habits)`);
  }

  /**
   * Cancel all pending reminders.
   */
  cancelAllReminders(): void {
    for (const reminder of this.scheduledReminders) {
      clearTimeout(reminder.timeout);
    }
    this.scheduledReminders = [];
    this.logger.debug('All reminders cancelled');
  }

  /**
   * Get list of currently scheduled reminders (for debugging/testing).
   */
  getScheduledReminders(): Omit<ScheduledReminder, 'timeout'>[] {
    return this.scheduledReminders.map(({ timeout: _timeout, ...rest }) => rest);
  }

  /**
   * Schedule reminders for a single habit.
   * Returns the number of reminders scheduled.
   */
  private scheduleHabitReminders(habit: Habit, date: Date): number {
    const now = Date.now();
    let count = 0;

    // Get the slot start time
    const slotStartTime = this.prayerTimeService.getSlotTime(habit.schedule.islamicTimeSlot, date);

    // Calculate the end time (start + duration)
    const slotEndTime = new Date(
      slotStartTime.getTime() + habit.schedule.durationMinutes * 60 * 1000,
    );

    // Schedule start reminder
    if (habit.reminders.atStart) {
      const startDelay = slotStartTime.getTime() - now;

      if (startDelay > 0) {
        this.scheduleReminder(habit, 'start', slotStartTime, startDelay);
        count++;
      } else {
        this.logger.debug(
          `Skipping past start reminder for ${habit.name} (was at ${format(slotStartTime, 'HH:mm')})`,
        );
      }
    }

    // Schedule before-end reminder
    if (habit.reminders.beforeEnd) {
      const beforeEndTime = new Date(
        slotEndTime.getTime() - habit.reminders.beforeEndMinutes * 60 * 1000,
      );
      const beforeEndDelay = beforeEndTime.getTime() - now;

      if (beforeEndDelay > 0) {
        this.scheduleReminder(habit, 'before_end', beforeEndTime, beforeEndDelay);
        count++;
      } else {
        this.logger.debug(
          `Skipping past before-end reminder for ${habit.name} (was at ${format(beforeEndTime, 'HH:mm')})`,
        );
      }
    }

    return count;
  }

  /**
   * Schedule a single reminder.
   */
  private scheduleReminder(
    habit: Habit,
    type: 'start' | 'before_end',
    scheduledTime: Date,
    delay: number,
  ): void {
    const timeout = setTimeout(() => this.fireReminder(habit, type), delay);

    this.scheduledReminders.push({
      habitId: habit.id,
      habitName: habit.name,
      type,
      scheduledTime,
      timeout,
    });

    this.logger.debug(
      `Scheduled ${type} reminder for "${habit.name}" at ${format(scheduledTime, 'HH:mm')} ` +
        `(in ${Math.round(delay / 60000)} minutes)`,
    );
  }

  /**
   * Fire a reminder - send the WhatsApp message.
   */
  private async fireReminder(habit: Habit, type: 'start' | 'before_end'): Promise<void> {
    // Remove from scheduled list
    this.scheduledReminders = this.scheduledReminders.filter(
      (r) => !(r.habitId === habit.id && r.type === type),
    );

    if (!this.myPhoneNumber) {
      this.logger.warn('Cannot send reminder - MY_PHONE_NUMBER not configured');
      return;
    }

    try {
      const message =
        type === 'start'
          ? AR.HABIT_REMINDER_START(habit.name)
          : AR.HABIT_REMINDER_END(habit.name, habit.reminders.beforeEndMinutes);

      await this.messaging.sendText(this.myPhoneNumber, message);
      this.logger.log(`Sent ${type} reminder for "${habit.name}"`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send reminder for "${habit.name}": ${errorMessage}`);
    }
  }

  /**
   * Convert Date to DayOfWeek type.
   */
  private getDayOfWeek(date: Date): DayOfWeek {
    const days: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return days[date.getDay()];
  }

  /**
   * Get the Arabic name for a time slot.
   */
  getSlotNameArabic(slot: IslamicTimeSlot): string {
    const names: Record<IslamicTimeSlot, string> = {
      after_fajr: AR.TIME_SLOT_AFTER_FAJR,
      before_dhuhr: AR.TIME_SLOT_BEFORE_DHUHR,
      after_dhuhr: AR.TIME_SLOT_AFTER_DHUHR,
      before_asr: AR.TIME_SLOT_BEFORE_ASR,
      after_asr: AR.TIME_SLOT_AFTER_ASR,
      before_maghrib: AR.TIME_SLOT_BEFORE_MAGHRIB,
      after_maghrib: AR.TIME_SLOT_AFTER_MAGHRIB,
      before_isha: AR.TIME_SLOT_BEFORE_ISHA,
      after_isha: AR.TIME_SLOT_AFTER_ISHA,
    };
    return names[slot];
  }
}
