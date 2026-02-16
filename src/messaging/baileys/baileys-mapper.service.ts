import { Injectable } from '@nestjs/common';
import { WAMessage } from '@whiskeysockets/baileys';

import {
  IncomingAudioMessage,
  IncomingButtonResponse,
  IncomingImageMessage,
  IncomingListResponse,
  IncomingMessage,
  IncomingTextMessage,
} from '../interfaces';

/**
 * Maps raw Baileys WAMessage objects to application DTOs.
 */
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
      timestamp:
        typeof raw.messageTimestamp === 'number'
          ? raw.messageTimestamp
          : Number(raw.messageTimestamp),
      raw,
    };

    // Text message (regular or extended)
    if (msg.conversation || msg.extendedTextMessage?.text) {
      return {
        ...base,
        type: 'text',
        body: msg.conversation || msg.extendedTextMessage!.text!,
      } as IncomingTextMessage;
    }

    // Audio message
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

    // Image message
    if (msg.imageMessage) {
      return {
        ...base,
        type: 'image',
        mimeType: msg.imageMessage.mimetype ?? 'image/jpeg',
        caption: msg.imageMessage.caption ?? undefined,
        dimensions:
          msg.imageMessage.width && msg.imageMessage.height
            ? { width: msg.imageMessage.width, height: msg.imageMessage.height }
            : undefined,
        mediaHandle: raw,
      } as IncomingImageMessage;
    }

    // Button response
    if (msg.buttonsResponseMessage) {
      return {
        ...base,
        type: 'button_response',
        selectedButtonId: msg.buttonsResponseMessage.selectedButtonId ?? '',
        selectedButtonText: msg.buttonsResponseMessage.selectedDisplayText ?? '',
      } as IncomingButtonResponse;
    }

    // List response
    if (msg.listResponseMessage) {
      return {
        ...base,
        type: 'list_response',
        selectedRowId: msg.listResponseMessage.singleSelectReply?.selectedRowId ?? '',
        selectedRowTitle: msg.listResponseMessage.title ?? '',
      } as IncomingListResponse;
    }

    // Unsupported message type (stickers, contacts, location, etc.)
    return null;
  }

  /**
   * Convert a JID to a plain phone number.
   * "20xxxxxxxxxx@s.whatsapp.net" → "20xxxxxxxxxx"
   */
  private jidToNumber(jid: string): string {
    return jid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
  }
}
