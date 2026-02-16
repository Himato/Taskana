/**
 * Injection token for the messaging service.
 * Use this to inject the messaging service abstraction.
 *
 * @example
 * constructor(@Inject(MESSAGING_SERVICE) private readonly messaging: IMessagingService) {}
 */
export const MESSAGING_SERVICE = Symbol('MESSAGING_SERVICE');

/**
 * EventEmitter2 event names for messaging events.
 * All modules should use these constants instead of string literals.
 */
export const MSG_EVENTS = {
  TEXT_RECEIVED: 'message.text.received',
  AUDIO_RECEIVED: 'message.audio.received',
  IMAGE_RECEIVED: 'message.image.received',
  BUTTON_RESPONSE: 'message.button.response',
  LIST_RESPONSE: 'message.list.response',
  MESSAGE_SENT: 'message.sent',
  CONNECTION_STATE: 'connection.state',
} as const;
