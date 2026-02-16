# WhatsApp Habits & Tasks Manager — Requirements & Design Document

## 1. Overview

A NestJS TypeScript proof-of-concept personal application that manages daily habits and tasks entirely through WhatsApp messaging. The system sends Islamic prayer-time-aware reminders, accepts text, audio, and image inputs, and persists all data as JSON files on disk.

---

## 2. Goals & Constraints

| Dimension | Detail |
|-----------|--------|
| Runtime | Node.js ≥ 18, NestJS framework, TypeScript strict mode |
| WhatsApp integration | Open-source library (default: `@whiskeysockets/baileys`) behind an abstraction so implementations can be swapped |
| Data storage | File-system JSON — no database required for the PoC |
| Prayer times | Calculated per location using `adhan` (or similar) npm package |
| Audio processing | Speech-to-text via a configurable provider (e.g., OpenAI Whisper API, local whisper.cpp) |
| Image processing | Receive image → present habit/task choices for the user to tag it |
| Single user | Personal app — single WhatsApp number, single user |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      NestJS Application                 │
│                                                         │
│  ┌──────────────────┐   ┌────────────────────────────┐  │
│  │  Messaging        │   │  Core Modules              │  │
│  │  Abstraction      │   │                            │  │
│  │  (interface)      │   │  HabitModule               │  │
│  │    ├ BaileysImpl  │   │  TaskModule                │  │
│  │    └ …future      │   │  ReminderModule            │  │
│  └────────┬─────────┘   │  PrayerTimeModule           │  │
│           │              │  AudioProcessingModule      │  │
│           │              │  ImageProcessingModule      │  │
│           │              │  ConversationModule         │  │
│           │              │  PersistenceModule          │  │
│           │              └────────────────────────────┘  │
│           │                          │                   │
│           └──────── MessageBus ──────┘                   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  File System (data/)                              │   │
│  │    habits/          (habit definitions)            │   │
│  │    days/YYYY-MM-DD.json  (daily task logs)        │   │
│  │    media/           (received images/audio)       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Module Breakdown

### 4.1 Messaging Abstraction (`MessagingModule`)

**Purpose:** Decouple the application from any specific WhatsApp library.

```typescript
// messaging.interface.ts
export interface IMessagingService {
  initialize(): Promise<void>;
  sendText(to: string, text: string): Promise<void>;
  sendButtons(to: string, text: string, buttons: ButtonOption[]): Promise<void>;
  sendList(to: string, title: string, sections: ListSection[]): Promise<void>;
  onTextMessage(handler: (msg: IncomingTextMessage) => void): void;
  onAudioMessage(handler: (msg: IncomingAudioMessage) => void): void;
  onImageMessage(handler: (msg: IncomingImageMessage) => void): void;
  onButtonResponse(handler: (msg: ButtonResponseMessage) => void): void;
}
```

- **BaileysMessagingService** — default implementation using `@whiskeysockets/baileys`.
- Registration via NestJS custom provider token `MESSAGING_SERVICE` so swapping is a single config change.
- Handles QR code auth flow, session persistence, reconnection.

### 4.2 Habit Module (`HabitModule`)

**Purpose:** Load, validate, and serve habit definitions.

**Habit JSON schema** (stored in `data/habits/`):

```jsonc
// data/habits/quran-reading.json
{
  "id": "quran-reading",
  "name": "Quran Reading",
  "description": "Read 1 juz daily",
  "schedule": {
    "days": ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], // or specific days
    "islamicTimeSlot": "after_fajr",     // when the habit starts
    "durationMinutes": 30                 // window length
  },
  "reminders": {
    "atStart": true,          // send reminder when the slot begins
    "beforeEnd": true,        // send reminder N minutes before slot ends
    "beforeEndMinutes": 5
  },
  "requiresJustification": true  // if not done, ask for justification
}
```

**Islamic time slots** (enum):

```
after_fajr | before_dhuhr | after_dhuhr | before_asr |
after_asr | before_maghrib | after_maghrib | before_isha | after_isha
```

- On startup, reads all `.json` files from the habits directory.
- Exposes `HabitService.getAll()`, `getById()`, `getByTimeSlot()`.

### 4.3 Prayer Time Module (`PrayerTimeModule`)

**Purpose:** Calculate daily prayer times for the configured location.

- Uses the `adhan` npm package (or equivalent).
- Configuration: latitude, longitude, calculation method (e.g., Egyptian General Authority, Muslim World League).
- Exposes `PrayerTimeService.getTodayTimes()` returning `{ fajr, sunrise, dhuhr, asr, maghrib, isha }` as `Date` objects.
- Translates each Islamic time slot to an absolute `Date` using the prayer times plus optional offsets.

### 4.4 Reminder Module (`ReminderModule`)

**Purpose:** Schedule and dispatch WhatsApp reminders.

- On app start (and at midnight daily), compute all reminder times for the day using `HabitService` + `PrayerTimeService`.
- Use `@nestjs/schedule` (`CronJob` or dynamic timeouts) to fire at the exact minute.
- **Start reminder:** `"🕌 It's time for [Habit Name]! (after Fajr)\nReply ✅ when done or ❌ if skipped."`
- **Before-end reminder:** `"⏳ [Habit Name] ends in 5 min. Did you do it?\n1️⃣ Done\n2️⃣ Didn't do it (will ask for justification)"`
- Tracks which reminders have been acknowledged; re-prompts once if no reply within the window.

### 4.5 Task Module (`TaskModule`)

**Purpose:** Manage ad-hoc and recurring tasks, distinct from habits.

**Task model:**

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  islamicTimeSlot: IslamicTimeSlot;
  status: 'pending' | 'done' | 'skipped' | 'shifted';
  shiftedTo?: string;           // ISO date if shifted
  shiftReason?: string;
  createdAt: string;
  completedAt?: string;
}
```

**Key operations (all via WhatsApp messages):**

| User says (text or audio) | System action |
|---------------------------|---------------|
| "Add task: buy groceries after dhuhr" | Parse → create task in today's file |
| "What are my tasks?" / "Tasks" | Reply with daily summary grouped by Islamic time slot |
| "Shift task 3 to tomorrow" | Mark as shifted, copy to next day's file |
| "Done task 3" | Mark as done |
| "Skip task 3 because I'm sick" | Mark as skipped + save justification |

### 4.6 Conversation Module (`ConversationModule`)

**Purpose:** Central router that receives all incoming messages and dispatches to the correct handler.

- Maintains lightweight per-user conversation state (e.g., "waiting for justification for habit X", "waiting for task selection for image").
- Uses a simple state machine or context map stored in memory.
- Delegates NLP/intent parsing to a helper service (keyword matching for PoC, upgradeable to LLM).

**Intent detection (PoC-level):**

```
"tasks" / "my tasks" / "what should I do"  → TaskSummaryIntent
"add task …"                                → AddTaskIntent
"shift task …"                              → ShiftTaskIntent
"done" / "did it" / ✅                      → HabitDoneIntent
"didn't" / "skip" / ❌                      → HabitSkippedIntent (→ ask justification)
[image received]                            → ImageTagIntent
[audio received]                            → TranscribeAndReprocess
```

### 4.7 Audio Processing Module (`AudioProcessingModule`)

**Purpose:** Transcribe voice notes to text, then re-route as text messages.

- Downloads the audio file from WhatsApp via the messaging service.
- Sends to a configurable STT provider:
  - **Option A:** OpenAI Whisper API (requires API key).
  - **Option B:** Local `whisper.cpp` binary via child process.
- Transcribed text is fed back into `ConversationModule` as if the user typed it.

### 4.8 Image Processing Module (`ImageProcessingModule`)

**Purpose:** Handle images sent by the user.

Flow:

1. User sends an image.
2. System saves image to `data/media/`.
3. System replies: `"Which habit or task does this image relate to?"` followed by a numbered list of today's active habits + tasks.
4. User replies with a number (or name).
5. System attaches the image reference to that habit/task entry in the daily log.

### 4.9 Persistence Module (`PersistenceModule`)

**Purpose:** Read/write daily JSON log files.

**Daily file schema** (`data/days/2026-02-16.json`):

```jsonc
{
  "date": "2026-02-16",
  "habits": [
    {
      "habitId": "quran-reading",
      "status": "done",            // done | skipped | pending
      "justification": null,
      "completedAt": "2026-02-16T05:45:00Z",
      "images": []
    },
    {
      "habitId": "exercise",
      "status": "skipped",
      "justification": "Feeling unwell",
      "completedAt": null,
      "images": ["media/2026-02-16_exercise_1.jpg"]
    }
  ],
  "tasks": [
    {
      "id": "t-001",
      "title": "Buy groceries",
      "islamicTimeSlot": "after_dhuhr",
      "status": "done",
      "completedAt": "2026-02-16T13:20:00Z",
      "images": []
    },
    {
      "id": "t-002",
      "title": "Call dentist",
      "islamicTimeSlot": "before_asr",
      "status": "shifted",
      "shiftedTo": "2026-02-17",
      "shiftReason": "Office was closed"
    }
  ]
}
```

- Atomic writes (write to `.tmp` then rename) to prevent corruption.
- `PersistenceService.loadDay(date)`, `saveDay(date, data)`, `appendHabitStatus(...)`, `appendTask(...)`.

---

## 5. Task Summary Response Format

When the user asks for tasks, respond grouped by Islamic timing:

```
📋 *Tasks for Monday, 16 Feb 2026*

🌅 *After Fajr*
  1. ☑️ Quran Reading (done)
  2. ⬜ Morning Adhkar (pending)

☀️ *Before Dhuhr*
  3. ⬜ Buy groceries (pending)

🌤️ *After Dhuhr*
  (none)

🌇 *Before Maghrib*
  4. ⬜ Exercise (pending)

🌙 *After Isha*
  5. ⬜ Review daily progress (pending)

Reply with "done [number]" or "shift [number] to [day]"
```

---

## 6. Task Shifting Logic

- **Same week:** `"shift 3 to tomorrow"` / `"shift 3 to thursday"` — moves the task to that day's file.
- **Justification:** `"shift 3 to tomorrow because office closed"` — saves reason.
- **Audio/text:** Both supported; audio is transcribed first.
- **Validation:** Cannot shift to a past date. System confirms: `"Moved 'Buy groceries' to Tue 17 Feb. ✅"`
- Shifted tasks appear in the target day's file with `origin: "2026-02-16"` for traceability.

---

## 7. Directory Structure

```
project-root/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── messaging/
│   │   ├── messaging.interface.ts
│   │   ├── messaging.module.ts
│   │   ├── baileys/
│   │   │   └── baileys-messaging.service.ts
│   │   └── dto/
│   │       └── messages.dto.ts
│   ├── habit/
│   │   ├── habit.module.ts
│   │   ├── habit.service.ts
│   │   └── habit.schema.ts
│   ├── task/
│   │   ├── task.module.ts
│   │   ├── task.service.ts
│   │   └── task.schema.ts
│   ├── reminder/
│   │   ├── reminder.module.ts
│   │   └── reminder.service.ts
│   ├── prayer-time/
│   │   ├── prayer-time.module.ts
│   │   └── prayer-time.service.ts
│   ├── audio/
│   │   ├── audio.module.ts
│   │   └── audio.service.ts
│   ├── image/
│   │   ├── image.module.ts
│   │   └── image.service.ts
│   ├── conversation/
│   │   ├── conversation.module.ts
│   │   ├── conversation.service.ts
│   │   └── intent-parser.service.ts
│   ├── persistence/
│   │   ├── persistence.module.ts
│   │   └── persistence.service.ts
│   └── config/
│       └── configuration.ts
├── data/
│   ├── habits/           # Habit definition JSON files
│   │   ├── quran-reading.json
│   │   ├── exercise.json
│   │   └── ...
│   ├── days/             # Daily log files (auto-generated)
│   │   ├── 2026-02-16.json
│   │   └── ...
│   └── media/            # Received images & audio
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .env
```

---

## 8. Configuration (`.env`)

```env
# WhatsApp
MESSAGING_PROVIDER=baileys           # swap to another implementation key
WHATSAPP_SESSION_DIR=./data/session

# Location (for prayer times)
LATITUDE=30.7865
LONGITUDE=31.0004
PRAYER_CALC_METHOD=egyptian          # egyptian | mwl | isna | karachi | etc.

# Audio / STT
STT_PROVIDER=whisper-api             # whisper-api | whisper-local
OPENAI_API_KEY=sk-...

# Paths
HABITS_DIR=./data/habits
DAYS_DIR=./data/days
MEDIA_DIR=./data/media

# User
MY_PHONE_NUMBER=20xxxxxxxxxx         # only respond to this number
```

---

## 9. Key NPM Dependencies

| Package | Purpose |
|---------|---------|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | NestJS framework |
| `@nestjs/schedule` | Cron / dynamic scheduled jobs |
| `@nestjs/config` | Environment config |
| `@whiskeysockets/baileys` | WhatsApp Web multi-device API |
| `adhan` | Islamic prayer time calculation |
| `openai` | Whisper STT (if using OpenAI) |
| `uuid` | Generate task IDs |
| `date-fns` | Date manipulation |
| `zod` | Runtime validation of habit/task JSON schemas |

---

## 10. Flow Diagrams

### 10.1 Incoming Message Flow

```
WhatsApp Message
      │
      ▼
MessagingService (Baileys)
      │
      ├── Text ──────► ConversationService.handleText()
      │                     │
      │                     ├── IntentParser → route to correct handler
      │                     ├── TaskService (add/done/shift/list)
      │                     └── HabitService (mark done/skipped)
      │
      ├── Audio ─────► AudioService.transcribe()
      │                     │
      │                     └── → ConversationService.handleText() (re-entry)
      │
      └── Image ─────► ImageService.save()
                            │
                            └── ConversationService.askTaskSelection()
                                     │
                                     └── User replies → link image to task/habit
```

### 10.2 Reminder Flow

```
Midnight (or app start)
      │
      ▼
ReminderService.scheduleDailyReminders()
      │
      ├── PrayerTimeService.getTodayTimes()
      ├── HabitService.getAll()
      │
      ▼
For each habit:
      │
      ├── Schedule START reminder at islamicTimeSlot
      │       │
      │       └── MessagingService.sendButtons("Time for X!", [Done, Skip])
      │
      └── Schedule BEFORE-END reminder at (slot + duration - N min)
              │
              └── MessagingService.sendButtons("X ends soon!", [Done, Skip])
```

---

## 11. Edge Cases & Decisions

| Scenario | Decision |
|----------|----------|
| User sends message outside any active habit window | Treat as task-related or general query |
| Habit reminder goes unanswered | Mark as `pending`; include in nightly summary |
| Task shifted multiple times | Allow; track full shift chain via `origin` field |
| Audio transcription fails | Reply: "Sorry, couldn't understand the audio. Please try text." |
| Unrecognized intent | Reply: "I didn't understand. You can say: tasks, add task, done, shift, or send an image." |
| Multiple habits in the same slot | Send separate reminders; each tracked independently |
| App restarts mid-day | Re-calculate remaining reminders; skip past ones |
| Image sent with no active tasks | Save image, reply with all habits list, let user pick |

---

## 12. Future Enhancements (Out of PoC Scope)

- LLM-based intent parsing for more natural conversations.
- Weekly/monthly analytics and habit streaks sent as summaries.
- Database backend (SQLite or PostgreSQL) replacing file-based storage.
- Multi-user support.
- Web dashboard for habit configuration.
- Integration with calendar apps.
- Recurring task templates.
- Location-aware prayer time auto-detection.
