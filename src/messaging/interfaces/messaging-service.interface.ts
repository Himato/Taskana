import { ButtonOption, ListSection } from '../dto';

import { ConnectionState } from './connection-state.interface';
import { IncomingMediaMessage } from './incoming-message.interface';
import { SentMessageResult } from './outgoing-message.interface';

/**
 * Abstract messaging service interface.
 * All implementations (Baileys, Twilio, etc.) must implement this interface.
 * Consumers should depend on this interface, not concrete implementations.
 */
export interface IMessagingService {
  // ── Lifecycle ──────────────────────────────────────────

  /** Initialize the connection (QR auth, session restore) */
  initialize(): Promise<void>;

  /** Gracefully shut down the connection */
  disconnect(): Promise<void>;

  /** Current connection status */
  getConnectionState(): ConnectionState;

  // ── Outbound: Text ─────────────────────────────────────

  sendText(to: string, text: string): Promise<SentMessageResult>;

  /** Send text with WhatsApp bold/italic markdown */
  sendFormattedText(to: string, text: string): Promise<SentMessageResult>;

  // ── Outbound: Interactive ──────────────────────────────

  /** Up to 3 quick-reply buttons */
  sendButtons(
    to: string,
    body: string,
    buttons: ButtonOption[],
    footer?: string,
  ): Promise<SentMessageResult>;

  /** Scrollable list with sections (up to 10 rows) */
  sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: ListSection[],
    footer?: string,
  ): Promise<SentMessageResult>;

  // ── Outbound: Media ────────────────────────────────────

  sendImage(
    to: string,
    image: Buffer | string, // buffer or file path
    caption?: string,
  ): Promise<SentMessageResult>;

  sendAudio(
    to: string,
    audio: Buffer | string,
    ptt?: boolean, // push-to-talk (voice note bubble)
  ): Promise<SentMessageResult>;

  // ── Outbound: Reactions ────────────────────────────────

  sendReaction(
    to: string,
    messageId: string,
    emoji: string, // e.g. "✅", "👍", ""(remove)
  ): Promise<SentMessageResult>;

  // ── Inbound: Media helpers ─────────────────────────────

  /** Download media bytes from an incoming message */
  downloadMedia(message: IncomingMediaMessage): Promise<Buffer>;
}
