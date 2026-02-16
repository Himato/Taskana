/**
 * Connection status types for WhatsApp connection lifecycle.
 */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready' // QR code available, waiting for scan
  | 'connected'
  | 'reconnecting';

/**
 * Current state of the WhatsApp connection.
 */
export interface ConnectionState {
  status: ConnectionStatus;
  /** QR string for pairing (only when status === 'qr_ready') */
  qrCode?: string;
  /** Number of reconnection attempts since last stable connection */
  reconnectAttempts: number;
  /** Timestamp of last successful connection */
  lastConnectedAt?: Date;
}
