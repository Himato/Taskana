# 🕌 Taskana — WhatsApp Habits & Tasks Manager

A personal WhatsApp-based assistant that manages daily habits and tasks using Islamic prayer times as the scheduling backbone. Built with NestJS, TypeScript, and OpenAI.

> **Status:** Proof of Concept

---

## What It Does

Send a WhatsApp message → Taskana understands what you need → it acts on it.

```
You:     ضيف تاسك اشتري خضار بعد الضهر
Taskana: ✅ تم إضافة "اشتري خضار" بعد الظهر

You:     مهامي
Taskana: 📋 مهام الإثنين ١٦ فبراير
         🌅 بعد الفجر
           1. ☑️ قراءة القرآن (done)
           2. ⬜ أذكار الصباح (pending)
         ☀️ بعد الظهر
           3. ⬜ اشتري خضار (pending)
         ...

You:     [🎤 voice note: "shift task 3 to tomorrow, the shop is closed"]
Taskana: ✅ Moved "اشتري خضار" to Tue 17 Feb.

You:     [📷 sends a photo]
Taskana: Which habit or task does this relate to?
         1. قراءة القرآن
         2. أذكار الصباح
         3. اشتري خضار
```

### Core Capabilities

- **Habit reminders** tied to Islamic prayer times (after Fajr, before Dhuhr, after Maghrib, etc.)
- **Task management** via natural text or voice — create, complete, skip, shift, list
- **Bilingual AI** — understands Arabic, English, and mixed Egyptian dialect
- **Voice notes** transcribed via OpenAI Whisper, then processed as text
- **Image tagging** — send a photo and link it to a habit or task
- **Daily logs** saved as JSON files — one file per day, fully auditable
- **All interaction happens in WhatsApp** — no web UI, no app to install

---

## Architecture at a Glance

```
WhatsApp ←→ Messaging Abstraction (Baileys) ←→ Event Bus
                                                   │
              ┌────────────────────────────────────┤
              │              │              │       │
         Conversation   Reminder      Persistence  │
           + OpenAI     Scheduler     (JSON files)  │
              │              │                      │
         ┌────┴────┐    Prayer Time            Media Store
      Whisper   GPT Intent                   (images/audio)
       (STT)   Classification
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Requirements & Design](docs/requirements-design.md) | Full system requirements, module breakdown, data schemas, flow diagrams, and edge case decisions |
| [OpenAI Integration](docs/openai-integration-design.md) | Whisper STT pipeline, GPT-powered intent classification, prompt design, confidence tiers, cost optimization |
| [Messaging Module](docs/messaging-module-design.md) | WhatsApp abstraction interface, Baileys implementation, event system, reconnection strategy, fake service for testing |
| [Developer Conventions](docs/conventions.md) | Code style, naming, DI patterns, error handling, testing, git workflow, Arabic string management |

> **Read the conventions file before writing any code.** It's the source of truth for how we build.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS 10+ (TypeScript, strict mode) |
| WhatsApp | @whiskeysockets/baileys (multi-device) |
| AI — Intent | OpenAI GPT-4o-mini (primary), GPT-4o (escalation) |
| AI — Speech | OpenAI Whisper API |
| Prayer Times | adhan (npm) |
| Scheduling | @nestjs/schedule |
| Validation | zod |
| Storage | File system (JSON) |

---

## Prerequisites

- Node.js ≥ 18 LTS
- A WhatsApp account (personal number for the PoC)
- OpenAI API key with Whisper + Chat access
- A phone to scan the QR code on first run

---

## Quick Start

### 1. Clone & install

```bash
git clone <repo-url>
cd taskana
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
MY_PHONE_NUMBER=20xxxxxxxxxx       # your WhatsApp number (country code, no +)
OPENAI_API_KEY=sk-...              # OpenAI API key
LATITUDE=30.7865                   # your location (for prayer times)
LONGITUDE=31.0004
PRAYER_CALC_METHOD=egyptian        # or: mwl, isna, karachi
```

### 3. Add habits

Create JSON files in `data/habits/`:

```bash
mkdir -p data/habits
```

```jsonc
// data/habits/quran-reading.json
{
  "id": "quran-reading",
  "name": "Quran Reading",
  "description": "Read 1 juz daily",
  "schedule": {
    "days": ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
    "islamicTimeSlot": "after_fajr",
    "durationMinutes": 30
  },
  "reminders": {
    "atStart": true,
    "beforeEnd": true,
    "beforeEndMinutes": 5
  },
  "requiresJustification": true
}
```

### 4. Run

```bash
npm run start:dev
```

A QR code will appear in your terminal. Scan it with WhatsApp (Linked Devices). Once connected, send a message to yourself and Taskana will respond.

### 5. Verify

Send any of these to your WhatsApp:

| Message | Expected |
|---------|----------|
| `مهامي` or `tasks` | Today's summary grouped by prayer time |
| `ضيف تاسك [name] بعد [prayer]` | Task created confirmation |
| `done 1` | Task marked complete |
| 🎤 Voice note | Transcribed and processed as text |
| 📷 Photo | Prompted to tag a habit/task |

---

## Project Structure

```
taskana/
├── src/
│   ├── messaging/          # WhatsApp abstraction + Baileys impl
│   ├── openai/             # Whisper STT + GPT conversation AI
│   ├── habit/              # Habit definitions loader
│   ├── task/               # Task CRUD + shifting logic
│   ├── reminder/           # Prayer-time-based reminder scheduler
│   ├── prayer-time/        # Islamic prayer time calculation
│   ├── conversation/       # Message routing + state machine
│   ├── image/              # Image receipt + tagging flow
│   ├── persistence/        # JSON file read/write
│   ├── common/             # Shared utils, messages, exceptions
│   ├── config/             # Typed environment config
│   ├── app.module.ts
│   └── main.ts
├── data/
│   ├── habits/             # Habit definition files (you create these)
│   ├── days/               # Daily logs (auto-generated)
│   ├── media/              # Downloaded images & audio
│   └── session/            # WhatsApp session (auto-generated)
├── docs/                   # Design documents
│   ├── requirements-design.md
│   ├── openai-integration-design.md
│   ├── messaging-module-design.md
│   └── conventions.md
├── test/                   # E2E / integration tests
├── .env.example
├── .eslintrc.js
├── .prettierrc
├── nest-cli.json
├── tsconfig.json
├── package.json
└── README.md               # ← you are here
```

---

## Data Storage

Everything is flat JSON files on disk. No database.

| Path | Content | Created by |
|------|---------|------------|
| `data/habits/*.json` | Habit definitions | You (manually) |
| `data/days/YYYY-MM-DD.json` | Daily log — habits + tasks + statuses | App (auto) |
| `data/media/*` | Downloaded images and audio | App (auto) |
| `data/session/` | WhatsApp auth credentials | Baileys (auto) |

Daily log example → see [Requirements & Design](docs/requirements-design.md#49-persistence-module).

---

## Scripts

```bash
npm run start:dev       # Development with hot reload
npm run start:prod      # Production build + run
npm run build           # Compile TypeScript
npm run lint            # ESLint check
npm run lint:fix        # ESLint auto-fix
npm run format          # Prettier
npm run test            # Unit tests
npm run test:watch      # Unit tests in watch mode
npm run test:cov        # Coverage report
npm run test:e2e        # End-to-end tests
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MY_PHONE_NUMBER` | **Yes** | — | Your WhatsApp number (e.g., `20xxxxxxxxxx`) |
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key |
| `MESSAGING_PROVIDER` | No | `baileys` | Messaging implementation to use |
| `WHATSAPP_SESSION_DIR` | No | `./data/session` | Baileys session storage path |
| `LATITUDE` | No | `30.7865` | Location latitude for prayer times |
| `LONGITUDE` | No | `31.0004` | Location longitude for prayer times |
| `PRAYER_CALC_METHOD` | No | `egyptian` | Prayer calculation method |
| `STT_PROVIDER` | No | `whisper-api` | Speech-to-text provider |
| `WHISPER_DEFAULT_LANG` | No | `ar` | Default language hint for Whisper |
| `HABITS_DIR` | No | `./data/habits` | Path to habit definition files |
| `DAYS_DIR` | No | `./data/days` | Path to daily log files |
| `MEDIA_DIR` | No | `./data/media` | Path to downloaded media |
| `NODE_ENV` | No | `development` | `development` for debug logs, `production` for warn |

---

## Contributing

1. Read [conventions.md](docs/conventions.md) first.
2. Branch from `main` using the naming convention: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`.
3. Write tests for your changes.
4. Ensure `npm run lint` and `npm run test` pass.
5. Open a PR with a description of what and why.

---

## License

MIT
