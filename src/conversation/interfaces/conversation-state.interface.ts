import { PendingState, RecentMessage } from '../../openai/interfaces';

/**
 * Conversation state for a single user (phone number).
 */
export interface ConversationState {
  /** Phone number identifier */
  phoneNumber: string;

  /** Current pending state */
  pendingState: PendingState;

  /** Reference ID for pending action (e.g., habit ID, task ID) */
  pendingReference?: string;

  /** Description of pending action */
  pendingAction?: string;

  /** When the pending state was set (for auto-expiry) */
  pendingSetAt?: Date;

  /** Recent message history */
  recentMessages: RecentMessage[];

  /** Last activity timestamp */
  lastActivity: Date;
}

/**
 * Options for updating conversation state.
 */
export interface StateUpdate {
  pendingState?: PendingState;
  pendingReference?: string;
  pendingAction?: string;
}
