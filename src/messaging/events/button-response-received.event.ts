import { IncomingButtonResponse } from '../interfaces';

/**
 * Event emitted when a button response is received.
 */
export class ButtonResponseReceivedEvent {
  constructor(public readonly message: IncomingButtonResponse) {}
}
