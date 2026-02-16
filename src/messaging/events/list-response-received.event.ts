import { IncomingListResponse } from '../interfaces';

/**
 * Event emitted when a list selection response is received.
 */
export class ListResponseReceivedEvent {
  constructor(public readonly message: IncomingListResponse) {}
}
