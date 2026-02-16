# Messaging Module — Abstraction Layer & Baileys Implementation

## 1. Overview

The Messaging Module is the gateway between the application and WhatsApp. It defines a **provider-agnostic interface** so the entire codebase depends on an abstraction rather than a specific library. The default (and only PoC) implementation uses `@whiskeysockets/baileys`.

### Design Principles

- **Interface-first:** Every other module imports only the interface token, never Baileys directly.
- **Event-driven:** Incoming messages are emitted through NestJS `EventEmitter2`, decoupling reception from handling.
- **Resilient:** Auto-reconnect, session persistence, graceful degradation on network loss.
- **Testable:** The abstraction makes it trivial to inject a `FakeMessagingService` in tests.

---

## 2. Module Structure

```
src/messaging/
├── messaging.module.ts                 # NestJS module definition
├── messaging.constants.ts              # Injection tokens, event names
├── interfaces/
│   ├── messaging-service.interface.ts  # Core abstraction
│   ├── incoming-message.interface.ts   # Inbound message types
│   ├── outgoing-message.interface.ts   # Outbound message types
│   └── connection-state.interface.ts   # Connection lifecycle types
├── dto/
│   ├── button-option.dto.ts
│   ├── list-section.dto.ts
│   └── media-attachment.dto.ts
├── events/
│   ├── message-received.event.ts
│   ├── connection-state-changed.event.ts
│   └── message-sent.event.ts
├── baileys/
│   ├── baileys-messaging.service.ts    # Baileys implementation
│   ├── baileys-auth.service.ts         # Session / auth store management
│   ├── baileys-media.service.ts        # Media download / upload helpers
│   └── baileys-mapper.service.ts       # Map Baileys types → app DTOs
├── fake/
│   └── fake-messaging.service.ts       # In-memory implementation for testing
└── guards/
    └── allowed-sender.guard.ts         # Only process messages from MY_PHONE_NUMBER
```

---

## 3. Core Abstraction

### 3.1 Injection Token

```typescript
// messaging.constants.ts

/** Provider token — inject this, never a concrete class */
export const MESSAGING_SERVICE = Symbol('MESSAGING_SERVICE');

/** EventEmitter2 event names */
export const MSG_EVENTS = {
  TEXT_RECEIVED:    'message.text.received',
  AUDIO_RECEIVED:   'message.audio.received',
  IMAGE_RECEIVED:   'message.image.received',
  BUTTON_RESPONSE:  'message.button.response',
  LIST_RESPONSE:    'message.list.response',
  MESSAGE_SENT:     'message.sent',
  CONNECTION_STATE: 'connection.state',
} as const;
```

### 3.2 Service Interface

```typescript
// interfaces/messaging-service.interface.ts

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
    image: Buffer | string,       // buffer or file path
    caption?: string,
  ): Promise<SentMessageResult>;

  sendAudio(
    to: string,
    audio: Buffer | string,
    ptt?: boolean,                 // push-to-talk (voice note bubble)
  ): Promise<SentMessageResult>;

  // ── Outbound: Reactions ────────────────────────────────
  sendReaction(
    to: string,
    messageId: string,
    emoji: string,                 // e.g. "✅", "👍", ""(remove)
  ): Promise<SentMessageResult>;

  // ── Inbound: Media helpers ─────────────────────────────
  /** Download media bytes from an incoming message */
  downloadMedia(message: IncomingMediaMessage): Promise<Buffer>;
}
```

### 3.3 Incoming Message Types

```typescript
// interfaces/incoming-message.interface.ts

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

export interface IncomingTextMessage extends IncomingMessageBase {
  type: 'text';
  body: string;
}

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

export interface IncomingImageMessage extends IncomingMessageBase {
  type: 'image';
  mimeType: string;
  caption?: string;
  /** Width × height if available */
  dimensions?: { width: number; height: number };
  mediaHandle: unknown;
}

export interface IncomingButtonResponse extends IncomingMessageBase {
  type: 'button_response';
  /** The button ID the user tapped */
  selectedButtonId: string;
  /** The button display text */
  selectedButtonText: string;
}

export interface IncomingListResponse extends IncomingMessageBase {
  type: 'list_response';
  selectedRowId: string;
  selectedRowTitle: string;
  selectedSectionTitle?: string;
}

export type IncomingMessage =
  | IncomingTextMessage
  | IncomingAudioMessage
  | IncomingImageMessage
  | IncomingButtonResponse
  | IncomingListResponse;

export type IncomingMediaMessage = IncomingAudioMessage | IncomingImageMessage;
```

### 3.4 Outgoing Message Types

```typescript
// interfaces/outgoing-message.interface.ts

export interface SentMessageResult {
  /** WhatsApp message ID of the sent message */
  messageId: string;
  /** Delivery timestamp */
  timestamp: number;
  /** Whether the message was sent successfully */
  success: boolean;
}

// dto/button-option.dto.ts
export interface ButtonOption {
  id: string;           // internal ID returned on tap (max 256 chars)
  text: string;         // display text (max 20 chars)
}

// dto/list-section.dto.ts
export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface ListRow {
  id: string;           // returned on selection
  title: string;        // max 24 chars
  description?: string; // max 72 chars
}
```

### 3.5 Connection State

```typescript
// interfaces/connection-state.interface.ts

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'        // QR code available, waiting for scan
  | 'connected'
  | 'reconnecting';

export interface ConnectionState {
  status: ConnectionStatus;
  /** QR string for pairing (only when status === 'qr_ready') */
  qrCode?: string;
  /** Number of reconnection attempts since last stable connection */
  reconnectAttempts: number;
  /** Timestamp of last successful connection */
  lastConnectedAt?: Date;
}
```

---

## 4. Event System

All incoming messages flow through NestJS `EventEmitter2` so any module can subscribe without depending on the messaging implementation.

```typescript
// events/message-received.event.ts

export class TextMessageReceivedEvent {
  constructor(public readonly message: IncomingTextMessage) {}
}

export class AudioMessageReceivedEvent {
  constructor(public readonly message: IncomingAudioMessage) {}
}

export class ImageMessageReceivedEvent {
  constructor(public readonly message: IncomingImageMessage) {}
}

export class ButtonResponseReceivedEvent {
  constructor(public readonly message: IncomingButtonResponse) {}
}

export class ListResponseReceivedEvent {
  constructor(public readonly message: IncomingListResponse) {}
}

// events/connection-state-changed.event.ts
export class ConnectionStateChangedEvent {
  constructor(public readonly state: ConnectionState) {}
}
```

**Subscriber example** (in `ConversationModule`):

```typescript
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class ConversationService {
  @OnEvent('message.text.received')
  async handleText(event: TextMessageReceivedEvent) {
    await this.processText(event.message);
  }

  @OnEvent('message.audio.received')
  async handleAudio(event: AudioMessageReceivedEvent) {
    const buffer = await this.messaging.downloadMedia(event.message);
    const transcription = await this.whisper.transcribe(buffer);
    // Re-enter as text
    await this.processText({
      ...event.message,
      type: 'text',
      body: transcription.text,
    });
  }

  @OnEvent('message.image.received')
  async handleImage(event: ImageMessageReceivedEvent) {
    await this.imageService.promptTagSelection(event.message);
  }
}
```

---

## 5. Baileys Implementation

### 5.1 Auth & Session Management

```typescript
// baileys/baileys-auth.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  useMultiFileAuthState,
  AuthenticationState,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import * as path from 'path';

@Injectable()
export class BaileysAuthService {
  private readonly logger = new Logger(BaileysAuthService.name);
  private readonly sessionDir: string;

  private state: AuthenticationState;
  private saveCreds: () => Promise<void>;

  constructor() {
    this.sessionDir = process.env.WHATSAPP_SESSION_DIR
      || path.resolve('./data/session');
  }

  async initialize(): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    this.state = state;
    this.saveCreds = saveCreds;
    this.logger.log(`Session loaded from ${this.sessionDir}`);
    return { state, saveCreds };
  }

  getState(): AuthenticationState {
    return this.state;
  }

  async persistCreds(): Promise<void> {
    await this.saveCreds();
  }
}
```

### 5.2 Media Helpers

```typescript
// baileys/baileys-media.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class BaileysMediaService {
  private readonly logger = new Logger(BaileysMediaService.name);
  private readonly mediaDir: string;

  constructor() {
    this.mediaDir = process.env.MEDIA_DIR || './data/media';
  }

  /**
   * Download media from an incoming Baileys message.
   * Returns the raw Buffer.
   */
  async download(rawMessage: any): Promise<Buffer> {
    const buffer = await downloadMediaMessage(
      rawMessage,
      'buffer',
      {},
    );
    return buffer as Buffer;
  }

  /**
   * Download and persist to disk. Returns the saved file path.
   */
  async downloadAndSave(
    rawMessage: any,
    filename: string,
  ): Promise<string> {
    const buffer = await this.download(rawMessage);
    const filePath = path.join(this.mediaDir, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    this.logger.debug(`Saved media → ${filePath} (${buffer.length} bytes)`);
    return filePath;
  }
}
```

### 5.3 Message Mapper

Translates raw Baileys message objects into our clean application DTOs.

```typescript
// baileys/baileys-mapper.service.ts

import { Injectable } from '@nestjs/common';
import { WAMessage, WAMessageKey } from '@whiskeysockets/baileys';
import {
  IncomingMessage,
  IncomingTextMessage,
  IncomingAudioMessage,
  IncomingImageMessage,
  IncomingButtonResponse,
  IncomingListResponse,
} from '../interfaces/incoming-message.interface';

@Injectable()
export class BaileysMapperService {
  /**
   * Map a raw Baileys WAMessage to our application DTO.
   * Returns null if the message type is unsupported or irrelevant.
   */
  mapIncoming(raw: WAMessage): IncomingMessage | null {
    const msg = raw.message;
    if (!msg) return null;

    const base = {
      id: raw.key.id!,
      from: raw.key.remoteJid!,
      fromNumber: this.jidToNumber(raw.key.remoteJid!),
      timestamp: typeof raw.messageTimestamp === 'number'
        ? raw.messageTimestamp
        : Number(raw.messageTimestamp),
      raw,
    };

    // ── Text ──
    if (msg.conversation || msg.extendedTextMessage?.text) {
      return {
        ...base,
        type: 'text',
        body: msg.conversation || msg.extendedTextMessage!.text!,
      } as IncomingTextMessage;
    }

    // ── Audio ──
    if (msg.audioMessage) {
      return {
        ...base,
        type: 'audio',
        duration: msg.audioMessage.seconds ?? 0,
        mimeType: msg.audioMessage.mimetype ?? 'audio/ogg; codecs=opus',
        isPtt: msg.audioMessage.ptt ?? false,
        mediaHandle: raw,
      } as IncomingAudioMessage;
    }

    // ── Image ──
    if (msg.imageMessage) {
      return {
        ...base,
        type: 'image',
        mimeType: msg.imageMessage.mimetype ?? 'image/jpeg',
        caption: msg.imageMessage.caption ?? undefined,
        dimensions: msg.imageMessage.width && msg.imageMessage.height
          ? { width: msg.imageMessage.width, height: msg.imageMessage.height }
          : undefined,
        mediaHandle: raw,
      } as IncomingImageMessage;
    }

    // ── Button Response ──
    if (msg.buttonsResponseMessage) {
      return {
        ...base,
        type: 'button_response',
        selectedButtonId: msg.buttonsResponseMessage.selectedButtonId ?? '',
        selectedButtonText: msg.buttonsResponseMessage.selectedDisplayText ?? '',
      } as IncomingButtonResponse;
    }

    // ── List Response ──
    if (msg.listResponseMessage) {
      return {
        ...base,
        type: 'list_response',
        selectedRowId: msg.listResponseMessage.singleSelectReply?.selectedRowId ?? '',
        selectedRowTitle: msg.listResponseMessage.title ?? '',
      } as IncomingListResponse;
    }

    return null; // unsupported message type (stickers, contacts, etc.)
  }

  private jidToNumber(jid: string): string {
    return jid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
  }
}
```

### 5.4 Main Service

```typescript
// baileys/baileys-messaging.service.ts

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import makeWASocket, {
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidUser,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';

import {
  IMessagingService,
} from '../interfaces/messaging-service.interface';
import {
  ConnectionState,
  ConnectionStatus,
} from '../interfaces/connection-state.interface';
import {
  SentMessageResult,
} from '../interfaces/outgoing-message.interface';
import {
  ButtonOption,
  ListSection,
} from '../dto';
import { IncomingMediaMessage } from '../interfaces/incoming-message.interface';

import { MSG_EVENTS } from '../messaging.constants';
import { BaileysAuthService } from './baileys-auth.service';
import { BaileysMediaService } from './baileys-media.service';
import { BaileysMapperService } from './baileys-mapper.service';
import {
  TextMessageReceivedEvent,
  AudioMessageReceivedEvent,
  ImageMessageReceivedEvent,
  ButtonResponseReceivedEvent,
  ListResponseReceivedEvent,
  ConnectionStateChangedEvent,
} from '../events';

@Injectable()
export class BaileysMessagingService
  implements IMessagingService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BaileysMessagingService.name);
  private socket: WASocket;
  private connectionState: ConnectionState = {
    status: 'disconnected',
    reconnectAttempts: 0,
  };

  private readonly allowedNumber = process.env.MY_PHONE_NUMBER;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_BASE_DELAY_MS = 2_000;

  constructor(
    private readonly events: EventEmitter2,
    private readonly auth: BaileysAuthService,
    private readonly media: BaileysMediaService,
    private readonly mapper: BaileysMapperService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async initialize(): Promise<void> {
    const { state, saveCreds } = await this.auth.initialize();
    const { version } = await fetchLatestBaileysVersion();

    this.updateState('connecting');

    this.socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      printQRInTerminal: true,
      logger: pino({ level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug' }),
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
    });

    // ── Connection updates ──
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.updateState('qr_ready', qr);
        this.logger.log('QR code ready — scan with WhatsApp');
      }

      if (connection === 'open') {
        this.connectionState.reconnectAttempts = 0;
        this.updateState('connected');
        this.logger.log('WhatsApp connection established');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          this.logger.error('Session logged out. Clear session dir and re-scan.');
          this.updateState('disconnected');
          return;
        }

        // Reconnect with exponential backoff
        if (this.connectionState.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.connectionState.reconnectAttempts++;
          const delay = this.RECONNECT_BASE_DELAY_MS
            * Math.pow(2, this.connectionState.reconnectAttempts - 1);
          this.logger.warn(
            `Connection closed (code=${statusCode}). ` +
            `Reconnect attempt ${this.connectionState.reconnectAttempts} in ${delay}ms`,
          );
          this.updateState('reconnecting');
          setTimeout(() => this.initialize(), delay);
        } else {
          this.logger.error('Max reconnection attempts reached. Giving up.');
          this.updateState('disconnected');
        }
      }
    });

    // ── Credential updates ──
    this.socket.ev.on('creds.update', saveCreds);

    // ── Incoming messages ──
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const rawMsg of messages) {
        // Ignore own messages
        if (rawMsg.key.fromMe) continue;

        // Ignore non-user JIDs (groups, broadcasts)
        if (!isJidUser(rawMsg.key.remoteJid ?? '')) continue;

        // Guard: only process messages from allowed number
        const senderNumber = rawMsg.key.remoteJid?.replace(/@s\.whatsapp\.net$/, '');
        if (this.allowedNumber && senderNumber !== this.allowedNumber) {
          this.logger.debug(`Ignored message from ${senderNumber} (not allowed)`);
          continue;
        }

        const mapped = this.mapper.mapIncoming(rawMsg);
        if (!mapped) continue;

        // Send read receipt
        await this.socket.readMessages([rawMsg.key]);

        // Emit typed event
        this.emitMessageEvent(mapped);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.socket?.end(undefined);
    this.updateState('disconnected');
    this.logger.log('Disconnected from WhatsApp');
  }

  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  // ── Outbound: Text ─────────────────────────────────────

  async sendText(to: string, text: string): Promise<SentMessageResult> {
    return this.send(to, { text });
  }

  async sendFormattedText(to: string, text: string): Promise<SentMessageResult> {
    // Baileys passes through WhatsApp markdown (*bold*, _italic_, ~strike~, ```mono```)
    return this.send(to, { text });
  }

  // ── Outbound: Interactive ──────────────────────────────

  async sendButtons(
    to: string,
    body: string,
    buttons: ButtonOption[],
    footer?: string,
  ): Promise<SentMessageResult> {
    /**
     * NOTE: WhatsApp has deprecated classic buttons for business API.
     * Baileys still supports them on multi-device but they may stop
     * working. We include a text fallback.
     */
    try {
      return await this.send(to, {
        text: body,
        footer,
        buttons: buttons.map((b) => ({
          buttonId: b.id,
          buttonText: { displayText: b.text },
          type: 1,
        })),
        headerType: 1,
      });
    } catch {
      // Fallback: send as numbered text
      const fallback = this.buttonsToTextFallback(body, buttons, footer);
      return this.sendText(to, fallback);
    }
  }

  async sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: ListSection[],
    footer?: string,
  ): Promise<SentMessageResult> {
    try {
      return await this.send(to, {
        text: body,
        footer,
        title: body,
        buttonText,
        sections: sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({
            rowId: r.id,
            title: r.title,
            description: r.description,
          })),
        })),
      });
    } catch {
      const fallback = this.listToTextFallback(body, sections, footer);
      return this.sendText(to, fallback);
    }
  }

  // ── Outbound: Media ────────────────────────────────────

  async sendImage(
    to: string,
    image: Buffer | string,
    caption?: string,
  ): Promise<SentMessageResult> {
    const content = typeof image === 'string'
      ? { image: { url: image }, caption }
      : { image, caption };
    return this.send(to, content);
  }

  async sendAudio(
    to: string,
    audio: Buffer | string,
    ptt = true,
  ): Promise<SentMessageResult> {
    const content = typeof audio === 'string'
      ? { audio: { url: audio }, ptt }
      : { audio, ptt };
    return this.send(to, content);
  }

  // ── Outbound: Reactions ────────────────────────────────

  async sendReaction(
    to: string,
    messageId: string,
    emoji: string,
  ): Promise<SentMessageResult> {
    const jid = this.toJid(to);
    const sent = await this.socket.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: messageId } },
    });
    return this.toResult(sent);
  }

  // ── Inbound: Media ─────────────────────────────────────

  async downloadMedia(message: IncomingMediaMessage): Promise<Buffer> {
    return this.media.download(message.raw);
  }

  // ── Private helpers ────────────────────────────────────

  private async send(to: string, content: any): Promise<SentMessageResult> {
    const jid = this.toJid(to);
    const sent = await this.socket.sendMessage(jid, content);
    this.events.emit(MSG_EVENTS.MESSAGE_SENT, {
      to,
      messageId: sent?.key?.id,
      timestamp: Date.now(),
    });
    return this.toResult(sent);
  }

  private toJid(numberOrJid: string): string {
    if (numberOrJid.includes('@')) return numberOrJid;
    return `${numberOrJid}@s.whatsapp.net`;
  }

  private toResult(sent: any): SentMessageResult {
    return {
      messageId: sent?.key?.id ?? '',
      timestamp: Date.now(),
      success: !!sent?.key?.id,
    };
  }

  private updateState(status: ConnectionStatus, qrCode?: string): void {
    this.connectionState = {
      ...this.connectionState,
      status,
      qrCode: status === 'qr_ready' ? qrCode : undefined,
      lastConnectedAt: status === 'connected'
        ? new Date()
        : this.connectionState.lastConnectedAt,
    };
    this.events.emit(
      MSG_EVENTS.CONNECTION_STATE,
      new ConnectionStateChangedEvent(this.connectionState),
    );
  }

  private emitMessageEvent(message: any): void {
    const eventMap: Record<string, string> = {
      text:            MSG_EVENTS.TEXT_RECEIVED,
      audio:           MSG_EVENTS.AUDIO_RECEIVED,
      image:           MSG_EVENTS.IMAGE_RECEIVED,
      button_response: MSG_EVENTS.BUTTON_RESPONSE,
      list_response:   MSG_EVENTS.LIST_RESPONSE,
    };

    const eventName = eventMap[message.type];
    if (eventName) {
      this.logger.debug(`Emitting ${eventName} from ${message.fromNumber}`);
      this.events.emit(eventName, { message });
    }
  }

  // ── Fallbacks (when interactive messages are unsupported) ──

  private buttonsToTextFallback(
    body: string,
    buttons: ButtonOption[],
    footer?: string,
  ): string {
    const lines = [body, ''];
    buttons.forEach((b, i) => lines.push(`*${i + 1}.* ${b.text}`));
    if (footer) lines.push('', `_${footer}_`);
    lines.push('', 'Reply with the number of your choice.');
    return lines.join('\n');
  }

  private listToTextFallback(
    body: string,
    sections: ListSection[],
    footer?: string,
  ): string {
    const lines = [body, ''];
    let index = 1;
    for (const section of sections) {
      lines.push(`*${section.title}*`);
      for (const row of section.rows) {
        lines.push(`  ${index}. ${row.title}${row.description ? ` — ${row.description}` : ''}`);
        index++;
      }
      lines.push('');
    }
    if (footer) lines.push(`_${footer}_`);
    lines.push('Reply with the number of your choice.');
    return lines.join('\n');
  }
}
```

---

## 6. Module Registration

```typescript
// messaging.module.ts

import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MESSAGING_SERVICE } from './messaging.constants';
import { BaileysMessagingService } from './baileys/baileys-messaging.service';
import { BaileysAuthService } from './baileys/baileys-auth.service';
import { BaileysMediaService } from './baileys/baileys-media.service';
import { BaileysMapperService } from './baileys/baileys-mapper.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [
    // Internal Baileys services (not exported)
    BaileysAuthService,
    BaileysMediaService,
    BaileysMapperService,

    // The abstraction token → Baileys implementation
    {
      provide: MESSAGING_SERVICE,
      useClass: BaileysMessagingService,
    },
  ],
  exports: [MESSAGING_SERVICE],
})
export class MessagingModule {}
```

**Swapping implementation** — change one line:

```typescript
// To use a future Twilio or WhatsApp Business API implementation:
{
  provide: MESSAGING_SERVICE,
  useClass: TwilioMessagingService,  // just swap the class
}
```

---

## 7. Fake Implementation (Testing)

```typescript
// fake/fake-messaging.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { IMessagingService } from '../interfaces/messaging-service.interface';
import { ConnectionState } from '../interfaces/connection-state.interface';
import { SentMessageResult } from '../interfaces/outgoing-message.interface';
import { ButtonOption, ListSection } from '../dto';
import { IncomingMediaMessage } from '../interfaces/incoming-message.interface';

@Injectable()
export class FakeMessagingService implements IMessagingService {
  private readonly logger = new Logger(FakeMessagingService.name);

  /** Captured messages for test assertions */
  public sentMessages: Array<{
    to: string;
    type: string;
    content: any;
    timestamp: number;
  }> = [];

  /** Simulate incoming messages by pushing to this and calling handlers */
  public incomingQueue: any[] = [];

  async initialize(): Promise<void> {
    this.logger.log('FakeMessagingService initialized');
  }

  async disconnect(): Promise<void> {}

  getConnectionState(): ConnectionState {
    return { status: 'connected', reconnectAttempts: 0, lastConnectedAt: new Date() };
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

  async sendAudio(
    to: string,
    audio: Buffer | string,
    ptt?: boolean,
  ): Promise<SentMessageResult> {
    return this.capture(to, 'audio', { ptt, hasBuffer: Buffer.isBuffer(audio) });
  }

  async sendReaction(
    to: string,
    messageId: string,
    emoji: string,
  ): Promise<SentMessageResult> {
    return this.capture(to, 'reaction', { messageId, emoji });
  }

  async downloadMedia(_message: IncomingMediaMessage): Promise<Buffer> {
    return Buffer.from('fake-media-bytes');
  }

  // ── Test helpers ──

  private capture(to: string, type: string, content: any): SentMessageResult {
    const entry = { to, type, content, timestamp: Date.now() };
    this.sentMessages.push(entry);
    this.logger.debug(`[FAKE] → ${type} to ${to}: ${JSON.stringify(content).slice(0, 100)}`);
    return { messageId: `fake-${Date.now()}`, timestamp: Date.now(), success: true };
  }

  /** Get all messages sent to a specific number */
  getMessagesTo(number: string) {
    return this.sentMessages.filter((m) => m.to === number || m.to.startsWith(number));
  }

  /** Get the last sent message */
  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1] ?? null;
  }

  /** Clear captured messages */
  reset() {
    this.sentMessages = [];
    this.incomingQueue = [];
  }
}
```

---

## 8. Sender Guard

Ensures the single-user app only processes messages from the configured phone number.

```typescript
// guards/allowed-sender.guard.ts

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AllowedSenderGuard {
  private readonly logger = new Logger(AllowedSenderGuard.name);
  private readonly allowedNumber = process.env.MY_PHONE_NUMBER;

  isAllowed(senderNumber: string): boolean {
    if (!this.allowedNumber) {
      this.logger.warn('MY_PHONE_NUMBER not set — allowing all senders');
      return true;
    }
    return senderNumber === this.allowedNumber;
  }
}
```

> **Note:** The guard logic is also embedded directly in the Baileys service's `messages.upsert` handler for defense in depth. The standalone guard class is available for use in other modules or future multi-user scenarios.

---

## 9. WhatsApp Interactive Message Limitations

| Feature | Status | Fallback |
|---------|--------|----------|
| **Buttons (quick reply)** | Deprecated for some accounts; works on Baileys multi-device but unreliable | Auto-fallback to numbered text list |
| **List messages** | Same as buttons — partial support | Auto-fallback to numbered text list |
| **Reactions** | Fully supported | N/A |
| **Voice notes (PTT)** | Fully supported | N/A |
| **Image + caption** | Fully supported | N/A |
| **Read receipts** | Supported (blue ticks) | N/A |
| **Typing indicator** | Supported via `socket.sendPresenceUpdate('composing', jid)` | Not critical |

The implementation includes automatic text fallbacks for buttons and lists, so the UX degrades gracefully.

---

## 10. Reconnection Strategy

```
Attempt  Delay       Total wait
1        2s          2s
2        4s          6s
3        8s          14s
4        16s         30s
5        32s         ~1 min
6        64s         ~2 min
7        128s        ~4 min
8        256s        ~8.5 min
9        512s        ~17 min
10       1024s       ~34 min  ← give up
```

- Exponential backoff: `2^n × 2000ms`.
- Counter resets on successful connection.
- Logged out (HTTP 401 from WhatsApp) is treated as terminal — no retry, requires re-scan.

---

## 11. Configuration Reference

```env
# ── Messaging provider ──
MESSAGING_PROVIDER=baileys             # future: twilio, whatsapp-business-api

# ── Baileys-specific ──
WHATSAPP_SESSION_DIR=./data/session    # multi-file auth state directory
MY_PHONE_NUMBER=20xxxxxxxxxx           # sender whitelist (single user)

# ── Media ──
MEDIA_DIR=./data/media                 # where downloaded images/audio are saved

# ── Logging ──
NODE_ENV=development                   # development = debug logs, production = warn
```

---

## 12. Sequence Diagrams

### 12.1 First-Time Connection (QR Pairing)

```
App Start
   │
   ▼
BaileysAuthService.initialize()
   │  no existing session found
   ▼
makeWASocket() → connection.update { qr: "..." }
   │
   ▼
Print QR in terminal + emit CONNECTION_STATE("qr_ready")
   │
   ▼
User scans QR with phone
   │
   ▼
connection.update { connection: "open" }
   │
   ▼
saveCreds() → session persisted to disk
   │
   ▼
Emit CONNECTION_STATE("connected")
   │
   ▼
Ready to send/receive
```

### 12.2 Incoming Text Message

```
WhatsApp servers
   │
   ▼
socket.ev "messages.upsert" (type: "notify")
   │
   ├── fromMe? → skip
   ├── not user JID? → skip
   ├── not allowed number? → skip
   │
   ▼
BaileysMapperService.mapIncoming(rawMsg)
   │
   ▼
IncomingTextMessage { type: "text", body: "...", from: "20xxx" }
   │
   ▼
socket.readMessages() → send read receipt (blue ticks)
   │
   ▼
EventEmitter2.emit("message.text.received", event)
   │
   ▼
ConversationService.handleText() (subscribed via @OnEvent)
```

### 12.3 Sending Buttons with Fallback

```
ConversationService
   │
   ▼
messaging.sendButtons(to, body, [btn1, btn2, btn3])
   │
   ▼
BaileysMessagingService.sendButtons()
   │
   ├── try: socket.sendMessage({ buttons: [...] })
   │       │
   │       ├── success → SentMessageResult ✅
   │       │
   │       └── error (buttons deprecated)
   │               │
   │               ▼
   │           buttonsToTextFallback()
   │               │
   │               ▼
   │           sendText("body\n\n*1.* btn1\n*2.* btn2\n*3.* btn3\nReply with number")
   │
   ▼
SentMessageResult ✅
```

---

## 13. Future Implementations

The abstraction supports plugging in alternative providers:

| Provider | When to use | Notes |
|----------|-------------|-------|
| **WhatsApp Business API (Cloud)** | Production, official channel | Requires Meta Business verification, costs per-conversation |
| **Twilio for WhatsApp** | Production, easier setup | Twilio as intermediary, per-message cost |
| **WhatsApp Business API (On-Premise)** | Enterprise self-hosted | Complex setup, full control |
| **Mock / CLI** | Local development | Read/write from terminal instead of WhatsApp |

Each would implement `IMessagingService` and be registered under the same `MESSAGING_SERVICE` token.
