import { Inject, Injectable, Logger } from '@nestjs/common';
import { addDays, format, nextDay, parse } from 'date-fns';
import OpenAI from 'openai';

import { IslamicTimeSlot, ISLAMIC_TIME_SLOTS } from '../../common/types/islamic-time-slot';
import {
  ClassifiedIntent,
  ConversationContext,
  ExtractedEntities,
  IConversationAiService,
  IntentType,
  INTENT_TYPES,
} from '../interfaces';
import { CONFIDENCE_THRESHOLDS, MODELS, OPENAI_CLIENT } from '../openai.constants';
import { buildClassificationPrompt, getSystemPrompt } from '../prompts';

/**
 * Raw response from GPT classification.
 */
interface RawClassificationResponse {
  intent: string;
  confidence: number;
  entities: Partial<ExtractedEntities>;
  followUpQuestion?: string;
}

/**
 * Conversation AI service using OpenAI GPT models.
 */
@Injectable()
export class ConversationAiService implements IConversationAiService {
  private readonly logger = new Logger(ConversationAiService.name);

  constructor(@Inject(OPENAI_CLIENT) private readonly openai: OpenAI) {}

  /**
   * Classify user message into intent with entity extraction.
   */
  async classify(message: string, context: ConversationContext): Promise<ClassifiedIntent> {
    try {
      // First attempt with fast model
      let result = await this.callClassificationModel(message, context, MODELS.FAST);

      // Escalate to more capable model if confidence is low
      if (result.confidence < CONFIDENCE_THRESHOLDS.ESCALATION && result.intent !== 'unclear') {
        this.logger.debug(
          `Escalating to ${MODELS.CAPABLE} due to low confidence (${result.confidence})`,
        );
        const escalatedResult = await this.callClassificationModel(
          message,
          context,
          MODELS.CAPABLE,
        );
        escalatedResult.wasEscalated = true;

        // Use escalated result if it's more confident
        if (escalatedResult.confidence > result.confidence) {
          result = escalatedResult;
        }
      }

      // Normalize entities
      result.entities = this.normalizeEntities(result.entities, context);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Classification failed: ${errorMessage}`);

      return {
        intent: 'unclear',
        confidence: 0,
        entities: {},
        followUpQuestion: 'عذراً، حدث خطأ. ممكن تعيد الرسالة؟',
      };
    }
  }

  /**
   * Call the classification model.
   */
  private async callClassificationModel(
    message: string,
    context: ConversationContext,
    model: string,
  ): Promise<ClassifiedIntent> {
    const systemPrompt = getSystemPrompt();
    const userPrompt = buildClassificationPrompt(message, context);

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content ?? '{}';

    try {
      const parsed = JSON.parse(content) as RawClassificationResponse;
      return this.parseClassificationResponse(parsed, content);
    } catch (parseError) {
      this.logger.warn(`Failed to parse classification response: ${content}`);
      return {
        intent: 'unclear',
        confidence: 0.3,
        entities: {},
        followUpQuestion: 'مش فاهم قصدك. ممكن توضح أكتر؟',
        rawResponse: content,
      };
    }
  }

  /**
   * Parse and validate the classification response.
   */
  private parseClassificationResponse(
    raw: RawClassificationResponse,
    rawContent: string,
  ): ClassifiedIntent {
    // Validate intent type
    const intent = this.normalizeIntent(raw.intent);

    // Clamp confidence to 0-1
    const confidence = Math.max(0, Math.min(1, raw.confidence ?? 0.5));

    return {
      intent,
      confidence,
      entities: raw.entities ?? {},
      followUpQuestion: raw.followUpQuestion,
      rawResponse: rawContent,
    };
  }

  /**
   * Normalize intent string to valid IntentType.
   */
  private normalizeIntent(intent: string): IntentType {
    const normalized = intent?.toLowerCase().trim() as IntentType;

    if (INTENT_TYPES.includes(normalized)) {
      return normalized;
    }

    // Handle common variations
    const intentMap: Record<string, IntentType> = {
      greet: 'greeting',
      hi: 'greeting',
      hello: 'greeting',
      done: 'habit_done',
      complete: 'task_complete',
      skip: 'habit_skipped',
      shift: 'task_shift',
      move: 'task_shift',
      create: 'task_create',
      add: 'task_create',
      new: 'task_create',
      delete: 'task_delete',
      remove: 'task_delete',
      list: 'task_list',
      tasks: 'task_list',
      summary: 'daily_summary',
      yes: 'confirmation',
      confirm: 'confirmation',
      no: 'rejection',
      cancel: 'rejection',
    };

    return intentMap[normalized] ?? 'unclear';
  }

  /**
   * Normalize extracted entities.
   */
  private normalizeEntities(
    entities: Partial<ExtractedEntities>,
    context: ConversationContext,
  ): ExtractedEntities {
    const normalized: ExtractedEntities = { ...entities };

    // Normalize time slot
    if (normalized.timeSlot) {
      normalized.timeSlot = this.normalizeTimeSlot(normalized.timeSlot);
    }

    // Resolve relative date if raw expression provided
    if (normalized.rawDateExpression && !normalized.targetDate) {
      const resolved = this.resolveRelativeDate(normalized.rawDateExpression, context.currentDate);
      if (resolved) {
        normalized.targetDate = resolved;
      }
    }

    // Normalize task ID
    if (normalized.taskId) {
      normalized.taskId = this.normalizeTaskId(normalized.taskId);
    }

    return normalized;
  }

  /**
   * Normalize time slot string to valid IslamicTimeSlot.
   */
  private normalizeTimeSlot(slot: string): IslamicTimeSlot | undefined {
    const normalized = slot.toLowerCase().trim().replace(/\s+/g, '_');

    if (ISLAMIC_TIME_SLOTS.includes(normalized as IslamicTimeSlot)) {
      return normalized as IslamicTimeSlot;
    }

    // Handle Arabic variations
    const slotMap: Record<string, IslamicTimeSlot> = {
      بعد_الفجر: 'after_fajr',
      بعد_فجر: 'after_fajr',
      الصبح: 'after_fajr',
      قبل_الظهر: 'before_dhuhr',
      قبل_الضهر: 'before_dhuhr',
      بعد_الظهر: 'after_dhuhr',
      بعد_الضهر: 'after_dhuhr',
      قبل_العصر: 'before_asr',
      بعد_العصر: 'after_asr',
      قبل_المغرب: 'before_maghrib',
      بعد_المغرب: 'after_maghrib',
      قبل_العشاء: 'before_isha',
      بعد_العشاء: 'after_isha',
    };

    return slotMap[normalized];
  }

  /**
   * Normalize task ID to consistent format.
   */
  private normalizeTaskId(taskId: string): string {
    // If it's just a number, keep it as is
    if (/^\d+$/.test(taskId)) {
      return taskId;
    }

    // If it's t-XXX format, normalize
    const match = taskId.match(/^t-?(\d+)$/i);
    if (match) {
      return `t-${match[1].padStart(3, '0')}`;
    }

    return taskId;
  }

  /**
   * Resolve relative date expression to ISO date string.
   */
  resolveRelativeDate(expression: string, referenceDate: string): string | null {
    const normalized = expression.toLowerCase().trim();
    const refDate = parse(referenceDate, 'yyyy-MM-dd', new Date());

    // Today
    if (['today', 'النهارده', 'النهاردة', 'اليوم'].includes(normalized)) {
      return referenceDate;
    }

    // Tomorrow
    if (['tomorrow', 'بكرة', 'بكره', 'غدا', 'غدًا'].includes(normalized)) {
      return format(addDays(refDate, 1), 'yyyy-MM-dd');
    }

    // Day after tomorrow
    if (['day after tomorrow', 'بعد بكره', 'بعد بكرة', 'بعد غد'].includes(normalized)) {
      return format(addDays(refDate, 2), 'yyyy-MM-dd');
    }

    // Yesterday (for reference, though shifting to past should be rejected)
    if (['yesterday', 'أمبارح', 'امبارح', 'أمس'].includes(normalized)) {
      return format(addDays(refDate, -1), 'yyyy-MM-dd');
    }

    // Day names in English
    const englishDays: Record<string, Day> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    // Day names in Arabic
    const arabicDays: Record<string, Day> = {
      الأحد: 0,
      أحد: 0,
      الإثنين: 1,
      اتنين: 1,
      الاثنين: 1,
      الثلاثاء: 2,
      تلات: 2,
      الأربعاء: 3,
      أربع: 3,
      اربع: 3,
      الخميس: 4,
      خميس: 4,
      الجمعة: 5,
      جمعة: 5,
      السبت: 6,
      سبت: 6,
    };

    type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

    // Check English day names
    const englishDay = englishDays[normalized];
    if (englishDay !== undefined) {
      return format(nextDay(refDate, englishDay), 'yyyy-MM-dd');
    }

    // Check Arabic day names
    const arabicDay = arabicDays[normalized];
    if (arabicDay !== undefined) {
      return format(nextDay(refDate, arabicDay), 'yyyy-MM-dd');
    }

    // Try to parse as date (YYYY-MM-DD or DD/MM/YYYY)
    const dateFormats = ['yyyy-MM-dd', 'dd/MM/yyyy', 'dd-MM-yyyy', 'MM/dd/yyyy'];
    for (const fmt of dateFormats) {
      try {
        const parsed = parse(normalized, fmt, new Date());
        if (!isNaN(parsed.getTime())) {
          return format(parsed, 'yyyy-MM-dd');
        }
      } catch {
        // Continue to next format
      }
    }

    return null;
  }
}
