import { Module } from '@nestjs/common';

import { HabitModule } from '../habit/habit.module';
import { MessagingModule } from '../messaging/messaging.module';
import { OpenAiModule } from '../openai/openai.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { PrayerTimeModule } from '../prayer-time/prayer-time.module';

import { ConversationListenerService, ConversationService, StateService } from './services';

/**
 * Conversation Module
 *
 * Central router that receives all incoming messages and dispatches
 * to the correct handler based on intent classification.
 */
@Module({
  imports: [MessagingModule, OpenAiModule, HabitModule, PersistenceModule, PrayerTimeModule],
  providers: [StateService, ConversationService, ConversationListenerService],
  exports: [ConversationService, StateService],
})
export class ConversationModule {}
