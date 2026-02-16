# Implementation Plan

> **Approach:** Build in vertical slices. Each phase delivers a working, testable capability.
> Never move to the next phase until the current phase's validation checklist is fully green.

---

## Phase Overview

```
Phase 0 ─ Project Scaffold & Tooling                          [ 1 day  ]
Phase 1 ─ Messaging Module (WhatsApp connection)               [ 2 days ]
Phase 2 ─ Persistence & Habit Loading                          [ 1 day  ]
Phase 3 ─ Prayer Times & Reminder Engine                       [ 2 days ]
Phase 4 ─ OpenAI Integration (Whisper + Conversation AI)       [ 2 days ]
Phase 5 ─ Conversation Router & Intent Execution               [ 3 days ]
Phase 6 ─ Task Management (CRUD + Shifting)                    [ 2 days ]
Phase 7 ─ Image Handling & Tagging                             [ 1 day  ]
Phase 8 ─ End-to-End Integration & Hardening                   [ 2 days ]
                                                        Total: ~16 days
```

```
         Phase 0          Phase 1          Phase 2
       ┌─────────┐     ┌──────────┐     ┌──────────┐
       │ Scaffold │────▶│ Messaging│────▶│Persistence│
       │ Tooling  │     │ WhatsApp │     │ + Habits  │
       └─────────┘     └──────────┘     └─────┬─────┘
                                              │
                                              ▼
         Phase 4          Phase 3        ┌──────────┐
       ┌──────────┐     ┌──────────┐     │ Prayer   │
       │ OpenAI   │     │ Reminder │◀────│ Times    │
       │ Whisper  │     │ Engine   │     └──────────┘
       │ + GPT    │     └────┬─────┘
       └────┬─────┘          │
            │                │
            ▼                ▼
       ┌───────────────────────────┐
       │  Phase 5                  │
       │  Conversation Router      │
       │  Intent → Execution       │
       └─────────────┬─────────────┘
                     │
            ┌────────┴────────┐
            ▼                 ▼
       ┌──────────┐     ┌──────────┐
       │ Phase 6  │     │ Phase 7  │
       │ Task CRUD│     │ Image    │
       │ Shifting │     │ Tagging  │
       └────┬─────┘     └────┬─────┘
            │                │
            ▼                ▼
       ┌───────────────────────────┐
       │  Phase 8                  │
       │  E2E Integration          │
       │  Hardening                │
       └───────────────────────────┘
```

---

## Phase 0 — Project Scaffold & Tooling

### Goal

A clean NestJS project that compiles, lints, and runs an empty app. Every dev can clone and be productive in under 5 minutes.

### Tasks

| # | Task | Detail |
|---|------|--------|
| 0.1 | Initialize NestJS project | `nest new taskana --strict --package-manager npm` |
| 0.2 | Configure TypeScript | `strict: true`, `ES2022` target, path aliases (`@messaging/*`, `@common/*`, etc.) |
| 0.3 | Install core dependencies | `@nestjs/config`, `@nestjs/schedule`, `@nestjs/event-emitter`, `zod`, `date-fns`, `uuid`, `pino` / `pino-pretty` |
| 0.4 | ESLint + Prettier | Configure per [conventions.md](conventions.md) rules. Add `lint-staged` + `husky` for pre-commit. |
| 0.5 | Environment config | Create `src/config/configuration.ts` with typed factory. Create `.env.example`. Wire `ConfigModule.forRoot()` with `zod` validation that fails fast on missing `MY_PHONE_NUMBER` and `OPENAI_API_KEY`. |
| 0.6 | Create directory structure | All module folders with placeholder `*.module.ts` files (empty modules). Create `data/habits/`, `data/days/`, `data/media/`, `data/session/` with `.gitkeep`. |
| 0.7 | Add scripts | `start:dev`, `start:prod`, `build`, `lint`, `lint:fix`, `format`, `test`, `test:watch`, `test:cov`, `test:e2e` |
| 0.8 | Create messages file | `src/common/messages/ar.ts` with initial string constants (can be placeholders). |
| 0.9 | Documentation | Move design docs into `docs/`. Verify README links resolve. |

### Validation Checklist

```
[ ] npm install completes with 0 vulnerabilities (or only low)
[ ] npm run build compiles with 0 errors
[ ] npm run lint passes with 0 warnings
[ ] npm run start:dev boots and logs "Nest application successfully started"
[ ] npm run test runs (0 tests is OK at this point, but the runner works)
[ ] .env.example documents every variable
[ ] Removing MY_PHONE_NUMBER from .env causes startup to fail with a clear error
[ ] All module folders exist with placeholder module files
[ ] docs/ contains all 4 design documents + conventions.md
```

---

## Phase 1 — Messaging Module (WhatsApp Connection)

### Goal

Send and receive WhatsApp messages. The app connects, prints a QR code, and can echo back any text message it receives.

### Dependencies

Phase 0 complete.

### Tasks

| # | Task | Detail |
|---|------|--------|
| 1.1 | Install Baileys | `npm install @whiskeysockets/baileys @hapi/boom pino` |
| 1.2 | Define interfaces | `IMessagingService`, all incoming/outgoing message types, `ConnectionState`, DTOs (`ButtonOption`, `ListSection`). No implementation yet — just the contracts. |
| 1.3 | Define constants | `MESSAGING_SERVICE` token, `MSG_EVENTS` event name map. |
| 1.4 | Define events | `TextMessageReceivedEvent`, `AudioMessageReceivedEvent`, `ImageMessageReceivedEvent`, `ButtonResponseReceivedEvent`, `ListResponseReceivedEvent`, `ConnectionStateChangedEvent`. |
| 1.5 | Implement `BaileysAuthService` | `useMultiFileAuthState`, session dir from config, `initialize()` + `persistCreds()`. |
| 1.6 | Implement `BaileysMapperService` | Map raw `WAMessage` → application DTOs for text, audio, image, button response, list response. Return `null` for unsupported types. |
| 1.7 | Implement `BaileysMediaService` | `download(rawMessage)` → `Buffer`. `downloadAndSave(rawMessage, filename)` → file path. |
| 1.8 | Implement `BaileysMessagingService` | Full implementation: `initialize()`, `disconnect()`, `sendText()`, `sendFormattedText()`, `sendButtons()` with fallback, `sendList()` with fallback, `sendImage()`, `sendAudio()`, `sendReaction()`, `downloadMedia()`. Wire `messages.upsert` → mapper → event emitter. Wire `connection.update` with reconnection logic. |
| 1.9 | Implement `FakeMessagingService` | Full fake with `sentMessages` capture, `getLastMessage()`, `getMessagesTo()`, `reset()`. |
| 1.10 | Implement `AllowedSenderGuard` | Check `MY_PHONE_NUMBER`. |
| 1.11 | Register `MessagingModule` | Wire providers, export `MESSAGING_SERVICE`. Import `EventEmitterModule.forRoot()`. |
| 1.12 | Write echo handler (temporary) | A temporary `@OnEvent('message.text.received')` handler in `AppModule` that echoes back the received text. This is the validation harness — delete after Phase 1. |
| 1.13 | Unit tests | `BaileysMapperService`: test all 5 message types + null for unsupported. `AllowedSenderGuard`: test allowed, denied, unset. `FakeMessagingService`: test capture + retrieval. |

### Validation Checklist

```
[ ] npm run start:dev prints a QR code in the terminal
[ ] Scanning the QR connects successfully (logs "WhatsApp connection established")
[ ] Sending a text message from your phone is logged and echoed back
[ ] Sending a voice note is detected as type "audio" (logged, no transcription yet)
[ ] Sending an image is detected as type "image" (logged, no processing yet)
[ ] Sending from a different number is ignored (if MY_PHONE_NUMBER is set)
[ ] Killing and restarting the app reconnects WITHOUT showing a new QR (session persisted)
[ ] Disconnecting Wi-Fi and reconnecting triggers the reconnection flow (logged)
[ ] FakeMessagingService passes all unit tests
[ ] BaileysMapperService passes all unit tests
[ ] npm run lint passes
[ ] npm run test passes (all Phase 1 tests green)
```

---

## Phase 2 — Persistence & Habit Loading

### Goal

Read habit definitions from disk. Read/write daily log files. Fully testable without WhatsApp.

### Dependencies

Phase 0 complete. (Phase 1 not required — this is intentionally parallelizable.)

### Tasks

| # | Task | Detail |
|---|------|--------|
| 2.1 | Define habit schema | `zod` schema matching the habit JSON format from the design doc. Export TypeScript type inferred from schema. |
| 2.2 | Implement `HabitService` | `loadAll()` — reads `HABITS_DIR`, parses + validates each JSON file. `getById(id)`. `getByTimeSlot(slot)`. `getForDay(dayOfWeek)`. Cache in memory on first load. |
| 2.3 | Define daily log schema | `zod` schema for the day file (habits array + tasks array). |
| 2.4 | Implement `PersistenceService` | `loadDay(date)` — read or create. `saveDay(date, data)` — atomic write. `updateHabitStatus(date, habitId, status, justification?)`. `addTask(date, task)`. `updateTask(date, taskId, updates)`. `getDay(date)` — cached read. |
| 2.5 | Atomic write utility | `common/utils/atomic-write.ts` — write to `.tmp`, rename. |
| 2.6 | Create sample habits | 3–4 realistic habit JSON files in `data/habits/` (Quran reading, exercise, morning adhkar, evening adhkar). |
| 2.7 | Register modules | `HabitModule`, `PersistenceModule`. Export services. |
| 2.8 | Unit tests — HabitService | Valid file loads correctly. Invalid JSON throws. Missing dir throws. `getByTimeSlot` filters correctly. `getForDay` respects day schedule. |
| 2.9 | Unit tests — PersistenceService | Create new day file. Load existing. Update habit status. Add task. Atomic write doesn't corrupt on simulated crash (write `.tmp`, verify no partial main file). |

### Validation Checklist

```
[ ] App starts and logs "Loaded N habits from data/habits/"
[ ] Invalid habit JSON file causes a clear validation error at startup
[ ] HabitService.getAll() returns all loaded habits
[ ] HabitService.getByTimeSlot('after_fajr') returns only matching habits
[ ] PersistenceService.loadDay('2026-02-16') creates a new file if none exists
[ ] PersistenceService.saveDay() writes valid JSON readable by loadDay()
[ ] Day file is pretty-printed with 2-space indent
[ ] No .tmp files left after successful write
[ ] All unit tests pass
[ ] Modules work without MessagingModule loaded (no WhatsApp dependency)
```

---

## Phase 3 — Prayer Times & Reminder Engine

### Goal

Calculate today's prayer times and schedule habit reminders that fire at the correct time. Validated using `FakeMessagingService`.

### Dependencies

Phase 2 complete (needs `HabitService` and `PersistenceService`).

### Tasks

| # | Task | Detail |
|---|------|--------|
| 3.1 | Install adhan | `npm install adhan` |
| 3.2 | Implement `PrayerTimeService` | `getTodayTimes()` → `{ fajr, sunrise, dhuhr, asr, maghrib, isha }` as `Date` objects. `getSlotTime(islamicTimeSlot)` → `Date` — resolves "after_fajr" to the Fajr time, "before_dhuhr" to Dhuhr minus offset, etc. `getCurrentSlot()` → which slot we're currently in. Cache per day. |
| 3.3 | Define slot resolution logic | Map each `IslamicTimeSlot` enum to a concrete time derivation. Document the "before_X" offset (default: 30 min before, configurable). |
| 3.4 | Implement `ReminderService` | `scheduleDailyReminders()` — called at startup and via `@Cron('0 0 * * *')` at midnight. For each habit active today: schedule start reminder at slot time, schedule before-end reminder at (slot time + duration − beforeEndMinutes). Use `setTimeout` with calculated delay (not cron per reminder). `cancelAllReminders()` — clear pending timeouts (for reschedule / shutdown). |
| 3.5 | Reminder message formatting | Use strings from `ar.ts`. Include habit name, time slot, and done/skip prompt. |
| 3.6 | Wire to messaging | Inject `MESSAGING_SERVICE`. Send reminder via `sendText()` (or `sendButtons()` if available). |
| 3.7 | Register modules | `PrayerTimeModule`, `ReminderModule`. |
| 3.8 | Unit tests — PrayerTimeService | Known lat/long + date → verify Fajr time within ±2 min of reference. `getSlotTime('before_dhuhr')` is exactly 30 min before Dhuhr. `getCurrentSlot()` returns correct slot for a mocked "now". |
| 3.9 | Unit tests — ReminderService | With `FakeMessagingService`: trigger `scheduleDailyReminders()` with mocked time. Fast-forward timers (use `jest.useFakeTimers()`). Verify correct number of messages sent. Verify message content includes habit name. Verify before-end reminder fires at correct offset. |

### Validation Checklist

```
[ ] App logs today's prayer times at startup (e.g., "Fajr: 05:12, Dhuhr: 12:15, ...")
[ ] App logs "Scheduled N reminders for today"
[ ] With fake timers: start reminder fires at exact slot time
[ ] With fake timers: before-end reminder fires at (slot + duration − offset)
[ ] Reminder message contains the habit name and instructions
[ ] Reminders only fire for habits scheduled on today's day-of-week
[ ] Restarting the app mid-day does not re-fire past reminders
[ ] Midnight cron reschedules reminders for the new day
[ ] All unit tests pass
[ ] PrayerTimeService works independently (no messaging dependency)
[ ] ReminderService works with FakeMessagingService (no real WhatsApp needed)
```

---

## Phase 4 — OpenAI Integration (Whisper + Conversation AI)

### Goal

Transcribe audio to text. Classify text into intents with entity extraction. Fully testable with mocked OpenAI client.

### Dependencies

Phase 0 complete. (Parallelizable with Phases 1–3.)

### Tasks

| # | Task | Detail |
|---|------|--------|
| 4.1 | Install OpenAI SDK | `npm install openai` |
| 4.2 | Implement `OpenAiModule` | Global module. `OPENAI_CLIENT` factory provider. Exports client + services. |
| 4.3 | Define `ISttService` interface | `transcribe(audio, lang?) → SttResult`. |
| 4.4 | Implement `WhisperService` | Call `openai.audio.transcriptions.create()` with `whisper-1`, `verbose_json`, `temperature: 0`. Map `avg_logprob` to 0–1 confidence. |
| 4.5 | Define `IConversationAiService` interface | `classify(message, context) → ClassifiedIntent`. All DTOs: `IntentType`, `ClassifiedIntent`, `ExtractedEntities`, `ConversationContext`. |
| 4.6 | Write system prompt | `prompts/system-prompt.ts` — Islamic time slots, Arabic mappings, response rules. |
| 4.7 | Write classification prompt builder | `prompts/intent-classification.ts` — `buildClassificationPrompt(message, context)` template function. |
| 4.8 | Implement `ConversationAiService` | `classify()` → call `gpt-4o-mini` with JSON mode → parse → validate → normalize entities. Escalation to `gpt-4o` if confidence < 0.6. `resolveRelativeDate()` for Arabic + English. `normalizeEntities()` for slot casing, task ID resolution. |
| 4.9 | Create intent test corpus | `test/fixtures/intent-corpus.json` — minimum 30 entries covering all intents in Arabic, English, and mixed. |
| 4.10 | Unit tests — WhisperService | Mock `openai.audio.transcriptions.create`. Verify `SttResult` shape. Verify confidence mapping. Verify error handling returns graceful failure. |
| 4.11 | Unit tests — ConversationAiService | Mock `openai.chat.completions.create`. Test: valid JSON parsed correctly. Invalid intent normalized to `unclear`. Low confidence triggers escalation (mock called twice). `resolveRelativeDate` for "بكرة", "tomorrow", "thursday", "الخميس". Entity normalization: time slot casing, task ID resolution. |
| 4.12 | Integration test — intent corpus | (Optional, runs against real OpenAI.) Loop through `intent-corpus.json`, call `classify()`, assert intent matches. Report accuracy percentage. Mark as `@Slow` test. |

### Validation Checklist

```
[ ] WhisperService transcribes a sample .ogg file and returns text (manual test with real API)
[ ] ConversationAiService classifies "ضيف تاسك اشتري خضار بعد الضهر" as task_create (manual test)
[ ] ConversationAiService classifies "مهامي" as task_list or daily_summary
[ ] ConversationAiService classifies "shift task 3 to tomorrow" as task_shift with correct entities
[ ] Ambiguous input returns intent "unclear" with a followUpQuestion
[ ] Low confidence triggers escalation (visible in debug logs: "escalating to gpt-4o")
[ ] resolveRelativeDate("بكرة", "2026-02-16") returns "2026-02-17"
[ ] resolveRelativeDate("thursday", "2026-02-16") returns "2026-02-19"
[ ] All mock-based unit tests pass
[ ] Intent corpus accuracy ≥ 85% (integration test, if run)
[ ] Module works without MessagingModule (no WhatsApp dependency)
```

---

## Phase 5 — Conversation Router & Intent Execution

### Goal

Wire incoming WhatsApp messages → AI classification → action execution → WhatsApp reply. This is the central nervous system.

### Dependencies

Phase 1 (messaging), Phase 2 (persistence + habits), Phase 3 (prayer times), Phase 4 (OpenAI).

### Tasks

| # | Task | Detail |
|---|------|--------|
| 5.1 | Define `ConversationState` | `pendingState`, `pendingReference`, `pendingAction`, `recentMessages`. In-memory `Map<string, ConversationState>` keyed by phone number. |
| 5.2 | Implement state management | `getState(phoneNumber)`, `setState(phoneNumber, updates)`, `clearPendingState(phoneNumber)`. Auto-expire `pendingAction` after 5 minutes. Message history capped at 10. |
| 5.3 | Implement `ConversationService.handleText()` | Build context → call `aiService.classify()` → confidence gating → route to handler. |
| 5.4 | Implement `ConversationService.handleAudio()` | Download media → `whisperService.transcribe()` → re-enter as `handleText()`. Error → send transcription failed message. |
| 5.5 | Implement context builder | `buildContext()` — assemble `ConversationContext` from `ConversationState`, `HabitService`, `TaskService` (stubbed for now), `PrayerTimeService`, `PersistenceService`. |
| 5.6 | Implement intent handler map | Dispatch table mapping each `IntentType` to a handler method. Stub all handlers initially — each returns a "not yet implemented" message. |
| 5.7 | Implement core handlers | `greeting` → send welcome. `help` → send capabilities list. `unclear` → send follow-up question or help. `confirmation` → execute pending action. `rejection` → discard pending action. |
| 5.8 | Implement habit handlers | `habit_done` → `PersistenceService.updateHabitStatus()`. `habit_skipped` → if no justification, set `pendingState = awaiting_justification` and ask. When justification received, save. `habit_list` / `habit_status` → format and send. |
| 5.9 | Implement daily summary handler | `daily_summary` → load today's day file, group by Islamic time slot, format with emojis, send. |
| 5.10 | Wire event listeners | `@OnEvent('message.text.received')` → `handleText()`. `@OnEvent('message.audio.received')` → `handleAudio()`. `@OnEvent('message.button.response')` → `handleButtonResponse()`. All wrapped in try/catch. |
| 5.11 | Remove Phase 1 echo handler | Delete the temporary echo handler from `AppModule`. |
| 5.12 | Register `ConversationModule` | Import all required modules. |
| 5.13 | Unit tests | With `FakeMessagingService` + mocked `ConversationAiService`: text message → correct handler called. Audio message → Whisper called → re-entered as text. Confidence < 0.3 → help sent. Confidence 0.6–0.84 → confirmation requested. Confirmation "yes" → pending action executed. State transitions: idle → awaiting_justification → idle. |

### Validation Checklist

```
[ ] Send "مرحبا" via WhatsApp → receive greeting response
[ ] Send "مهامي" → receive daily summary (may be empty)
[ ] Send "مساعدة" or "help" → receive capabilities list
[ ] Send gibberish → receive "unclear" response with suggestions
[ ] Send voice note → see transcription in logs → receive appropriate response
[ ] Send voice note with noise → receive transcription failed message
[ ] Habit reminder fires → reply "done" → habit marked in day file → confirmation sent
[ ] Habit reminder fires → reply "skip" → asked for justification → provide it → saved
[ ] State resets after completing a flow (no stale pending states)
[ ] Sending a message while awaiting_justification is interpreted as the justification
[ ] All unit tests pass
[ ] No unhandled promise rejections in any flow
```

---

## Phase 6 — Task Management (CRUD + Shifting)

### Goal

Full task lifecycle via WhatsApp: create, list, complete, skip, shift, delete.

### Dependencies

Phase 5 complete (conversation router handles intent dispatch).

### Tasks

| # | Task | Detail |
|---|------|--------|
| 6.1 | Implement `TaskService` | `create(entities)` — generate ID, map entities to task object, save via `PersistenceService.addTask()`. `complete(taskId)`. `skip(taskId, justification?)`. `shift(taskId, targetDate, reason?)` — mark original as shifted, add copy to target day file. `update(taskId, entities)` — change title, time slot, etc. `delete(taskId)`. `listForDay(date)` — return tasks grouped by Islamic time slot. |
| 6.2 | Task ID generation | Short sequential IDs per day: `t-001`, `t-002`, etc. `PersistenceService` tracks the next ID. |
| 6.3 | Wire task handlers in ConversationService | Replace stubs: `task_create` → `TaskService.create()` + send confirmation. `task_complete` → `TaskService.complete()` + send ✅. `task_skip` → if no justification and habit requires it, ask. `task_shift` → if no date in entities, set `pendingState = awaiting_shift_date`. When date received, execute shift + send confirmation. `task_delete` → confirm + delete. `task_list` → format + send (reuse daily summary format). |
| 6.4 | Shift validation | Cannot shift to past date. Cannot shift a completed task. System replies with error if attempted. |
| 6.5 | Task summary formatting | Group by Islamic time slot. Show status emoji. Include task number for reference. |
| 6.6 | Register `TaskModule` | Export `TaskService`. |
| 6.7 | Unit tests — TaskService | Create task → appears in day file. Complete → status changes. Shift → original marked shifted, new entry in target day. Shift to past date → error. Delete → removed from file. List → correct grouping. |
| 6.8 | Unit tests — Conversation integration | "ضيف تاسك X بعد الظهر" → task created (via mocked AI returning `task_create`). "done 1" → task completed. "shift 2 to بكرة" → task shifted. "shift 2" (no date) → asked for date → "بكرة" → shifted. |

### Validation Checklist

```
[ ] Send "add task buy groceries after dhuhr" → confirmation received → task in day file
[ ] Send "ضيف تاسك اشتري خضار بعد الضهر" → same result in Arabic
[ ] Send "tasks" → summary shows new task under correct time slot
[ ] Send "done 1" → task marked done → ✅ confirmation
[ ] Send "skip 1 because I'm busy" → task marked skipped with justification
[ ] Send "shift 1 to tomorrow" → original task marked shifted → new task in tomorrow's file
[ ] Send "shift 1 to thursday because office closed" → shifted with reason
[ ] Send "shift 1" (no date) → system asks "to when?" → reply "بكرة" → shifted
[ ] Send "shift 1 to yesterday" → error message (cannot shift to past)
[ ] Send "done 1" on already-done task → appropriate message
[ ] Day file correctly reflects all operations
[ ] Tomorrow's day file contains the shifted task with origin field
[ ] All unit tests pass
```

---

## Phase 7 — Image Handling & Tagging

### Goal

Receive an image via WhatsApp, prompt the user to tag it to a habit or task, and save the association.

### Dependencies

Phase 5 complete (conversation router), Phase 6 complete (tasks exist to tag).

### Tasks

| # | Task | Detail |
|---|------|--------|
| 7.1 | Implement `ImageService` | `handleIncomingImage(message)` — download image via `messaging.downloadMedia()`, save to `data/media/` with naming convention `YYYY-MM-DD_HHmmss_<uuid>.jpg`. Build choice list from today's habits + tasks. Send list to user. Set `pendingState = awaiting_image_tag`. |
| 7.2 | Implement tag response handler | When user replies with a number while `awaiting_image_tag`: resolve to habit or task. Append image path to the habit/task entry in the day file. Send confirmation. Clear pending state. |
| 7.3 | Wire `@OnEvent('message.image.received')` | Route to `ImageService.handleIncomingImage()`. |
| 7.4 | Wire image tag response in ConversationService | When `pendingState === 'awaiting_image_tag'` and intent is `image_tag_response`, call `ImageService.tagImage()`. |
| 7.5 | Handle edge cases | No active habits or tasks → "No habits or tasks to tag today. Image saved." Image received during another pending state → queue or ask to finish current flow first. |
| 7.6 | Media file name sanitization | Strip special characters. Limit filename length. Prevent path traversal. |
| 7.7 | Register `ImageModule` | Import `MessagingModule`, `PersistenceModule`. Export `ImageService`. |
| 7.8 | Unit tests | Image download called correctly. Choice list contains today's items. Tag response saves image path to correct entry. Invalid choice number → error message. No items available → save-only message. |

### Validation Checklist

```
[ ] Send a photo via WhatsApp → receive numbered list of today's habits + tasks
[ ] Reply with "1" → image linked to first item → confirmation received
[ ] Reply with "2" → linked to second item
[ ] Day file contains image path in the correct habit/task entry
[ ] Image file exists in data/media/ with correct naming
[ ] Send photo when no habits/tasks exist → "Image saved" message (no crash)
[ ] Send photo while awaiting_justification → handled gracefully
[ ] Reply with invalid number → error message, re-prompted
[ ] Image filename contains no special characters or path traversal
[ ] All unit tests pass
```

---

## Phase 8 — End-to-End Integration & Hardening

### Goal

Full system test. All modules working together through real WhatsApp conversations. Fix edge cases, add resilience, polish UX.

### Dependencies

All previous phases complete.

### Tasks

| # | Task | Detail |
|---|------|--------|
| 8.1 | Full-day simulation | Run the app for a full day. Verify all reminders fire at correct prayer times. Interact with every feature. |
| 8.2 | E2E test suite | Using `FakeMessagingService`: simulate a full day's conversation flow. Morning: receive reminder → mark done. Afternoon: add task → list tasks → shift task. Evening: receive image → tag it. Night: ask for summary. |
| 8.3 | Error resilience audit | Kill and restart app mid-conversation → pending state is lost (acceptable for PoC, document as known limitation). OpenAI API down → graceful fallback messages. Malformed day file → handled without crash. Habits dir empty → app starts with warning. |
| 8.4 | Message formatting polish | Review all outgoing messages for consistent formatting. Verify WhatsApp markdown renders correctly (*bold*, _italic_). Test on iOS and Android WhatsApp clients. |
| 8.5 | Rate limiting | Add simple throttle: ignore duplicate messages within 2 seconds (WhatsApp sometimes delivers duplicates). |
| 8.6 | Startup sequence hardening | Verify startup order: config validation → persistence dirs created → habits loaded → prayer times calculated → WhatsApp connected → reminders scheduled. Any failure in the chain → clear error, app stops. |
| 8.7 | Graceful shutdown | `OnModuleDestroy`: cancel all reminder timeouts, disconnect WhatsApp, flush any pending writes. |
| 8.8 | Logging review | Verify log levels are appropriate. No sensitive data in `log`/`warn`/`error` levels. `debug` level has useful diagnostic info. |
| 8.9 | Weekly summary (bonus) | If time allows: `weekly_summary` intent → aggregate the week's day files → send completion percentages per habit. |
| 8.10 | README update | Update README with any changes discovered during integration. Verify quickstart works from a fresh clone. |

### Validation Checklist

```
[ ] Full-day simulation completed with all features exercised
[ ] E2E test suite passes
[ ] App survives restart mid-conversation (no crash, state resets cleanly)
[ ] App handles OpenAI API timeout gracefully (retry + fallback message)
[ ] App handles empty habits directory (starts with warning, no crash)
[ ] App handles malformed day file (logs error, creates fresh file)
[ ] Duplicate message within 2s is ignored
[ ] Startup fails clearly on missing required env vars
[ ] Graceful shutdown: no pending timers, no orphaned connections
[ ] Messages render correctly on iOS and Android WhatsApp
[ ] No sensitive data in production log output
[ ] Fresh clone + .env setup + npm start:dev works end-to-end
[ ] All tests pass: unit + integration + e2e
[ ] npm run lint passes with 0 warnings
```

---

## Appendix A — Parallel Work Streams

For teams with 2+ developers:

```
Developer A                          Developer B
───────────                          ───────────
Phase 0 (together)                   Phase 0 (together)
     │                                    │
     ▼                                    ▼
Phase 1 (Messaging)                  Phase 2 (Persistence + Habits)
     │                                    │
     ▼                                    ▼
Phase 3 (Prayer + Reminders)         Phase 4 (OpenAI Integration)
     │                                    │
     └──────────┬─────────────────────────┘
                │
                ▼
          Phase 5 (Conversation Router) — pair on this
                │
          ┌─────┴─────┐
          ▼           ▼
     Phase 6       Phase 7
     (Tasks)       (Images)
          │           │
          └─────┬─────┘
                ▼
          Phase 8 (Integration)
```

---

## Appendix B — Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Baileys breaks with WhatsApp update | High — app stops working | Pin Baileys version. Monitor their GitHub issues. Abstraction layer means swapping is possible. |
| WhatsApp deprecates buttons/lists | Medium — UX degrades | Text fallbacks already built into Phase 1. |
| OpenAI API latency spikes | Medium — slow replies | Timeout at 30s. Fallback message. Consider local Whisper for STT. |
| OpenAI API cost unexpectedly high | Low — personal app | `gpt-4o-mini` for 90% of calls. Monitor usage via OpenAI dashboard. |
| Prayer time calculation off by minutes | Low — minor UX issue | Validate against known prayer time tables for your city. `adhan` is well-tested. |
| File corruption on crash during write | Medium — day's data lost | Atomic writes (Phase 2). Worst case: lose one pending write. |
| Session logged out by WhatsApp | Medium — requires re-scan | Detect 401, log clearly, notify via console. Re-scan is manual. |

---

## Appendix C — Definition of Phase Complete

A phase is complete when:

1. All tasks in the phase are implemented.
2. Every item in the validation checklist is checked off.
3. All unit tests pass (`npm run test`).
4. Lint passes (`npm run lint`).
5. The phase has been demonstrated (manually or via test) working independently of later phases.
6. Code is committed with appropriate conventional commit messages.
7. Any deviations from the design docs are documented (in the doc or as code comments).
