import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule, OnEvent } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from './config/configuration';
import { HabitModule } from './habit/habit.module';
import {
  AudioMessageReceivedEvent,
  ImageMessageReceivedEvent,
  TextMessageReceivedEvent,
} from './messaging/events';
import { IMessagingService } from './messaging/interfaces';
import { MESSAGING_SERVICE, MSG_EVENTS } from './messaging/messaging.constants';
import { MessagingModule } from './messaging/messaging.module';
import { PersistenceModule } from './persistence/persistence.module';
import { PrayerTimeModule } from './prayer-time/prayer-time.module';
import { ReminderModule } from './reminder/reminder.module';

/**
 * Temporary echo handler for Phase 1 validation.
 * DELETE THIS AFTER PHASE 1 - it will be replaced by ConversationModule.
 */
@Injectable()
class EchoHandler {
  private readonly logger = new Logger('EchoHandler');

  constructor(@Inject(MESSAGING_SERVICE) private readonly messaging: IMessagingService) {}

  @OnEvent(MSG_EVENTS.TEXT_RECEIVED)
  async handleText(event: TextMessageReceivedEvent): Promise<void> {
    this.logger.log(`Text received from ${event.message.fromNumber}: "${event.message.body}"`);
    await this.messaging.sendText(event.message.from, `Echo: ${event.message.body}`);
  }

  @OnEvent(MSG_EVENTS.AUDIO_RECEIVED)
  async handleAudio(event: AudioMessageReceivedEvent): Promise<void> {
    this.logger.log(
      `Audio received from ${event.message.fromNumber}: ${event.message.duration}s, PTT: ${event.message.isPtt}`,
    );
    await this.messaging.sendText(
      event.message.from,
      `Received audio message (${event.message.duration}s). Transcription coming in Phase 4!`,
    );
  }

  @OnEvent(MSG_EVENTS.IMAGE_RECEIVED)
  async handleImage(event: ImageMessageReceivedEvent): Promise<void> {
    this.logger.log(
      `Image received from ${event.message.fromNumber}${event.message.caption ? `: "${event.message.caption}"` : ''}`,
    );
    await this.messaging.sendText(
      event.message.from,
      `Received image${event.message.caption ? ` with caption: "${event.message.caption}"` : ''}. Image tagging coming in Phase 7!`,
    );
  }
}

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
  ],
  controllers: [],
  providers: [EchoHandler],
})
export class AppModule {}
