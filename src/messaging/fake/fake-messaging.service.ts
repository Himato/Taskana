import { Injectable, Logger } from '@nestjs/common';

import { ButtonOption, ListSection } from '../dto';
import {
  ConnectionState,
  IMessagingService,
  IncomingMediaMessage,
  SentMessageResult,
} from '../interfaces';

/**
 * Captured message for test assertions.
 */
export interface CapturedMessage {
  to: string;
  type: string;
  content: unknown;
  timestamp: number;
}

/**
 * Fake messaging service for testing.
 * Captures all sent messages for assertion.
 */
@Injectable()
export class FakeMessagingService implements IMessagingService {
  private readonly logger = new Logger(FakeMessagingService.name);

  /** Captured messages for test assertions */
  public sentMessages: CapturedMessage[] = [];

  /** Simulate incoming messages by pushing to this */
  public incomingQueue: unknown[] = [];

  async initialize(): Promise<void> {
    this.logger.log('FakeMessagingService initialized');
  }

  async disconnect(): Promise<void> {
    this.logger.log('FakeMessagingService disconnected');
  }

  getConnectionState(): ConnectionState {
    return {
      status: 'connected',
      reconnectAttempts: 0,
      lastConnectedAt: new Date(),
    };
  }

  async sendText(to: string, text: string): Promise<SentMessageResult> {
    return this.capture(to, 'text', { text });
  }

  async sendFormattedText(to: string, text: string): Promise<SentMessageResult> {
    return this.capture(to, 'formatted_text', { text });
  }

  async sendButtons(
    to: string,
    body: string,
    buttons: ButtonOption[],
    footer?: string,
  ): Promise<SentMessageResult> {
    return this.capture(to, 'buttons', { body, buttons, footer });
  }

  async sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: ListSection[],
    footer?: string,
  ): Promise<SentMessageResult> {
    return this.capture(to, 'list', { body, buttonText, sections, footer });
  }

  async sendImage(
    to: string,
    image: Buffer | string,
    caption?: string,
  ): Promise<SentMessageResult> {
    return this.capture(to, 'image', { caption, hasBuffer: Buffer.isBuffer(image) });
  }

  async sendAudio(to: string, audio: Buffer | string, ptt?: boolean): Promise<SentMessageResult> {
    return this.capture(to, 'audio', { ptt, hasBuffer: Buffer.isBuffer(audio) });
  }

  async sendReaction(to: string, messageId: string, emoji: string): Promise<SentMessageResult> {
    return this.capture(to, 'reaction', { messageId, emoji });
  }

  async downloadMedia(_message: IncomingMediaMessage): Promise<Buffer> {
    return Buffer.from('fake-media-bytes');
  }

  // ── Test helpers ──────────────────────────────────────

  private capture(to: string, type: string, content: unknown): SentMessageResult {
    const entry: CapturedMessage = { to, type, content, timestamp: Date.now() };
    this.sentMessages.push(entry);
    this.logger.debug(`[FAKE] → ${type} to ${to}: ${JSON.stringify(content).slice(0, 100)}`);
    return { messageId: `fake-${Date.now()}`, timestamp: Date.now(), success: true };
  }

  /** Get all messages sent to a specific number */
  getMessagesTo(number: string): CapturedMessage[] {
    return this.sentMessages.filter((m) => m.to === number || m.to.startsWith(number));
  }

  /** Get the last sent message */
  getLastMessage(): CapturedMessage | null {
    return this.sentMessages[this.sentMessages.length - 1] ?? null;
  }

  /** Clear captured messages */
  reset(): void {
    this.sentMessages = [];
    this.incomingQueue = [];
  }
}
