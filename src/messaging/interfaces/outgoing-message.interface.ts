/**
 * Result returned after sending a message.
 */
export interface SentMessageResult {
  /** WhatsApp message ID of the sent message */
  messageId: string;
  /** Delivery timestamp */
  timestamp: number;
  /** Whether the message was sent successfully */
  success: boolean;
}
