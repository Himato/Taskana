/**
 * Injection token for OpenAI client.
 */
export const OPENAI_CLIENT = Symbol('OPENAI_CLIENT');

/**
 * Model names.
 */
export const MODELS = {
  /** Fast, cheap model for most classifications */
  FAST: 'gpt-4o-mini',

  /** More capable model for complex/ambiguous cases */
  CAPABLE: 'gpt-4o',

  /** Speech-to-text model */
  WHISPER: 'whisper-1',
} as const;

/**
 * Confidence thresholds.
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Below this, ask for confirmation */
  CONFIRMATION_REQUIRED: 0.85,

  /** Below this, escalate to more capable model */
  ESCALATION: 0.6,

  /** Below this, respond with "unclear" */
  TOO_LOW: 0.3,
} as const;
