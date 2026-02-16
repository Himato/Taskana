import { IncomingImageMessage } from '../interfaces';

/**
 * Event emitted when an image message is received.
 */
export class ImageMessageReceivedEvent {
  constructor(public readonly message: IncomingImageMessage) {}
}
