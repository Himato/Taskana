import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  AudioMessageReceivedEvent,
  ButtonResponseReceivedEvent,
  TextMessageReceivedEvent,
} from '../../messaging/events';
import { MSG_EVENTS } from '../../messaging/messaging.constants';

import { ConversationService } from './conversation.service';

/**
 * Event listener that routes incoming messages to the ConversationService.
 * Separates event handling concerns from core conversation logic.
 */
@Injectable()
export class ConversationListenerService {
  private readonly logger = new Logger(ConversationListenerService.name);

  constructor(private readonly conversationService: ConversationService) {}

  @OnEvent(MSG_EVENTS.TEXT_RECEIVED)
  async handleTextMessage(event: TextMessageReceivedEvent): Promise<void> {
    const { message } = event;

    this.logger.debug(
      `Text received from ${message.fromNumber}: "${message.body.slice(0, 50)}..."`,
    );

    try {
      await this.conversationService.handleText(message.fromNumber, message.body);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling text message: ${errorMessage}`);
    }
  }

  @OnEvent(MSG_EVENTS.AUDIO_RECEIVED)
  async handleAudioMessage(event: AudioMessageReceivedEvent): Promise<void> {
    const { message } = event;

    this.logger.debug(
      `Audio received from ${message.fromNumber}: ${message.duration}s, PTT: ${message.isPtt}`,
    );

    try {
      await this.conversationService.handleAudio(
        message.fromNumber,
        message.mediaHandle,
        message.duration,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling audio message: ${errorMessage}`);
    }
  }

  @OnEvent(MSG_EVENTS.BUTTON_RESPONSE)
  async handleButtonResponse(event: ButtonResponseReceivedEvent): Promise<void> {
    const { message } = event;

    this.logger.debug(`Button response from ${message.fromNumber}: ${message.selectedButtonId}`);

    try {
      await this.conversationService.handleButtonResponse(
        message.fromNumber,
        message.selectedButtonId,
        message.selectedButtonText,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling button response: ${errorMessage}`);
    }
  }
}
