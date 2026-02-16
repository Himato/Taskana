import { ConversationContext, RecentMessage } from '../interfaces';

/**
 * Build the classification prompt with context.
 */
export function buildClassificationPrompt(message: string, context: ConversationContext): string {
  const parts: string[] = [];

  // Current state section
  parts.push('## Current Context');
  parts.push(`- Date: ${context.currentDate}`);
  parts.push(`- Current Time Slot: ${context.currentSlot}`);
  parts.push(`- Pending State: ${context.pendingState}`);

  if (context.pendingReference) {
    parts.push(`- Pending Reference: ${context.pendingReference}`);
  }

  if (context.pendingAction) {
    parts.push(`- Pending Action: ${context.pendingAction}`);
  }

  parts.push('');

  // Active habits section
  if (context.activeHabits.length > 0) {
    parts.push("## Today's Active Habits");
    context.activeHabits.forEach((habit, index) => {
      parts.push(`${index + 1}. ${habit}`);
    });
    parts.push('');
  } else {
    parts.push("## Today's Active Habits");
    parts.push('No active habits for today.');
    parts.push('');
  }

  // Today's tasks section
  if (context.todayTasks.length > 0) {
    parts.push("## Today's Tasks");
    context.todayTasks.forEach((task) => {
      parts.push(`- ${task}`);
    });
    parts.push('');
  } else {
    parts.push("## Today's Tasks");
    parts.push('No tasks for today.');
    parts.push('');
  }

  // Recent conversation section
  if (context.recentMessages.length > 0) {
    parts.push('## Recent Conversation');
    const recentMessages = context.recentMessages.slice(-5); // Last 5 messages
    recentMessages.forEach((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      parts.push(`${role}: ${msg.content}`);
    });
    parts.push('');
  }

  // Special instructions based on pending state
  if (context.pendingState !== 'idle') {
    parts.push('## Special Instructions');

    switch (context.pendingState) {
      case 'awaiting_justification':
        parts.push('The user is expected to provide a justification for skipping a habit/task.');
        parts.push(
          'Any text response should be treated as the justification (habit_skipped intent with justification entity).',
        );
        break;

      case 'awaiting_shift_date':
        parts.push('The user is expected to provide a date to shift a task to.');
        parts.push('Look for date expressions and treat as task_shift intent with the date.');
        break;

      case 'awaiting_confirmation':
        parts.push('The user is expected to confirm or reject the pending action.');
        parts.push(
          'Look for confirmation words (yes, ok, نعم, أيوه) or rejection words (no, لا, cancel).',
        );
        break;

      case 'awaiting_image_tag':
        parts.push('The user is expected to select a number to tag an image to a habit/task.');
        parts.push(
          'A number response should be treated as image_tag_response with selectedOption.',
        );
        break;
    }
    parts.push('');
  }

  // User message section
  parts.push('## User Message');
  parts.push(`"${message}"`);
  parts.push('');

  parts.push('Classify this message and extract entities. Respond with JSON only.');

  return parts.join('\n');
}

/**
 * Format recent messages for the prompt.
 */
export function formatRecentMessages(messages: RecentMessage[]): string {
  return messages
    .slice(-5)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
}
