# OpenAI Integration — Whisper & Conversation Intelligence

## 1. Overview

This document details the design for integrating OpenAI services into the WhatsApp Habits & Tasks Manager. Two primary capabilities are covered:

1. **Whisper STT** — Transcribe voice notes into text for seamless audio-based interaction.
2. **GPT-powered Conversation Engine** — Replace naive keyword matching with a structured, high-accuracy intent classification and entity extraction system that understands natural Arabic/English mixed input.

---

## 2. Module Structure

```
src/
├── openai/
│   ├── openai.module.ts              # NestJS module, registers providers
│   ├── openai-client.provider.ts     # Factory provider for OpenAI SDK client
│   ├── whisper/
│   │   ├── whisper.service.ts        # Audio transcription service
│   │   └── whisper.interface.ts      # STT abstraction interface
│   └── conversation-ai/
│       ├── conversation-ai.service.ts       # GPT intent + entity extraction
│       ├── conversation-ai.interface.ts     # Abstraction interface
│       ├── prompts/
│       │   ├── system-prompt.ts             # Master system prompt
│       │   ├── intent-classification.ts     # Intent-specific prompt fragment
│       │   └── entity-extraction.ts         # Entity-specific prompt fragment
│       └── dto/
│           ├── classified-intent.dto.ts     # Output shape from classification
│           └── conversation-context.dto.ts  # Context passed into each call
```

---

## 3. OpenAI Client Provider

A single shared OpenAI SDK instance injected throughout the app.

```typescript
// openai-client.provider.ts
import { Provider } from '@nestjs/common';
import OpenAI from 'openai';

export const OPENAI_CLIENT = Symbol('OPENAI_CLIENT');

export const openaiClientProvider: Provider = {
  provide: OPENAI_CLIENT,
  useFactory: () => {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30_000,
      maxRetries: 2,
    });
  },
};
```

```typescript
// openai.module.ts
import { Global, Module } from '@nestjs/common';
import { openaiClientProvider, OPENAI_CLIENT } from './openai-client.provider';
import { WhisperService } from './whisper/whisper.service';
import { ConversationAiService } from './conversation-ai/conversation-ai.service';

@Global()
@Module({
  providers: [openaiClientProvider, WhisperService, ConversationAiService],
  exports: [OPENAI_CLIENT, WhisperService, ConversationAiService],
})
export class OpenAiModule {}
```

---

## 4. Whisper Integration

### 4.1 STT Abstraction

```typescript
// whisper.interface.ts
export interface ISttService {
  /**
   * Transcribe an audio buffer to text.
   * @param audio   Raw audio bytes (ogg/opus from WhatsApp)
   * @param lang    BCP-47 hint, e.g. "ar", "en", "ar-EG"
   * @returns       Transcribed text
   */
  transcribe(audio: Buffer, lang?: string): Promise<SttResult>;
}

export interface SttResult {
  text: string;
  detectedLanguage: string;
  durationSeconds: number;
  confidence: number;          // 0-1 average log-prob mapped
}
```

### 4.2 Whisper Service Implementation

```typescript
// whisper.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OPENAI_CLIENT } from '../openai-client.provider';
import OpenAI, { toFile } from 'openai';
import { ISttService, SttResult } from './whisper.interface';

@Injectable()
export class WhisperService implements ISttService {
  private readonly logger = new Logger(WhisperService.name);

  constructor(@Inject(OPENAI_CLIENT) private readonly openai: OpenAI) {}

  async transcribe(audio: Buffer, lang?: string): Promise<SttResult> {
    const file = await toFile(audio, 'voice.ogg', { type: 'audio/ogg' });

    const response = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: lang,
      response_format: 'verbose_json',
      temperature: 0.0,            // deterministic
    });

    this.logger.debug(`Transcribed ${response.duration}s → "${response.text}"`);

    return {
      text: response.text,
      detectedLanguage: response.language,
      durationSeconds: response.duration,
      confidence: this.mapAvgLogProb(response.segments),
    };
  }

  private mapAvgLogProb(segments: any[]): number {
    if (!segments?.length) return 0;
    const avg = segments.reduce((sum, s) => sum + s.avg_logprob, 0) / segments.length;
    return Math.max(0, Math.min(1, 1 + avg));   // logprob is negative; map to 0-1
  }
}
```

### 4.3 Audio Pipeline Flow

```
WhatsApp voice note (ogg/opus)
      │
      ▼
MessagingService downloads media buffer
      │
      ▼
WhisperService.transcribe(buffer, "ar")
      │
      ├── success → ConversationService.handleText(transcribedText, context)
      │
      └── failure / empty text
              │
              └── Reply: "لم أتمكن من فهم الرسالة الصوتية، حاول مرة أخرى أو أرسل نصاً"
                  ("Couldn't understand the voice note, try again or send text")
```

### 4.4 Configuration

```env
# Whisper
STT_PROVIDER=whisper-api            # whisper-api | whisper-local (future)
WHISPER_DEFAULT_LANG=ar             # default language hint
WHISPER_MAX_AUDIO_SIZE_MB=25        # OpenAI limit
```

---

## 5. Conversation AI — Intent Classification & Entity Extraction

### 5.1 Design Philosophy

Instead of fragile regex/keyword matching, every incoming text message (including transcribed audio) is sent to GPT with a structured prompt that returns a **typed JSON** response. This gives us:

- Bilingual support (Arabic + English, mixed code-switching).
- Fuzzy understanding ("بكرة" = tomorrow, "بعد الظهر" = after dhuhr).
- Single-call classification + extraction (intent + entities in one request).
- Graceful ambiguity handling with follow-up questions.

### 5.2 Abstraction Interface

```typescript
// conversation-ai.interface.ts

export interface IConversationAiService {
  /**
   * Classify the user's intent and extract structured entities
   * from a single message, given the current conversation context.
   */
  classify(
    message: string,
    context: ConversationContext,
  ): Promise<ClassifiedIntent>;
}

// --- Output DTOs ---

export type IntentType =
  // Task intents
  | 'task_create'
  | 'task_update'
  | 'task_complete'
  | 'task_skip'
  | 'task_shift'
  | 'task_delete'
  | 'task_list'
  // Habit intents
  | 'habit_done'
  | 'habit_skipped'
  | 'habit_list'
  | 'habit_status'
  // Query intents
  | 'daily_summary'
  | 'weekly_summary'
  // Image intents
  | 'image_tag_response'
  // Conversation management
  | 'greeting'
  | 'help'
  | 'unclear'
  | 'confirmation'
  | 'rejection';

export interface ClassifiedIntent {
  intent: IntentType;
  confidence: number;             // 0-1
  entities: ExtractedEntities;
  followUpQuestion?: string;      // if the AI needs clarification
  reasoning?: string;             // chain-of-thought (debug only)
}

export interface ExtractedEntities {
  // Task-related
  taskTitle?: string;
  taskId?: string;                // "task 3" → "3"
  taskDescription?: string;

  // Scheduling
  islamicTimeSlot?: string;       // normalized: after_fajr, before_dhuhr, etc.
  targetDate?: string;            // ISO date, resolved from "tomorrow", "thursday", "بكرة"
  relativeDay?: string;           // raw: "tomorrow", "بكرة", "thursday"

  // Status
  newStatus?: 'done' | 'skipped' | 'shifted';
  justification?: string;         // reason for skipping/shifting

  // Habit-related
  habitId?: string;
  habitName?: string;

  // Image
  selectedOption?: number;        // choice index when tagging an image

  // General
  rawNumbers?: number[];          // any numbers mentioned
}

export interface ConversationContext {
  /** What the system is currently waiting for */
  pendingState?:
    | 'awaiting_justification'
    | 'awaiting_image_tag'
    | 'awaiting_confirmation'
    | 'awaiting_task_selection'
    | null;

  /** The habit/task the pending state relates to */
  pendingReference?: {
    type: 'habit' | 'task';
    id: string;
    name: string;
  };

  /** Last few messages for context continuity */
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;

  /** Today's habits and tasks (names + IDs) for grounding */
  todayHabits: Array<{ id: string; name: string; status: string }>;
  todayTasks: Array<{ id: string; title: string; status: string; islamicTimeSlot: string }>;

  /** Current date and next prayer info for temporal grounding */
  currentDate: string;
  currentIslamicSlot: string;
  prayerTimes: Record<string, string>;
}
```

### 5.3 System Prompt Design

```typescript
// prompts/system-prompt.ts

export const SYSTEM_PROMPT = `
You are the intent classification engine for a WhatsApp-based Islamic habit and task manager.
Your job is to analyze the user's message and return a SINGLE structured JSON response.

## Your Capabilities
You understand Arabic, English, and mixed Arabic-English (code-switching common in Egypt/MENA).
You resolve relative dates and Islamic time references to concrete values.

## Islamic Time Slots (ordered)
- after_fajr      → from Fajr adhan until sunrise
- before_dhuhr    → from sunrise until Dhuhr adhan
- after_dhuhr     → from Dhuhr adhan until Asr adhan
- before_asr      → 30 min before Asr adhan (overlaps after_dhuhr)
- after_asr       → from Asr adhan until Maghrib adhan
- before_maghrib  → 30 min before Maghrib adhan (overlaps after_asr)
- after_maghrib   → from Maghrib adhan until Isha adhan
- before_isha     → 30 min before Isha adhan (overlaps after_maghrib)
- after_isha      → from Isha adhan until midnight

## Arabic Time Mappings
- "الصبح" / "الفجر" → fajr
- "الضهر" / "الظهر" → dhuhr
- "العصر" → asr
- "المغرب" → maghrib
- "العشا" / "العشاء" → isha
- "بعد" → after_, "قبل" → before_
- "بكرة" / "بكره" → tomorrow
- "النهارده" / "النهاردة" → today
- "بعد بكرة" → day after tomorrow

## Response Rules
1. ALWAYS return valid JSON matching the ClassifiedIntent schema.
2. Set confidence between 0.0 and 1.0.
3. If the message is ambiguous, set intent to "unclear" and provide a followUpQuestion in the SAME language the user wrote in.
4. When the user is replying to a pending state (e.g., awaiting_justification), interpret their message in THAT context first.
5. Resolve "task 3", "task #3", "رقم ٣", "٣" to the correct task from the provided task list.
6. Resolve relative dates to ISO format using the provided currentDate.
7. Always normalize Islamic time slots to the enum values above.
`.trim();
```

```typescript
// prompts/intent-classification.ts

export function buildClassificationPrompt(
  message: string,
  context: ConversationContext,
): string {
  return `
## Current State
- Date: ${context.currentDate}
- Current Islamic slot: ${context.currentIslamicSlot}
- Prayer times today: ${JSON.stringify(context.prayerTimes)}
- Pending state: ${context.pendingState ?? 'none'}
${context.pendingReference ? `- Pending reference: ${context.pendingReference.type} "${context.pendingReference.name}" (${context.pendingReference.id})` : ''}

## Today's Habits
${context.todayHabits.map((h) => `- [${h.id}] ${h.name} (${h.status})`).join('\n') || '(none)'}

## Today's Tasks
${context.todayTasks.map((t) => `- [${t.id}] ${t.title} — ${t.islamicTimeSlot} (${t.status})`).join('\n') || '(none)'}

## Recent Conversation
${context.recentMessages.slice(-6).map((m) => `${m.role}: ${m.content}`).join('\n') || '(start of conversation)'}

## User Message
"${message}"

## Instructions
Classify the intent and extract entities. Return ONLY valid JSON matching this schema:
{
  "intent": "<IntentType>",
  "confidence": <0.0-1.0>,
  "entities": { ... },
  "followUpQuestion": "<string or null>",
  "reasoning": "<brief chain-of-thought>"
}
`.trim();
}
```

### 5.4 Service Implementation

```typescript
// conversation-ai.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OPENAI_CLIENT } from '../openai-client.provider';
import OpenAI from 'openai';
import {
  IConversationAiService,
  ClassifiedIntent,
  ConversationContext,
} from './conversation-ai.interface';
import { SYSTEM_PROMPT } from './prompts/system-prompt';
import { buildClassificationPrompt } from './prompts/intent-classification';

@Injectable()
export class ConversationAiService implements IConversationAiService {
  private readonly logger = new Logger(ConversationAiService.name);

  // Model config — centralised for easy tuning
  private readonly MODEL = 'gpt-4o-mini';       // cost-efficient, fast, strong multilingual
  private readonly TEMPERATURE = 0.1;            // near-deterministic
  private readonly MAX_TOKENS = 512;             // JSON responses are compact
  private readonly FALLBACK_MODEL = 'gpt-4o';   // escalate on low confidence

  constructor(@Inject(OPENAI_CLIENT) private readonly openai: OpenAI) {}

  async classify(
    message: string,
    context: ConversationContext,
  ): Promise<ClassifiedIntent> {
    const userPrompt = buildClassificationPrompt(message, context);

    let result = await this.callModel(this.MODEL, userPrompt);

    // Escalation: if primary model is uncertain, retry with stronger model
    if (result.confidence < 0.6 && result.intent !== 'greeting') {
      this.logger.warn(
        `Low confidence (${result.confidence}) for "${message}", escalating to ${this.FALLBACK_MODEL}`,
      );
      result = await this.callModel(this.FALLBACK_MODEL, userPrompt);
    }

    // Post-processing: validate and normalize entities
    result.entities = this.normalizeEntities(result.entities, context);

    return result;
  }

  private async callModel(
    model: string,
    userPrompt: string,
  ): Promise<ClassifiedIntent> {
    try {
      const response = await this.openai.chat.completions.create({
        model,
        temperature: this.TEMPERATURE,
        max_tokens: this.MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as ClassifiedIntent;

      this.logger.debug(
        `[${model}] intent=${parsed.intent} conf=${parsed.confidence} reasoning="${parsed.reasoning}"`,
      );

      return this.validateResponse(parsed);
    } catch (error) {
      this.logger.error(`Model call failed (${model}): ${error.message}`);
      return {
        intent: 'unclear',
        confidence: 0,
        entities: {},
        followUpQuestion: 'عذراً، حدث خطأ. حاول مرة أخرى.',
      };
    }
  }

  private validateResponse(raw: any): ClassifiedIntent {
    const VALID_INTENTS = new Set([
      'task_create', 'task_update', 'task_complete', 'task_skip',
      'task_shift', 'task_delete', 'task_list',
      'habit_done', 'habit_skipped', 'habit_list', 'habit_status',
      'daily_summary', 'weekly_summary',
      'image_tag_response',
      'greeting', 'help', 'unclear', 'confirmation', 'rejection',
    ]);

    return {
      intent: VALID_INTENTS.has(raw.intent) ? raw.intent : 'unclear',
      confidence: typeof raw.confidence === 'number'
        ? Math.max(0, Math.min(1, raw.confidence))
        : 0,
      entities: raw.entities ?? {},
      followUpQuestion: raw.followUpQuestion ?? undefined,
      reasoning: raw.reasoning ?? undefined,
    };
  }

  private normalizeEntities(
    entities: any,
    context: ConversationContext,
  ): any {
    const normalized = { ...entities };

    // Resolve relative dates
    if (normalized.relativeDay && !normalized.targetDate) {
      normalized.targetDate = this.resolveRelativeDate(
        normalized.relativeDay,
        context.currentDate,
      );
    }

    // Normalize Islamic time slot casing
    if (normalized.islamicTimeSlot) {
      normalized.islamicTimeSlot = normalized.islamicTimeSlot
        .toLowerCase()
        .replace(/\s+/g, '_');
    }

    // Resolve task references like "task 3" → actual task ID
    if (normalized.rawNumbers?.length && !normalized.taskId) {
      const num = normalized.rawNumbers[0];
      const matchedTask = context.todayTasks[num - 1]; // 1-indexed user-facing
      if (matchedTask) {
        normalized.taskId = matchedTask.id;
      }
    }

    return normalized;
  }

  private resolveRelativeDate(relative: string, currentDate: string): string {
    const today = new Date(currentDate);
    const lower = relative.toLowerCase();

    const DAY_MAP: Record<string, number> = {
      today: 0, النهارده: 0, النهاردة: 0,
      tomorrow: 1, بكرة: 1, بكره: 1,
      'day after tomorrow': 2, 'بعد بكرة': 2, 'بعد بكره': 2,
    };

    if (DAY_MAP[lower] !== undefined) {
      today.setDate(today.getDate() + DAY_MAP[lower]);
      return today.toISOString().split('T')[0];
    }

    // Try weekday names (English + Arabic)
    const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    let targetDow = WEEKDAYS_EN.indexOf(lower);
    if (targetDow === -1) targetDow = WEEKDAYS_AR.indexOf(lower);

    if (targetDow !== -1) {
      const currentDow = today.getDay();
      let daysAhead = targetDow - currentDow;
      if (daysAhead <= 0) daysAhead += 7; // always next occurrence
      today.setDate(today.getDate() + daysAhead);
      return today.toISOString().split('T')[0];
    }

    return currentDate; // fallback: today
  }
}
```

### 5.5 Confidence Tiers & Behavior

| Confidence | Behavior |
|------------|----------|
| **≥ 0.85** | Execute immediately. No confirmation needed. |
| **0.6 – 0.84** | Execute but confirm: "I understood you want to [action]. Correct?" |
| **0.3 – 0.59** | Escalate to `gpt-4o`. If still low, ask the follow-up question from the model. |
| **< 0.3** | Reply with help prompt: "I'm not sure what you mean. You can say..." |

### 5.6 Conversation Context Management

The `ConversationModule` maintains a lightweight state per user:

```typescript
// conversation/conversation-state.ts

export interface ConversationState {
  pendingState:
    | 'awaiting_justification'
    | 'awaiting_image_tag'
    | 'awaiting_confirmation'
    | 'awaiting_task_selection'
    | 'awaiting_shift_date'
    | null;

  pendingReference?: {
    type: 'habit' | 'task';
    id: string;
    name: string;
  };

  /** Buffered action waiting for confirmation (confidence 0.6-0.84) */
  pendingAction?: {
    intent: ClassifiedIntent;
    originalMessage: string;
    expiresAt: Date;           // auto-clear after 5 min
  };

  /** Rolling window of recent messages (max 10) */
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}
```

State transitions:

```
IDLE
  │
  ├── habit reminder sent ──────────► AWAITING response (done/skip)
  │                                        │
  │                                        ├── "skip" ──► AWAITING_JUSTIFICATION
  │                                        │                   │
  │                                        │                   └── user replies ──► save + IDLE
  │                                        │
  │                                        └── "done" ──► save + IDLE
  │
  ├── "shift task 3" (no date) ────► AWAITING_SHIFT_DATE
  │                                        │
  │                                        └── "tomorrow" ──► execute + IDLE
  │
  ├── image received ──────────────► AWAITING_IMAGE_TAG
  │                                        │
  │                                        └── "2" (choice) ──► link + IDLE
  │
  └── medium confidence action ────► AWAITING_CONFIRMATION
                                           │
                                           ├── "yes" / "أيوة" ──► execute + IDLE
                                           └── "no" / "لا" ──► discard + IDLE
```

---

## 6. Integration with Conversation Module

The existing `ConversationService` becomes a thin router that delegates intelligence to `ConversationAiService`:

```typescript
// conversation/conversation.service.ts (updated flow)

@Injectable()
export class ConversationService {
  constructor(
    private readonly aiService: ConversationAiService,
    private readonly taskService: TaskService,
    private readonly habitService: HabitService,
    private readonly prayerTimeService: PrayerTimeService,
    private readonly persistenceService: PersistenceService,
    @Inject(MESSAGING_SERVICE) private readonly messaging: IMessagingService,
  ) {}

  async handleText(text: string, from: string): Promise<void> {
    const context = await this.buildContext(from);
    const result = await this.aiService.classify(text, context);

    // Push to message history
    this.pushMessage(from, 'user', text);

    // Confidence gating
    if (result.confidence < 0.3) {
      return this.sendHelp(from);
    }

    if (result.confidence < 0.6 && !result.followUpQuestion) {
      return this.sendHelp(from);
    }

    if (result.confidence >= 0.6 && result.confidence < 0.85) {
      return this.requestConfirmation(from, result, text);
    }

    // High confidence — execute
    await this.executeIntent(from, result);
  }

  private async executeIntent(from: string, result: ClassifiedIntent): Promise<void> {
    const handlers: Record<string, () => Promise<void>> = {
      task_create:    () => this.taskService.create(result.entities),
      task_complete:  () => this.taskService.complete(result.entities.taskId),
      task_skip:      () => this.taskService.skip(result.entities.taskId, result.entities.justification),
      task_shift:     () => this.handleTaskShift(from, result),
      task_list:      () => this.sendTaskSummary(from),
      task_update:    () => this.taskService.update(result.entities),
      task_delete:    () => this.taskService.delete(result.entities.taskId),

      habit_done:     () => this.habitService.markDone(result.entities.habitId),
      habit_skipped:  () => this.handleHabitSkip(from, result),
      habit_list:     () => this.sendHabitSummary(from),
      habit_status:   () => this.sendHabitStatus(from, result.entities.habitId),

      daily_summary:  () => this.sendDailySummary(from),
      weekly_summary: () => this.sendWeeklySummary(from),

      image_tag_response: () => this.handleImageTagResponse(from, result),

      greeting:       () => this.sendGreeting(from),
      help:           () => this.sendHelp(from),
      confirmation:   () => this.handleConfirmation(from),
      rejection:      () => this.handleRejection(from),
      unclear:        () => this.sendFollowUp(from, result.followUpQuestion),
    };

    const handler = handlers[result.intent];
    if (handler) {
      await handler();
    } else {
      await this.sendHelp(from);
    }
  }
}
```

---

## 7. Example Classifications

### 7.1 Arabic Task Creation

**User:** `"ضيف تاسك اشتري خضار بعد الضهر"`

```json
{
  "intent": "task_create",
  "confidence": 0.95,
  "entities": {
    "taskTitle": "اشتري خضار",
    "islamicTimeSlot": "after_dhuhr"
  },
  "reasoning": "ضيف تاسك = add task, اشتري خضار = buy vegetables, بعد الضهر = after dhuhr"
}
```

### 7.2 English Task Shift

**User:** `"move task 3 to thursday because the office is closed"`

```json
{
  "intent": "task_shift",
  "confidence": 0.92,
  "entities": {
    "taskId": "t-003",
    "relativeDay": "thursday",
    "targetDate": "2026-02-19",
    "justification": "the office is closed",
    "rawNumbers": [3]
  },
  "reasoning": "move task = shift intent, task 3 maps to t-003, thursday = 2026-02-19, reason provided"
}
```

### 7.3 Mixed Language Habit Skip

**User:** `"مخلصتش الquran reading عشان كنت تعبان"`

```json
{
  "intent": "habit_skipped",
  "confidence": 0.91,
  "entities": {
    "habitName": "quran reading",
    "habitId": "quran-reading",
    "justification": "كنت تعبان (was feeling unwell)"
  },
  "reasoning": "مخلصتش = didn't finish (negative), quran reading matches habit ID, عشان كنت تعبان = because was sick"
}
```

### 7.4 Ambiguous Message

**User:** `"٣"`

Context: `pendingState = 'awaiting_image_tag'`

```json
{
  "intent": "image_tag_response",
  "confidence": 0.97,
  "entities": {
    "selectedOption": 3
  },
  "reasoning": "User sent a number while system is awaiting image tag selection. 3 = their choice."
}
```

### 7.5 Low Confidence Escalation

**User:** `"الحاجة بتاعت امبارح"`

```json
{
  "intent": "unclear",
  "confidence": 0.25,
  "entities": {},
  "followUpQuestion": "مش فاهم قصدك إيه بالظبط. تقصد مهمة معينة من امبارح؟ ممكن تقولي اسمها أو رقمها.",
  "reasoning": "الحاجة بتاعت امبارح = 'the thing from yesterday' — too vague to determine intent"
}
```

---

## 8. Cost Optimization

| Strategy | Detail |
|----------|--------|
| **Primary model: `gpt-4o-mini`** | Handles ~90% of messages at fraction of the cost. |
| **Escalation only when needed** | `gpt-4o` is called only for confidence < 0.6 (estimated ~10% of messages). |
| **JSON mode** | `response_format: json_object` avoids parsing failures and retries. |
| **Compact context** | Only last 6 messages + today's items sent (not full history). |
| **Max tokens: 512** | JSON responses are small; prevents runaway token usage. |
| **Cache system prompt** | System prompt is static; OpenAI caches it server-side after first call. |
| **Estimated cost** | ~100 messages/day ≈ $0.05–0.15/day with `gpt-4o-mini`. |

---

## 9. Error Handling & Resilience

| Failure Mode | Handling |
|--------------|----------|
| OpenAI API timeout | Retry up to 2 times (built into SDK config), then return `unclear` intent. |
| Rate limit (429) | Exponential backoff. Queue messages and process in order. |
| Malformed JSON response | Catch parse error → return `unclear` with help prompt. |
| Whisper fails on audio | Reply asking for text input. Save audio to disk for debug. |
| Model returns invalid intent | `validateResponse()` maps unknown intents to `unclear`. |
| Context too large | Trim to last 6 messages + today's items only. |

---

## 10. Testing Strategy

### 10.1 Unit Tests

- `ConversationAiService.classify()` with mocked OpenAI client returning known JSON.
- `normalizeEntities()` for relative date resolution and Islamic time slot normalization.
- `WhisperService.transcribe()` with mocked API response.

### 10.2 Integration Tests

- Pre-recorded message corpus (50+ examples in Arabic, English, mixed) with expected intents.
- Run against real `gpt-4o-mini` and assert intent + key entities match.
- Track accuracy over time; flag regressions.

### 10.3 Evaluation Fixture Format

```jsonc
// test/fixtures/intent-corpus.json
[
  {
    "message": "ضيف تاسك اشتري خضار بعد الضهر",
    "expectedIntent": "task_create",
    "expectedEntities": {
      "islamicTimeSlot": "after_dhuhr"
    },
    "context": { "pendingState": null }
  },
  // ...
]
```

---

## 11. Future Enhancements

- **Streaming responses** for long summaries (GPT streaming → chunked WhatsApp messages).
- **Fine-tuned classifier** on accumulated message corpus to replace GPT calls entirely.
- **Local Whisper** (`whisper.cpp`) to eliminate STT API costs.
- **Embeddings-based habit matching** for fuzzy image-to-habit association.
- **Multi-turn tool use** via OpenAI function calling for complex multi-step operations.
