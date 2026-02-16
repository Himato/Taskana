import { IslamicTimeSlot } from '../../common/types/islamic-time-slot';

/**
 * All supported intent types.
 */
export const INTENT_TYPES = [
  // Greetings & Help
  'greeting',
  'help',

  // Habit operations
  'habit_done',
  'habit_skipped',
  'habit_list',
  'habit_status',

  // Task operations
  'task_create',
  'task_complete',
  'task_skip',
  'task_shift',
  'task_update',
  'task_delete',
  'task_list',

  // Summaries
  'daily_summary',
  'weekly_summary',

  // Conversation flow
  'confirmation',
  'rejection',
  'image_tag_response',

  // Fallback
  'unclear',
] as const;

export type IntentType = (typeof INTENT_TYPES)[number];

/**
 * Extracted entities from user message.
 */
export interface ExtractedEntities {
  /** Habit ID reference */
  habitId?: string;

  /** Task ID reference (e.g., "1", "t-001") */
  taskId?: string;

  /** Task title for creation */
  taskTitle?: string;

  /** Task description */
  taskDescription?: string;

  /** Islamic time slot */
  timeSlot?: IslamicTimeSlot;

  /** Target date (ISO string YYYY-MM-DD) */
  targetDate?: string;

  /** Raw date expression (e.g., "بكرة", "tomorrow", "thursday") */
  rawDateExpression?: string;

  /** Justification/reason text */
  justification?: string;

  /** Selected option number (for list/button responses) */
  selectedOption?: number;

  /** Any additional context extracted */
  additionalContext?: string;
}

/**
 * Result of intent classification.
 */
export interface ClassifiedIntent {
  /** Detected intent type */
  intent: IntentType;

  /** Confidence score (0-1) */
  confidence: number;

  /** Extracted entities */
  entities: ExtractedEntities;

  /** Follow-up question if clarification needed */
  followUpQuestion?: string;

  /** Whether this was escalated to a more capable model */
  wasEscalated?: boolean;

  /** Raw response from AI (for debugging) */
  rawResponse?: string;
}

/**
 * Recent message in conversation history.
 */
export interface RecentMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Current pending state in conversation.
 */
export type PendingState =
  | 'idle'
  | 'awaiting_justification'
  | 'awaiting_shift_date'
  | 'awaiting_confirmation'
  | 'awaiting_image_tag';

/**
 * Context for conversation AI classification.
 */
export interface ConversationContext {
  /** Phone number of the user */
  phoneNumber: string;

  /** Current date (ISO string YYYY-MM-DD) */
  currentDate: string;

  /** Current Islamic time slot */
  currentSlot: IslamicTimeSlot;

  /** Current pending state */
  pendingState: PendingState;

  /** Reference for pending action (e.g., habit ID, task ID) */
  pendingReference?: string;

  /** Description of pending action */
  pendingAction?: string;

  /** List of active habit names for today */
  activeHabits: string[];

  /** List of task summaries for today (e.g., "1. Buy groceries (pending)") */
  todayTasks: string[];

  /** Recent conversation history */
  recentMessages: RecentMessage[];
}

/**
 * Interface for conversation AI services.
 */
export interface IConversationAiService {
  /**
   * Classify user message into intent with entity extraction.
   * @param message User's message text
   * @param context Conversation context
   * @returns Classification result
   */
  classify(message: string, context: ConversationContext): Promise<ClassifiedIntent>;

  /**
   * Resolve relative date expression to ISO date string.
   * @param expression Date expression (e.g., "بكرة", "tomorrow", "thursday")
   * @param referenceDate Reference date (ISO string)
   * @returns Resolved date (ISO string) or null if cannot resolve
   */
  resolveRelativeDate(expression: string, referenceDate: string): string | null;
}

export const CONVERSATION_AI_SERVICE = Symbol('CONVERSATION_AI_SERVICE');
