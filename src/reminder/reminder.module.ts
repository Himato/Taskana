import { Module } from '@nestjs/common';

import { HabitModule } from '../habit/habit.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrayerTimeModule } from '../prayer-time/prayer-time.module';

import { ReminderService } from './reminder.service';

/**
 * Reminder Module
 *
 * Schedules and dispatches WhatsApp reminders based on Islamic prayer times.
 */
@Module({
  imports: [HabitModule, PrayerTimeModule, MessagingModule],
  providers: [ReminderService],
  exports: [ReminderService],
})
export class ReminderModule {}
