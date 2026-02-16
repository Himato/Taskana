import { Inject, Injectable, Logger } from '@nestjs/common';
import { format } from 'date-fns';

import { AR } from '../../common/messages/ar';
import { DAYS_OF_WEEK, DayOfWeek, IslamicTimeSlot } from '../../common/types/islamic-time-slot';
import { HabitService } from '../../habit/habit.service';
import { IMessagingService } from '../../messaging/interfaces';
import { MESSAGING_SERVICE } from '../../messaging/messaging.constants';
import {
  ClassifiedIntent,
  ConversationContext,
  ExtractedEntities,
  IConversationAiService,
  IntentType,
  CONVERSATION_AI_SERVICE,
} from '../../openai/interfaces';
import { ISttService, STT_SERVICE } from '../../openai/interfaces/stt-service.interface';
import { PersistenceService } from '../../persistence/persistence.service';
import { PrayerTimeService } from '../../prayer-time/prayer-time.service';

import { StateService } from './state.service';

/**
 * Intent handler function signature.
 */
type IntentHandler = (
  phoneNumber: string,
  classified: ClassifiedIntent,
  context: ConversationContext,
) => Promise<string>;

/**
 * Core conversation router and intent execution service.
 * Handles all incoming messages, classifies intents, and dispatches to handlers.
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  /** Confidence thresholds */
  private readonly CONFIDENCE_LOW = 0.3;
  private readonly CONFIDENCE_MEDIUM = 0.6;
  private readonly CONFIDENCE_HIGH = 0.85;

  /** Intent handler dispatch map */
  private readonly handlers: Map<IntentType, IntentHandler>;

  constructor(
    @Inject(MESSAGING_SERVICE) private readonly messaging: IMessagingService,
    @Inject(STT_SERVICE) private readonly sttService: ISttService,
    @Inject(CONVERSATION_AI_SERVICE) private readonly aiService: IConversationAiService,
    private readonly stateService: StateService,
    private readonly habitService: HabitService,
    private readonly persistenceService: PersistenceService,
    private readonly prayerTimeService: PrayerTimeService,
  ) {
    this.handlers = this.buildHandlerMap();
  }

  /**
   * Handle incoming text message.
   */
  async handleText(phoneNumber: string, text: string): Promise<void> {
    this.logger.debug(`Handling text from ${phoneNumber}: "${text.slice(0, 50)}..."`);

    try {
      // Record user message
      this.stateService.addMessage(phoneNumber, 'user', text);

      // Build context
      const context = await this.buildContext(phoneNumber);

      // Classify intent
      const classified = await this.aiService.classify(text, context);
      this.logger.debug(
        `Classified as ${classified.intent} (confidence: ${classified.confidence.toFixed(2)})`,
      );

      // Handle based on confidence
      let response: string;

      if (classified.confidence < this.CONFIDENCE_LOW) {
        // Very low confidence - send help
        response = AR.UNKNOWN_INTENT;
      } else if (
        classified.confidence < this.CONFIDENCE_MEDIUM &&
        this.requiresConfirmation(classified.intent)
      ) {
        // Medium confidence on action intents - request confirmation
        response = await this.requestConfirmation(phoneNumber, classified);
      } else {
        // High enough confidence - execute handler
        response = await this.executeHandler(phoneNumber, classified, context);
      }

      // Send response
      await this.messaging.sendText(phoneNumber, response);
      this.stateService.addMessage(phoneNumber, 'assistant', response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling text: ${message}`);
      await this.messaging.sendText(phoneNumber, AR.ERROR_GENERIC);
    }
  }

  /**
   * Handle incoming audio message.
   */
  async handleAudio(phoneNumber: string, mediaHandle: unknown, duration: number): Promise<void> {
    this.logger.debug(`Handling audio from ${phoneNumber}: ${duration}s`);

    try {
      // Download audio - mediaHandle contains the raw WAMessage needed for download
      const audioBuffer = await this.messaging.downloadMedia({
        type: 'audio',
        mediaHandle,
        duration,
        mimeType: 'audio/ogg',
        isPtt: true,
        id: '',
        from: phoneNumber,
        fromNumber: phoneNumber,
        timestamp: Date.now(),
        raw: mediaHandle,
      });

      // Transcribe
      const result = await this.sttService.transcribe(audioBuffer);

      if (!result.success || !result.text) {
        this.logger.warn(`Transcription failed for ${phoneNumber}: ${result.error}`);
        await this.messaging.sendText(phoneNumber, AR.TRANSCRIPTION_FAILED);
        return;
      }

      this.logger.debug(
        `Transcribed audio: "${result.text.slice(0, 50)}..." (confidence: ${result.confidence.toFixed(2)})`,
      );

      // Re-enter as text
      await this.handleText(phoneNumber, result.text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling audio: ${message}`);
      await this.messaging.sendText(phoneNumber, AR.TRANSCRIPTION_FAILED);
    }
  }

  /**
   * Handle button response.
   */
  async handleButtonResponse(
    phoneNumber: string,
    buttonId: string,
    buttonText: string,
  ): Promise<void> {
    this.logger.debug(`Button response from ${phoneNumber}: ${buttonId} (${buttonText})`);

    // Map button ID to text and re-enter
    await this.handleText(phoneNumber, buttonText);
  }

  /**
   * Build conversation context for AI classification.
   */
  async buildContext(phoneNumber: string): Promise<ConversationContext> {
    const state = this.stateService.getState(phoneNumber);
    const today = new Date();
    const dateStr = format(today, 'yyyy-MM-dd');
    const dayOfWeek = this.getDayOfWeek(today);
    const currentSlot = this.prayerTimeService.getCurrentSlot(today);

    // Get today's active habits
    const todayHabits = this.habitService.getForDay(dayOfWeek);
    const activeHabits = todayHabits.map((h) => h.name);

    // Get today's tasks
    const dayLog = await this.persistenceService.getDay(dateStr);
    const todayTasks = dayLog.tasks
      .filter((t) => t.status !== 'shifted')
      .map((t, i) => `${i + 1}. ${t.title} (${t.status})`);

    return {
      phoneNumber,
      currentDate: dateStr,
      currentSlot,
      pendingState: state.pendingState,
      pendingReference: state.pendingReference,
      pendingAction: state.pendingAction,
      activeHabits,
      todayTasks,
      recentMessages: state.recentMessages,
    };
  }

  /**
   * Build the handler dispatch map.
   */
  private buildHandlerMap(): Map<IntentType, IntentHandler> {
    const map = new Map<IntentType, IntentHandler>();

    // Greetings & Help
    map.set('greeting', this.handleGreeting.bind(this));
    map.set('help', this.handleHelp.bind(this));

    // Habit operations
    map.set('habit_done', this.handleHabitDone.bind(this));
    map.set('habit_skipped', this.handleHabitSkipped.bind(this));
    map.set('habit_list', this.handleHabitList.bind(this));
    map.set('habit_status', this.handleHabitList.bind(this));

    // Task operations (stubs for Phase 6)
    map.set('task_create', this.handleNotImplemented.bind(this));
    map.set('task_complete', this.handleNotImplemented.bind(this));
    map.set('task_skip', this.handleNotImplemented.bind(this));
    map.set('task_shift', this.handleNotImplemented.bind(this));
    map.set('task_update', this.handleNotImplemented.bind(this));
    map.set('task_delete', this.handleNotImplemented.bind(this));
    map.set('task_list', this.handleDailySummary.bind(this));

    // Summaries
    map.set('daily_summary', this.handleDailySummary.bind(this));
    map.set('weekly_summary', this.handleNotImplemented.bind(this));

    // Conversation flow
    map.set('confirmation', this.handleConfirmation.bind(this));
    map.set('rejection', this.handleRejection.bind(this));
    map.set('image_tag_response', this.handleNotImplemented.bind(this));

    // Fallback
    map.set('unclear', this.handleUnclear.bind(this));

    return map;
  }

  /**
   * Execute the appropriate handler for a classified intent.
   */
  private async executeHandler(
    phoneNumber: string,
    classified: ClassifiedIntent,
    context: ConversationContext,
  ): Promise<string> {
    const handler = this.handlers.get(classified.intent);

    if (!handler) {
      this.logger.warn(`No handler for intent: ${classified.intent}`);
      return AR.UNKNOWN_INTENT;
    }

    return handler(phoneNumber, classified, context);
  }

  /**
   * Check if an intent requires confirmation at medium confidence.
   */
  private requiresConfirmation(intent: IntentType): boolean {
    // Action intents that modify data
    const actionIntents: IntentType[] = [
      'habit_done',
      'habit_skipped',
      'task_create',
      'task_complete',
      'task_skip',
      'task_shift',
      'task_update',
      'task_delete',
    ];
    return actionIntents.includes(intent);
  }

  /**
   * Request confirmation for a medium-confidence action.
   */
  private async requestConfirmation(
    phoneNumber: string,
    classified: ClassifiedIntent,
  ): Promise<string> {
    // Build action description
    const actionDescription = this.describeAction(classified);

    // Set pending state
    this.stateService.setState(phoneNumber, {
      pendingState: 'awaiting_confirmation',
      pendingReference: JSON.stringify(classified),
      pendingAction: actionDescription,
    });

    return AR.CONFIRMATION_PROMPT(actionDescription);
  }

  /**
   * Describe an action for confirmation prompt.
   */
  private describeAction(classified: ClassifiedIntent): string {
    const { intent, entities } = classified;

    switch (intent) {
      case 'habit_done':
        return `تسجيل إتمام ${entities.habitId || 'العادة'}`;
      case 'habit_skipped':
        return `تخطي ${entities.habitId || 'العادة'}`;
      case 'task_create':
        return `إضافة مهمة "${entities.taskTitle || ''}"`;
      case 'task_complete':
        return `إنهاء المهمة ${entities.taskId || ''}`;
      case 'task_skip':
        return `تخطي المهمة ${entities.taskId || ''}`;
      case 'task_shift':
        return `نقل المهمة ${entities.taskId || ''} لـ ${entities.targetDate || entities.rawDateExpression || ''}`;
      case 'task_delete':
        return `حذف المهمة ${entities.taskId || ''}`;
      default:
        return intent;
    }
  }

  // ────────────────────────────────────────────────────────────
  // Intent Handlers
  // ────────────────────────────────────────────────────────────

  private async handleGreeting(): Promise<string> {
    return AR.GREETING;
  }

  private async handleHelp(): Promise<string> {
    return AR.HELP;
  }

  private async handleUnclear(_phoneNumber: string, classified: ClassifiedIntent): Promise<string> {
    if (classified.followUpQuestion) {
      return classified.followUpQuestion;
    }
    return AR.UNKNOWN_INTENT;
  }

  private async handleConfirmation(
    phoneNumber: string,
    _classified: ClassifiedIntent,
    context: ConversationContext,
  ): Promise<string> {
    const state = this.stateService.getState(phoneNumber);

    if (state.pendingState !== 'awaiting_confirmation' || !state.pendingReference) {
      // No pending action
      return AR.UNKNOWN_INTENT;
    }

    try {
      // Parse stored classified intent
      const pendingClassified = JSON.parse(state.pendingReference) as ClassifiedIntent;

      // Clear pending state first
      this.stateService.clearPendingState(phoneNumber);

      // Execute the pending action
      return this.executeHandler(phoneNumber, pendingClassified, context);
    } catch {
      this.stateService.clearPendingState(phoneNumber);
      return AR.ERROR_GENERIC;
    }
  }

  private async handleRejection(phoneNumber: string): Promise<string> {
    const state = this.stateService.getState(phoneNumber);

    if (state.pendingState !== 'idle') {
      this.stateService.clearPendingState(phoneNumber);
      return 'تم إلغاء العملية.';
    }

    return AR.UNKNOWN_INTENT;
  }

  private async handleHabitDone(
    phoneNumber: string,
    classified: ClassifiedIntent,
    context: ConversationContext,
  ): Promise<string> {
    const { entities } = classified;

    // Resolve habit ID
    const habitId = await this.resolveHabitId(entities, context);
    if (!habitId) {
      return 'مش قادر أحدد العادة اللي تقصدها. ممكن توضح أكتر؟';
    }

    const habit = this.habitService.getById(habitId);
    if (!habit) {
      return `العادة "${habitId}" مش موجودة.`;
    }

    // Update status
    await this.persistenceService.updateHabitStatus(context.currentDate, habitId, 'done');

    return AR.HABIT_DONE(habit.name);
  }

  private async handleHabitSkipped(
    phoneNumber: string,
    classified: ClassifiedIntent,
    context: ConversationContext,
  ): Promise<string> {
    const { entities } = classified;

    // Resolve habit ID
    const habitId = await this.resolveHabitId(entities, context);
    if (!habitId) {
      return 'مش قادر أحدد العادة اللي تقصدها. ممكن توضح أكتر؟';
    }

    const habit = this.habitService.getById(habitId);
    if (!habit) {
      return `العادة "${habitId}" مش موجودة.`;
    }

    // Check if justification is required
    if (habit.requiresJustification && !entities.justification) {
      // Ask for justification
      this.stateService.setState(phoneNumber, {
        pendingState: 'awaiting_justification',
        pendingReference: habitId,
        pendingAction: `تخطي ${habit.name}`,
      });

      return AR.HABIT_ASK_JUSTIFICATION;
    }

    // Update status with justification if provided
    await this.persistenceService.updateHabitStatus(
      context.currentDate,
      habitId,
      'skipped',
      entities.justification,
    );

    return AR.HABIT_SKIPPED(habit.name);
  }

  private async handleHabitList(
    _phoneNumber: string,
    _classified: ClassifiedIntent,
    context: ConversationContext,
  ): Promise<string> {
    const dayOfWeek = this.getDayOfWeek(new Date());
    const habits = this.habitService.getForDay(dayOfWeek);

    if (habits.length === 0) {
      return 'مفيش عادات مجدولة النهارده.';
    }

    // Get today's habit statuses
    const dayLog = await this.persistenceService.getDay(context.currentDate);

    const lines: string[] = ['*عادات النهارده:*\n'];

    for (const habit of habits) {
      const entry = dayLog.habits.find((h) => h.habitId === habit.id);
      const status = entry?.status ?? 'pending';
      const emoji = this.getStatusEmoji(status);
      const slotName = this.getSlotName(habit.schedule.islamicTimeSlot);

      lines.push(`${emoji} *${habit.name}* — ${slotName}`);
    }

    return lines.join('\n');
  }

  private async handleDailySummary(
    _phoneNumber: string,
    _classified: ClassifiedIntent,
    context: ConversationContext,
  ): Promise<string> {
    const dayLog = await this.persistenceService.getDay(context.currentDate);
    const dayOfWeek = this.getDayOfWeek(new Date());
    const habits = this.habitService.getForDay(dayOfWeek);

    const lines: string[] = [`*ملخص يوم ${context.currentDate}:*\n`];

    // Habits section
    if (habits.length > 0) {
      lines.push('*العادات:*');
      for (const habit of habits) {
        const entry = dayLog.habits.find((h) => h.habitId === habit.id);
        const status = entry?.status ?? 'pending';
        const emoji = this.getStatusEmoji(status);
        lines.push(`${emoji} ${habit.name}`);
      }
      lines.push('');
    }

    // Tasks section - group by time slot
    const tasks = dayLog.tasks.filter((t) => t.status !== 'shifted');
    if (tasks.length > 0) {
      lines.push('*المهام:*');

      // Group by slot
      const bySlot = new Map<IslamicTimeSlot, typeof tasks>();
      for (const task of tasks) {
        const slot = task.islamicTimeSlot;
        if (!bySlot.has(slot)) {
          bySlot.set(slot, []);
        }
        bySlot.get(slot)!.push(task);
      }

      // Output in slot order
      const slotOrder: IslamicTimeSlot[] = [
        'after_fajr',
        'before_dhuhr',
        'after_dhuhr',
        'before_asr',
        'after_asr',
        'before_maghrib',
        'after_maghrib',
        'before_isha',
        'after_isha',
      ];

      for (const slot of slotOrder) {
        const slotTasks = bySlot.get(slot);
        if (slotTasks && slotTasks.length > 0) {
          lines.push(`\n_${this.getSlotName(slot)}:_`);
          for (const task of slotTasks) {
            const emoji = this.getStatusEmoji(task.status);
            const idNum = task.id.replace('t-', '');
            lines.push(`${emoji} ${idNum}. ${task.title}`);
          }
        }
      }
    } else if (habits.length === 0) {
      lines.push('مفيش عادات أو مهام النهارده.');
    }

    return lines.join('\n');
  }

  private async handleNotImplemented(): Promise<string> {
    return 'هذه الميزة لسه قيد التطوير. جاي قريب!';
  }

  // ────────────────────────────────────────────────────────────
  // Helper Methods
  // ────────────────────────────────────────────────────────────

  /**
   * Handle special pending states.
   */
  async handlePendingState(
    phoneNumber: string,
    text: string,
    context: ConversationContext,
  ): Promise<string | null> {
    const state = this.stateService.getState(phoneNumber);

    if (state.pendingState === 'awaiting_justification' && state.pendingReference) {
      // The text is the justification
      const habitId = state.pendingReference;
      const habit = this.habitService.getById(habitId);

      await this.persistenceService.updateHabitStatus(
        context.currentDate,
        habitId,
        'skipped',
        text,
      );

      this.stateService.clearPendingState(phoneNumber);
      return AR.HABIT_SKIPPED(habit?.name ?? habitId);
    }

    if (state.pendingState === 'awaiting_shift_date' && state.pendingReference) {
      // The text is the target date expression
      const resolved = this.aiService.resolveRelativeDate(text, context.currentDate);
      if (!resolved) {
        return 'مش فاهم التاريخ ده. ممكن تقول بكرة، أو الخميس، أو تاريخ معين؟';
      }

      // TODO: Execute shift in Phase 6
      this.stateService.clearPendingState(phoneNumber);
      return `تم نقل المهمة لـ ${resolved}.`;
    }

    return null;
  }

  /**
   * Resolve habit ID from entities or context.
   */
  private async resolveHabitId(
    entities: ExtractedEntities,
    context: ConversationContext,
  ): Promise<string | null> {
    // Direct habit ID
    if (entities.habitId) {
      return entities.habitId;
    }

    // If only one habit active, assume that's the one
    if (context.activeHabits.length === 1) {
      const habits = this.habitService.getAll();
      const match = habits.find((h) => h.name === context.activeHabits[0]);
      return match?.id ?? null;
    }

    // Try to match by current time slot
    const currentSlot = context.currentSlot;
    const slotHabits = this.habitService.getByTimeSlot(currentSlot);
    if (slotHabits.length === 1) {
      return slotHabits[0].id;
    }

    return null;
  }

  /**
   * Get status emoji.
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'done':
        return AR.STATUS_DONE;
      case 'skipped':
        return AR.STATUS_SKIPPED;
      case 'shifted':
        return AR.STATUS_SHIFTED;
      default:
        return AR.STATUS_PENDING;
    }
  }

  /**
   * Get Arabic slot name.
   */
  private getSlotName(slot: IslamicTimeSlot): string {
    const names: Record<IslamicTimeSlot, string> = {
      after_fajr: AR.TIME_SLOT_AFTER_FAJR,
      before_dhuhr: AR.TIME_SLOT_BEFORE_DHUHR,
      after_dhuhr: AR.TIME_SLOT_AFTER_DHUHR,
      before_asr: AR.TIME_SLOT_BEFORE_ASR,
      after_asr: AR.TIME_SLOT_AFTER_ASR,
      before_maghrib: AR.TIME_SLOT_BEFORE_MAGHRIB,
      after_maghrib: AR.TIME_SLOT_AFTER_MAGHRIB,
      before_isha: AR.TIME_SLOT_BEFORE_ISHA,
      after_isha: AR.TIME_SLOT_AFTER_ISHA,
    };
    return names[slot];
  }

  /**
   * Convert Date to DayOfWeek.
   */
  private getDayOfWeek(date: Date): DayOfWeek {
    // getDay() returns 0=Sunday, 1=Monday, etc.
    // DAYS_OF_WEEK is ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    return DAYS_OF_WEEK[date.getDay()];
  }
}
