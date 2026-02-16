import { Boom } from '@hapi/boom';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  makeCacheableSignalKeyStore,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';

import { ButtonOption, ListSection } from '../dto';
import {
  AudioMessageReceivedEvent,
  ButtonResponseReceivedEvent,
  ConnectionStateChangedEvent,
  ImageMessageReceivedEvent,
  ListResponseReceivedEvent,
  TextMessageReceivedEvent,
} from '../events';
import {
  ConnectionState,
  ConnectionStatus,
  IMessagingService,
  IncomingMediaMessage,
  IncomingMessage,
  SentMessageResult,
} from '../interfaces';
import { MSG_EVENTS } from '../messaging.constants';

import { BaileysAuthService } from './baileys-auth.service';
import { BaileysMapperService } from './baileys-mapper.service';
import { BaileysMediaService } from './baileys-media.service';

/**
 * WhatsApp messaging implementation using Baileys library.
 */
@Injectable()
export class BaileysMessagingService implements IMessagingService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysMessagingService.name);
  private socket!: WASocket;
  private connectionState: ConnectionState = {
    status: 'disconnected',
    reconnectAttempts: 0,
  };

  private readonly allowedNumber: string;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_BASE_DELAY_MS = 2000;

  constructor(
    private readonly configService: ConfigService,
    private readonly events: EventEmitter2,
    private readonly auth: BaileysAuthService,
    private readonly media: BaileysMediaService,
    private readonly mapper: BaileysMapperService,
  ) {
    this.allowedNumber = this.configService.get<string>('whatsapp.myPhoneNumber', '');
  }

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

    const nodeEnv = this.configService.get<string>('nodeEnv', 'development');

    this.socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      printQRInTerminal: true,
      logger: pino({ level: nodeEnv === 'production' ? 'warn' : 'debug' }),
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
    });

    // Connection updates
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
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (isLoggedOut) {
          this.logger.error('Session logged out. Clear session dir and re-scan.');
          this.updateState('disconnected');
          return;
        }

        // Reconnect with exponential backoff
        if (this.connectionState.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.connectionState.reconnectAttempts++;
          const delay =
            this.RECONNECT_BASE_DELAY_MS * Math.pow(2, this.connectionState.reconnectAttempts - 1);
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

    // Credential updates
    this.socket.ev.on('creds.update', saveCreds);

    // Incoming messages
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const rawMsg of messages) {
        // Ignore own messages
        if (rawMsg.key.fromMe) continue;

        // Ignore non-user JIDs (groups, broadcasts)
        const remoteJid = rawMsg.key.remoteJid ?? '';
        if (isJidGroup(remoteJid) || isJidBroadcast(remoteJid)) continue;

        // Guard: only process messages from allowed number
        const senderNumber = rawMsg.key.remoteJid?.replace(/@s\.whatsapp\.net$/, '');
        if (this.allowedNumber && senderNumber !== this.allowedNumber) {
          this.logger.debug(`Ignored message from ${senderNumber} (not allowed)`);
          continue;
        }

        const mapped = this.mapper.mapIncoming(rawMsg);
        if (!mapped) continue;

        // Send read receipt (intentional fire-and-forget)
        void this.socket.readMessages([rawMsg.key]);

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
    // WhatsApp has deprecated classic buttons for business API.
    // Baileys still supports them but they may stop working.
    // Include a text fallback.
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
    const content =
      typeof image === 'string' ? { image: { url: image }, caption } : { image, caption };
    return this.send(to, content);
  }

  async sendAudio(to: string, audio: Buffer | string, ptt = true): Promise<SentMessageResult> {
    const content = typeof audio === 'string' ? { audio: { url: audio }, ptt } : { audio, ptt };
    return this.send(to, content);
  }

  // ── Outbound: Reactions ────────────────────────────────

  async sendReaction(to: string, messageId: string, emoji: string): Promise<SentMessageResult> {
    const jid = this.toJid(to);
    const sent = await this.socket.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: messageId } },
    });
    return this.toResult(sent);
  }

  // ── Inbound: Media ─────────────────────────────────────

  async downloadMedia(message: IncomingMediaMessage): Promise<Buffer> {
    return this.media.download(message.raw as never);
  }

  // ── Private helpers ────────────────────────────────────

  private async send(to: string, content: unknown): Promise<SentMessageResult> {
    const jid = this.toJid(to);
    const sent = await this.socket.sendMessage(jid, content as never);
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

  private toResult(sent: unknown): SentMessageResult {
    const msg = sent as { key?: { id?: string } };
    return {
      messageId: msg?.key?.id ?? '',
      timestamp: Date.now(),
      success: !!msg?.key?.id,
    };
  }

  private updateState(status: ConnectionStatus, qrCode?: string): void {
    this.connectionState = {
      ...this.connectionState,
      status,
      qrCode: status === 'qr_ready' ? qrCode : undefined,
      lastConnectedAt: status === 'connected' ? new Date() : this.connectionState.lastConnectedAt,
    };
    this.events.emit(
      MSG_EVENTS.CONNECTION_STATE,
      new ConnectionStateChangedEvent(this.connectionState),
    );
  }

  private emitMessageEvent(message: IncomingMessage): void {
    const eventMap: Record<string, { event: string; eventClass: unknown }> = {
      text: { event: MSG_EVENTS.TEXT_RECEIVED, eventClass: TextMessageReceivedEvent },
      audio: { event: MSG_EVENTS.AUDIO_RECEIVED, eventClass: AudioMessageReceivedEvent },
      image: { event: MSG_EVENTS.IMAGE_RECEIVED, eventClass: ImageMessageReceivedEvent },
      button_response: {
        event: MSG_EVENTS.BUTTON_RESPONSE,
        eventClass: ButtonResponseReceivedEvent,
      },
      list_response: {
        event: MSG_EVENTS.LIST_RESPONSE,
        eventClass: ListResponseReceivedEvent,
      },
    };

    const mapping = eventMap[message.type];
    if (mapping) {
      this.logger.debug(`Emitting ${mapping.event} from ${message.fromNumber}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const EventClass = mapping.eventClass as any;
      this.events.emit(mapping.event, new EventClass(message));
    }
  }

  // ── Fallbacks (when interactive messages are unsupported) ──

  private buttonsToTextFallback(body: string, buttons: ButtonOption[], footer?: string): string {
    const lines = [body, ''];
    buttons.forEach((b, i) => lines.push(`*${i + 1}.* ${b.text}`));
    if (footer) lines.push('', `_${footer}_`);
    lines.push('', 'Reply with the number of your choice.');
    return lines.join('\n');
  }

  private listToTextFallback(body: string, sections: ListSection[], footer?: string): string {
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
