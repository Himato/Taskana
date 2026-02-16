import { IncomingTextMessage } from '../interfaces';

/**
 * Event emitted when a text message is received.
 */
export class TextMessageReceivedEvent {
  constructor(public readonly message: IncomingTextMessage) {}
}
