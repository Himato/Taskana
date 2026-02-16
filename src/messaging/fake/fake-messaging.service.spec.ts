import { FakeMessagingService } from './fake-messaging.service';

describe('FakeMessagingService', () => {
  let service: FakeMessagingService;

  beforeEach(() => {
    service = new FakeMessagingService();
  });

  describe('sendText', () => {
    it('should capture text messages', async () => {
      const result = await service.sendText('20123456789', 'Hello');

      expect(result.success).toBe(true);
      expect(result.messageId).toContain('fake-');

      const lastMessage = service.getLastMessage();
      expect(lastMessage?.to).toBe('20123456789');
      expect(lastMessage?.type).toBe('text');
      expect(lastMessage?.content).toEqual({ text: 'Hello' });
    });
  });

  describe('sendButtons', () => {
    it('should capture button messages', async () => {
      const buttons = [
        { id: 'yes', text: 'Yes' },
        { id: 'no', text: 'No' },
      ];
      await service.sendButtons('20123456789', 'Choose one', buttons, 'Footer');

      const lastMessage = service.getLastMessage();
      expect(lastMessage?.type).toBe('buttons');
      expect(lastMessage?.content).toEqual({
        body: 'Choose one',
        buttons,
        footer: 'Footer',
      });
    });
  });

  describe('sendList', () => {
    it('should capture list messages', async () => {
      const sections = [
        {
          title: 'Options',
          rows: [
            { id: '1', title: 'Option 1' },
            { id: '2', title: 'Option 2' },
          ],
        },
      ];
      await service.sendList('20123456789', 'Select', 'View', sections);

      const lastMessage = service.getLastMessage();
      expect(lastMessage?.type).toBe('list');
      expect(lastMessage?.content).toEqual({
        body: 'Select',
        buttonText: 'View',
        sections,
        footer: undefined,
      });
    });
  });

  describe('sendImage', () => {
    it('should capture image messages with buffer', async () => {
      const buffer = Buffer.from('image-data');
      await service.sendImage('20123456789', buffer, 'Caption');

      const lastMessage = service.getLastMessage();
      expect(lastMessage?.type).toBe('image');
      expect(lastMessage?.content).toEqual({
        caption: 'Caption',
        hasBuffer: true,
      });
    });

    it('should capture image messages with path', async () => {
      await service.sendImage('20123456789', '/path/to/image.jpg');

      const lastMessage = service.getLastMessage();
      expect(lastMessage?.content).toEqual({
        caption: undefined,
        hasBuffer: false,
      });
    });
  });

  describe('sendAudio', () => {
    it('should capture audio messages', async () => {
      const buffer = Buffer.from('audio-data');
      await service.sendAudio('20123456789', buffer, true);

      const lastMessage = service.getLastMessage();
      expect(lastMessage?.type).toBe('audio');
      expect(lastMessage?.content).toEqual({
        ptt: true,
        hasBuffer: true,
      });
    });
  });

  describe('sendReaction', () => {
    it('should capture reactions', async () => {
      await service.sendReaction('20123456789', 'msg-123', '✅');

      const lastMessage = service.getLastMessage();
      expect(lastMessage?.type).toBe('reaction');
      expect(lastMessage?.content).toEqual({
        messageId: 'msg-123',
        emoji: '✅',
      });
    });
  });

  describe('downloadMedia', () => {
    it('should return fake media bytes', async () => {
      const buffer = await service.downloadMedia({} as never);
      expect(buffer.toString()).toBe('fake-media-bytes');
    });
  });

  describe('getMessagesTo', () => {
    it('should filter messages by recipient', async () => {
      await service.sendText('20111111111', 'First');
      await service.sendText('20222222222', 'Second');
      await service.sendText('20111111111', 'Third');

      const messages = service.getMessagesTo('20111111111');
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toEqual({ text: 'First' });
      expect(messages[1].content).toEqual({ text: 'Third' });
    });
  });

  describe('reset', () => {
    it('should clear all captured messages', async () => {
      await service.sendText('20123456789', 'Test');
      expect(service.sentMessages).toHaveLength(1);

      service.reset();
      expect(service.sentMessages).toHaveLength(0);
      expect(service.incomingQueue).toHaveLength(0);
    });
  });

  describe('getConnectionState', () => {
    it('should return connected state', () => {
      const state = service.getConnectionState();
      expect(state.status).toBe('connected');
      expect(state.reconnectAttempts).toBe(0);
      expect(state.lastConnectedAt).toBeInstanceOf(Date);
    });
  });
});
