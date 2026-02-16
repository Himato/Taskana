import { Injectable, Logger } from '@nestjs/common';

import { RecentMessage } from '../../openai/interfaces';
import { ConversationState, StateUpdate } from '../interfaces';

/**
 * Manages conversation state for each user.
 * State is stored in memory and expires after 5 minutes of inactivity.
 */
@Injectable()
export class StateService {
  private readonly logger = new Logger(StateService.name);

  /** In-memory state storage keyed by phone number */
  private states: Map<string, ConversationState> = new Map();

  /** Maximum number of recent messages to keep */
  private readonly maxRecentMessages = 10;

  /** Pending state expiry time in milliseconds (5 minutes) */
  private readonly pendingExpiryMs = 5 * 60 * 1000;

  /**
   * Get or create state for a phone number.
   */
  getState(phoneNumber: string): ConversationState {
    let state = this.states.get(phoneNumber);

    if (!state) {
      state = this.createInitialState(phoneNumber);
      this.states.set(phoneNumber, state);
    }

    // Check for pending state expiry
    if (this.isPendingExpired(state)) {
      this.logger.debug(`Pending state expired for ${phoneNumber}`);
      this.clearPendingState(phoneNumber);
      state = this.states.get(phoneNumber)!;
    }

    return state;
  }

  /**
   * Update state for a phone number.
   */
  setState(phoneNumber: string, updates: StateUpdate): ConversationState {
    const state = this.getState(phoneNumber);

    if (updates.pendingState !== undefined) {
      state.pendingState = updates.pendingState;
      state.pendingSetAt = updates.pendingState !== 'idle' ? new Date() : undefined;
    }

    if (updates.pendingReference !== undefined) {
      state.pendingReference = updates.pendingReference;
    }

    if (updates.pendingAction !== undefined) {
      state.pendingAction = updates.pendingAction;
    }

    state.lastActivity = new Date();
    this.states.set(phoneNumber, state);

    this.logger.debug(
      `State updated for ${phoneNumber}: pendingState=${state.pendingState}, ref=${state.pendingReference}`,
    );

    return state;
  }

  /**
   * Clear pending state (reset to idle).
   * Note: Uses direct map access to avoid recursion with getState().
   */
  clearPendingState(phoneNumber: string): ConversationState {
    let state = this.states.get(phoneNumber);

    if (!state) {
      state = this.createInitialState(phoneNumber);
    }

    state.pendingState = 'idle';
    state.pendingReference = undefined;
    state.pendingAction = undefined;
    state.pendingSetAt = undefined;
    state.lastActivity = new Date();

    this.states.set(phoneNumber, state);
    return state;
  }

  /**
   * Add a message to conversation history.
   */
  addMessage(phoneNumber: string, role: 'user' | 'assistant', content: string): void {
    const state = this.getState(phoneNumber);

    state.recentMessages.push({
      role,
      content,
      timestamp: new Date(),
    });

    // Cap at max messages
    if (state.recentMessages.length > this.maxRecentMessages) {
      state.recentMessages = state.recentMessages.slice(-this.maxRecentMessages);
    }

    state.lastActivity = new Date();
    this.states.set(phoneNumber, state);
  }

  /**
   * Get recent messages for a phone number.
   */
  getRecentMessages(phoneNumber: string): RecentMessage[] {
    return this.getState(phoneNumber).recentMessages;
  }

  /**
   * Check if there's an active pending state.
   */
  hasPendingState(phoneNumber: string): boolean {
    const state = this.getState(phoneNumber);
    return state.pendingState !== 'idle' && !this.isPendingExpired(state);
  }

  /**
   * Create initial state for a new user.
   */
  private createInitialState(phoneNumber: string): ConversationState {
    return {
      phoneNumber,
      pendingState: 'idle',
      recentMessages: [],
      lastActivity: new Date(),
    };
  }

  /**
   * Check if pending state has expired.
   */
  private isPendingExpired(state: ConversationState): boolean {
    if (state.pendingState === 'idle' || !state.pendingSetAt) {
      return false;
    }

    const elapsed = Date.now() - state.pendingSetAt.getTime();
    return elapsed > this.pendingExpiryMs;
  }

  /**
   * Clear all states (useful for testing).
   */
  clearAll(): void {
    this.states.clear();
  }
}
