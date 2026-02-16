import { WAMessage } from '@whiskeysockets/baileys';

import { BaileysMapperService } from './baileys-mapper.service';

describe('BaileysMapperService', () => {
  let mapper: BaileysMapperService;

  beforeEach(() => {
    mapper = new BaileysMapperService();
  });

  const createBaseMessage = (overrides: Partial<WAMessage> = {}): WAMessage =>
    ({
      key: {
        id: 'msg-123',
        remoteJid: '20123456789@s.whatsapp.net',
        fromMe: false,
      },
      messageTimestamp: 1700000000,
      message: {},
      ...overrides,
    }) as WAMessage;

  describe('mapIncoming', () => {
    it('should return null for messages without content', () => {
      const raw = createBaseMessage({ message: undefined });
      expect(mapper.mapIncoming(raw)).toBeNull();
    });

    it('should map a text conversation message', () => {
      const raw = createBaseMessage({
        message: { conversation: 'Hello world' },
      });

      const result = mapper.mapIncoming(raw);

      expect(result).toEqual({
        id: 'msg-123',
        from: '20123456789@s.whatsapp.net',
        fromNumber: '20123456789',
        timestamp: 1700000000,
        raw,
        type: 'text',
        body: 'Hello world',
      });
    });

    it('should map an extended text message', () => {
      const raw = createBaseMessage({
        message: { extendedTextMessage: { text: 'Extended text' } },
      });

      const result = mapper.mapIncoming(raw);

      expect(result?.type).toBe('text');
      expect((result as { body: string }).body).toBe('Extended text');
    });

    it('should map an audio message', () => {
      const raw = createBaseMessage({
        message: {
          audioMessage: {
            seconds: 15,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
          },
        },
      });

      const result = mapper.mapIncoming(raw);

      expect(result?.type).toBe('audio');
      expect((result as { duration: number }).duration).toBe(15);
      expect((result as { isPtt: boolean }).isPtt).toBe(true);
      expect((result as { mimeType: string }).mimeType).toBe('audio/ogg; codecs=opus');
    });

    it('should map an image message', () => {
      const raw = createBaseMessage({
        message: {
          imageMessage: {
            mimetype: 'image/jpeg',
            caption: 'A photo',
            width: 800,
            height: 600,
          },
        },
      });

      const result = mapper.mapIncoming(raw);

      expect(result?.type).toBe('image');
      expect((result as { caption: string }).caption).toBe('A photo');
      expect((result as { dimensions: { width: number; height: number } }).dimensions).toEqual({
        width: 800,
        height: 600,
      });
    });

    it('should map a button response', () => {
      const raw = createBaseMessage({
        message: {
          buttonsResponseMessage: {
            selectedButtonId: 'btn-1',
            selectedDisplayText: 'Yes',
          },
        },
      });

      const result = mapper.mapIncoming(raw);

      expect(result?.type).toBe('button_response');
      expect((result as { selectedButtonId: string }).selectedButtonId).toBe('btn-1');
      expect((result as { selectedButtonText: string }).selectedButtonText).toBe('Yes');
    });

    it('should map a list response', () => {
      const raw = createBaseMessage({
        message: {
          listResponseMessage: {
            singleSelectReply: { selectedRowId: 'row-2' },
            title: 'Option 2',
          },
        },
      });

      const result = mapper.mapIncoming(raw);

      expect(result?.type).toBe('list_response');
      expect((result as { selectedRowId: string }).selectedRowId).toBe('row-2');
      expect((result as { selectedRowTitle: string }).selectedRowTitle).toBe('Option 2');
    });

    it('should return null for unsupported message types', () => {
      const raw = createBaseMessage({
        message: { stickerMessage: {} },
      });

      expect(mapper.mapIncoming(raw)).toBeNull();
    });

    it('should handle group JIDs', () => {
      const raw = createBaseMessage({
        key: {
          id: 'msg-123',
          remoteJid: '123456789@g.us',
          fromMe: false,
        },
        message: { conversation: 'Group message' },
      });

      const result = mapper.mapIncoming(raw);

      expect(result?.fromNumber).toBe('123456789');
    });
  });
});
