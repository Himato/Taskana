import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from './config/configuration';
import { ConversationModule } from './conversation/conversation.module';
import { HabitModule } from './habit/habit.module';
import { MessagingModule } from './messaging/messaging.module';
import { OpenAiModule } from './openai/openai.module';
import { PersistenceModule } from './persistence/persistence.module';
import { PrayerTimeModule } from './prayer-time/prayer-time.module';
import { ReminderModule } from './reminder/reminder.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    MessagingModule,
    HabitModule,
    PersistenceModule,
    PrayerTimeModule,
    ReminderModule,
    OpenAiModule,
    ConversationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
