import { ConnectionState } from '../interfaces';

/**
 * Event emitted when the connection state changes.
 */
export class ConnectionStateChangedEvent {
  constructor(public readonly state: ConnectionState) {}
}
