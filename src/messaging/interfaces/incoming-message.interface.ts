/**
 * Base properties shared by all incoming messages.
 */
export interface IncomingMessageBase {
  /** Unique message ID from WhatsApp */
  id: string;
  /** Sender JID (e.g. "20xxxxxxxxxx@s.whatsapp.net") */
  from: string;
  /** Phone number without suffix */
  fromNumber: string;
  /** Unix timestamp (seconds) */
  timestamp: number;
  /** Original raw message object (for advanced use) */
  raw: unknown;
}

/**
 * Incoming text message.
 */
export interface IncomingTextMessage extends IncomingMessageBase {
  type: 'text';
  body: string;
}

/**
 * Incoming audio/voice message.
 */
export interface IncomingAudioMessage extends IncomingMessageBase {
  type: 'audio';
  /** Duration in seconds */
  duration: number;
  /** MIME type, typically "audio/ogg; codecs=opus" */
  mimeType: string;
  /** Whether it was sent as a voice note (PTT) */
  isPtt: boolean;
  /** Opaque handle to download the media — pass to downloadMedia() */
  mediaHandle: unknown;
}

/**
 * Incoming image message.
 */
export interface IncomingImageMessage extends IncomingMessageBase {
  type: 'image';
  mimeType: string;
  caption?: string;
  /** Width × height if available */
  dimensions?: { width: number; height: number };
  mediaHandle: unknown;
}

/**
 * Response to a button message.
 */
export interface IncomingButtonResponse extends IncomingMessageBase {
  type: 'button_response';
  /** The button ID the user tapped */
  selectedButtonId: string;
  /** The button display text */
  selectedButtonText: string;
}

/**
 * Response to a list message.
 */
export interface IncomingListResponse extends IncomingMessageBase {
  type: 'list_response';
  selectedRowId: string;
  selectedRowTitle: string;
  selectedSectionTitle?: string;
}

/**
 * Union type of all incoming message types.
 */
export type IncomingMessage =
  | IncomingTextMessage
  | IncomingAudioMessage
  | IncomingImageMessage
  | IncomingButtonResponse
  | IncomingListResponse;

/**
 * Media messages that can be downloaded.
 */
export type IncomingMediaMessage = IncomingAudioMessage | IncomingImageMessage;
