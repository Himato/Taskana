import { IncomingAudioMessage } from '../interfaces';

/**
 * Event emitted when an audio/voice message is received.
 */
export class AudioMessageReceivedEvent {
  constructor(public readonly message: IncomingAudioMessage) {}
}
