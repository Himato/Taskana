# Developer Conventions

> **Living document.** Update this when the team agrees on a new convention.
> Last updated: 2026-02-16

---

## 1. Language & Runtime

| Rule | Detail |
|------|--------|
| TypeScript | Strict mode (`"strict": true` in `tsconfig.json`). No `any` unless explicitly justified with a `// eslint-disable-next-line` + comment. |
| Node.js | ≥ 18 LTS. Use built-in `fs/promises`, `crypto.randomUUID()`, `structuredClone()`. No polyfills. |
| NestJS | Latest v10+. Follow the official NestJS style — modules, providers, decorators. |
| ES target | `ES2022` — top-level await, `Array.at()`, `Object.hasOwn()` are all fair game. |

---

## 2. Project Structure

```
src/
├── <module-name>/
│   ├── <module-name>.module.ts          # NestJS module
│   ├── <module-name>.service.ts         # Primary service
│   ├── <module-name>.service.spec.ts    # Unit tests (co-located)
│   ├── interfaces/                      # Abstractions & types for this module
│   │   └── <name>.interface.ts
│   ├── dto/                             # Data transfer objects
│   │   └── <name>.dto.ts
│   ├── events/                          # Event classes emitted by this module
│   │   └── <name>.event.ts
│   ├── guards/                          # Guards scoped to this module
│   ├── prompts/                         # LLM prompt templates (conversation-ai only)
│   └── <implementation>/               # Concrete implementations (e.g., baileys/)
│       ├── <impl>.service.ts
│       └── <impl>.service.spec.ts
├── common/                              # Cross-cutting: decorators, pipes, filters, utils
│   ├── utils/
│   ├── filters/
│   └── decorators/
├── config/
│   └── configuration.ts                 # Typed config via @nestjs/config
├── app.module.ts
└── main.ts
```

### Rules

- **One module = one folder.** Never scatter a module's files across multiple top-level directories.
- **Co-locate tests.** `*.spec.ts` lives next to the file it tests, not in a separate `test/` tree. Integration / e2e tests go in `test/` at the project root.
- **Index barrels are optional.** Use them only when a module exports 4+ items. Never create barrel-of-barrels.
- **No circular imports.** If module A and module B need each other, extract the shared type into `common/` or use `forwardRef()` as a last resort with a `// TODO: remove forwardRef` comment.

---

## 3. Naming Conventions

### Files

| Type | Pattern | Example |
|------|---------|---------|
| Module | `kebab-case.module.ts` | `prayer-time.module.ts` |
| Service | `kebab-case.service.ts` | `baileys-messaging.service.ts` |
| Interface | `kebab-case.interface.ts` | `messaging-service.interface.ts` |
| DTO | `kebab-case.dto.ts` | `classified-intent.dto.ts` |
| Event | `kebab-case.event.ts` | `message-received.event.ts` |
| Test | `kebab-case.service.spec.ts` | `conversation-ai.service.spec.ts` |
| Prompt template | `kebab-case.ts` | `system-prompt.ts` |
| Constants | `kebab-case.constants.ts` | `messaging.constants.ts` |

### Code

| Construct | Convention | Example |
|-----------|------------|---------|
| Classes | `PascalCase` | `BaileysMessagingService` |
| Interfaces | `PascalCase`, prefixed with `I` only for service abstractions | `IMessagingService`, but `ClassifiedIntent` (no prefix for DTOs/types) |
| Types / Enums | `PascalCase` | `IslamicTimeSlot`, `IntentType` |
| Functions / methods | `camelCase` | `resolveRelativeDate()` |
| Variables / params | `camelCase` | `prayerTimes`, `targetDate` |
| Constants | `UPPER_SNAKE_CASE` for injection tokens and event names | `MESSAGING_SERVICE`, `MSG_EVENTS` |
| Env vars | `UPPER_SNAKE_CASE` | `OPENAI_API_KEY` |
| File-system paths | `kebab-case` directories, `YYYY-MM-DD.json` for day files | `data/days/2026-02-16.json` |

### Boolean naming

Booleans start with `is`, `has`, `should`, `can`, or `was`:

```typescript
// ✅
const isPtt = true;
const hasJustification = !!reason;
const shouldEscalate = confidence < 0.6;

// ❌
const ptt = true;
const justification = !!reason;
const escalate = confidence < 0.6;
```

---

## 4. Abstraction & Dependency Injection

### The Golden Rule

> **Depend on interfaces, not implementations.**

Every module that talks to an external system (WhatsApp, OpenAI, file system, prayer API) must define an interface and inject it via a **Symbol token**.

```typescript
// ✅ Correct — consumer depends on abstraction
constructor(@Inject(MESSAGING_SERVICE) private readonly messaging: IMessagingService) {}

// ❌ Wrong — consumer depends on concrete class
constructor(private readonly messaging: BaileysMessagingService) {}
```

### When to create an abstraction

- The implementation could change (messaging provider, STT engine, storage backend).
- You need a fake/mock in tests.
- The dependency crosses a module boundary.

### When NOT to abstract

- Internal helpers within a module (e.g., `BaileysMapperService` is internal to the baileys folder).
- Pure utility functions with no side effects.

---

## 5. Error Handling

### Throw or return — pick one per layer

| Layer | Strategy |
|-------|----------|
| **Services** | Throw typed exceptions. Never return `null` to signal failure. |
| **External API calls** (OpenAI, Baileys) | Wrap in try/catch, log the error, throw an app-level exception or return a safe default. |
| **Event handlers** (`@OnEvent`) | Catch internally. An uncaught error in an event handler crashes nothing but silently drops the event — always wrap in try/catch with logging. |
| **Message replies** | Never crash on a user message. Always reply with a graceful fallback. |

### Custom exceptions

```typescript
// common/exceptions/
export class TranscriptionFailedError extends Error {
  constructor(public readonly originalError: unknown) {
    super('Audio transcription failed');
    this.name = 'TranscriptionFailedError';
  }
}
```

- Extend `Error`, not NestJS `HttpException` (we have no HTTP layer).
- Include the original error for debugging.

### Logging

Use NestJS `Logger` scoped to the class:

```typescript
private readonly logger = new Logger(MyService.name);
```

| Level | Use for |
|-------|---------|
| `error` | Unrecoverable failures, external API errors |
| `warn` | Degraded behavior (fallback triggered, low confidence, reconnection) |
| `log` | Significant lifecycle events (connected, daily reminders scheduled) |
| `debug` | Message content, intent classification details, file I/O — verbose |

Never log sensitive data (full message bodies in production, API keys, session tokens).

---

## 6. Async Patterns

### Always `await`

```typescript
// ✅
await this.persistence.saveDay(date, data);

// ❌ Fire-and-forget — silent failures, race conditions
this.persistence.saveDay(date, data);
```

The only exception is intentional fire-and-forget (e.g., sending a read receipt), which must be annotated:

```typescript
// Intentional fire-and-forget: read receipt is non-critical
void this.socket.readMessages([rawMsg.key]);
```

### No nested callbacks

```typescript
// ❌
fs.readFile(path, (err, data) => {
  if (err) { ... }
  JSON.parse(data, (err2, obj) => { ... });
});

// ✅
const data = await fs.readFile(path, 'utf-8');
const obj = JSON.parse(data);
```

### Concurrent operations

Use `Promise.all` when operations are independent:

```typescript
const [prayerTimes, habits] = await Promise.all([
  this.prayerTimeService.getTodayTimes(),
  this.habitService.getAll(),
]);
```

---

## 7. Configuration

All configuration flows through `@nestjs/config` with a typed factory:

```typescript
// config/configuration.ts
export default () => ({
  whatsapp: {
    provider: process.env.MESSAGING_PROVIDER || 'baileys',
    sessionDir: process.env.WHATSAPP_SESSION_DIR || './data/session',
    myPhoneNumber: process.env.MY_PHONE_NUMBER,
  },
  location: {
    latitude: parseFloat(process.env.LATITUDE || '30.7865'),
    longitude: parseFloat(process.env.LONGITUDE || '31.0004'),
    calcMethod: process.env.PRAYER_CALC_METHOD || 'egyptian',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    sttProvider: process.env.STT_PROVIDER || 'whisper-api',
    defaultLang: process.env.WHISPER_DEFAULT_LANG || 'ar',
  },
  paths: {
    habits: process.env.HABITS_DIR || './data/habits',
    days: process.env.DAYS_DIR || './data/days',
    media: process.env.MEDIA_DIR || './data/media',
  },
});
```

### Rules

- **Never read `process.env` directly in services.** Use `ConfigService.get()` or inject the typed config.
- **Fail fast on missing critical config.** Validate at startup using `Joi` or `zod` schema in `ConfigModule.forRoot({ validationSchema })`.
- **No defaults for secrets.** `OPENAI_API_KEY` and `MY_PHONE_NUMBER` must be set or the app refuses to start.
- **Defaults are fine for paths and non-sensitive values.** Document every default in `.env.example`.

---

## 8. File I/O & Persistence

### Atomic writes

Never write directly to the target file. Write to a temp file, then rename:

```typescript
import { writeFile, rename } from 'fs/promises';

async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.${Date.now()}.tmp`;
  await writeFile(tmp, data, 'utf-8');
  await rename(tmp, filePath);
}
```

### JSON formatting

Pretty-print with 2 spaces for human-readable day files:

```typescript
JSON.stringify(data, null, 2);
```

### File locking

Not required for PoC (single process). If we ever go multi-process, use `proper-lockfile`.

### Path construction

Always use `path.join()` or `path.resolve()`:

```typescript
// ✅
import * as path from 'path';
const filePath = path.join(this.daysDir, `${date}.json`);

// ❌
const filePath = `${this.daysDir}/${date}.json`;
```

---

## 9. Event System Conventions

### Event naming

Dot-separated, lowercase: `<domain>.<entity>.<action>`

```
message.text.received
message.audio.received
message.sent
connection.state
reminder.fired
habit.completed
task.shifted
```

### Event class shape

```typescript
export class HabitCompletedEvent {
  constructor(
    public readonly habitId: string,
    public readonly date: string,
    public readonly completedAt: Date,
  ) {}
}
```

- Event classes are immutable (all `readonly`).
- Constructor params only — no methods, no logic.
- One event per file.

### Handler rules

- Every `@OnEvent` handler must be wrapped in try/catch.
- Handlers must not throw — a thrown error is silently swallowed by EventEmitter2 and the event is lost.
- Keep handlers thin: validate, then delegate to a service method.

```typescript
@OnEvent('message.text.received')
async handleText(event: TextMessageReceivedEvent): Promise<void> {
  try {
    await this.conversationService.processText(event.message);
  } catch (error) {
    this.logger.error(`Failed to handle text message: ${error.message}`, error.stack);
    await this.messaging.sendText(
      event.message.from,
      'عذراً، حدث خطأ. حاول مرة أخرى.',
    );
  }
}
```

---

## 10. LLM Prompt Conventions

### File organization

All prompts live in `<module>/prompts/` as exported `const` strings or template functions.

### Rules

- **Prompts are code.** They go through code review. Every change is a commit with a reason.
- **No inline prompts.** Never write a prompt string inside a service method. Extract to `prompts/`.
- **Template functions over string concatenation.** Use a function that takes typed params and returns the prompt string.
- **Version prompts.** When making significant prompt changes, add a comment with date and reason:

```typescript
/**
 * v2 — 2026-02-20
 * Added Arabic weekday resolution. Previous version missed "الخميس" → thursday.
 */
export const SYSTEM_PROMPT = `...`;
```

- **Test prompts.** Maintain a fixture file (`test/fixtures/intent-corpus.json`) with input/expected-output pairs. Run against real model on CI weekly.

---

## 11. Testing

### Test pyramid

```
         ╱╲
        ╱  ╲        E2E (test/)
       ╱    ╲       Few: full WhatsApp flow with FakeMessagingService
      ╱──────╲
     ╱        ╲     Integration (*.integration.spec.ts)
    ╱          ╲    Some: real OpenAI calls, real file I/O
   ╱────────────╲
  ╱              ╲  Unit (*.spec.ts)
 ╱                ╲ Many: mocked deps, pure logic
╱──────────────────╲
```

### Unit test rules

- Co-located: `habit.service.spec.ts` next to `habit.service.ts`.
- Mock all injected dependencies.
- Test one behavior per `it()` block.
- Use descriptive test names: `it('should shift task to next occurrence of the given weekday')`.

### Naming

```
describe('ConversationAiService')
  describe('classify')
    it('should detect task_create intent from Arabic input')
    it('should escalate to gpt-4o when confidence is below 0.6')
    it('should resolve "بكرة" to tomorrow ISO date')
```

### Test utilities

Use the `FakeMessagingService` for all tests that involve sending messages:

```typescript
const fake = new FakeMessagingService();
// ... run logic ...
expect(fake.getLastMessage().content.text).toContain('done');
```

### What to test vs. what to skip

| Test | Skip |
|------|------|
| Intent classification mapping | Baileys socket internals |
| Entity normalization logic | WhatsApp protocol details |
| Reminder scheduling calculations | QR code rendering |
| State machine transitions | OpenAI SDK internals |
| Atomic file write correctness | Third-party library behavior |

---

## 12. Git & Workflow

### Branch naming

```
feat/add-task-shifting
fix/reconnect-loop-on-timeout
refactor/extract-prayer-time-calc
docs/update-conventions
chore/upgrade-baileys
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(task): add shift-to-weekday support with Arabic day names
fix(messaging): handle deprecated buttons with text fallback
refactor(conversation): extract intent routing to handler map
test(reminder): add unit tests for edge-of-slot scheduling
docs: update messaging module design doc
chore: bump @whiskeysockets/baileys to 6.x
```

- Scope in parentheses matches the module name.
- Imperative mood ("add", not "added" or "adds").
- Body is optional but encouraged for non-trivial changes.

### PR rules

- Every PR must pass lint + unit tests.
- Design doc changes require a review from at least one other dev.
- Prompt changes require running the intent corpus test suite and including the accuracy report in the PR description.

---

## 13. Code Style & Linting

### ESLint + Prettier

```jsonc
// .eslintrc.js (key rules)
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",      // NestJS decorators break this
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": "error",                                          // use Logger, not console
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

```jsonc
// .prettierrc
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
```

### Import order

Enforced by `eslint-plugin-import`:

```typescript
// 1. Node built-ins
import * as path from 'path';
import * as fs from 'fs/promises';

// 2. External packages
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

// 3. Internal modules (absolute paths from src/)
import { IMessagingService } from '../interfaces/messaging-service.interface';
import { MESSAGING_SERVICE } from '../messaging.constants';

// 4. Relative imports (same module)
import { BaileysAuthService } from './baileys-auth.service';
```

Blank line between each group.

---

## 14. Documentation

### Code comments

- **Don't comment what the code does.** The code should be self-explanatory.
- **Do comment why.** Especially for workarounds, non-obvious decisions, and Baileys quirks.

```typescript
// ✅ Explains WHY
// Baileys swaps width/height internally for media thumbnails,
// so we pass dimensions in the opposite order.
const thumb = { width: msg.height, height: msg.width };

// ❌ Explains WHAT (redundant)
// Set the width to the message height
const thumb = { width: msg.height, height: msg.width };
```

### JSDoc

Required on:

- All interface methods.
- All public service methods.
- All event classes.

Not required on:

- Private methods (unless complex).
- Self-explanatory one-liners.

```typescript
/**
 * Classify the user's intent and extract structured entities.
 * Automatically escalates to a stronger model if confidence is low.
 *
 * @param message - Raw user text (post-transcription for audio)
 * @param context - Current conversation state and today's data
 * @returns Classified intent with extracted entities
 */
async classify(message: string, context: ConversationContext): Promise<ClassifiedIntent>;
```

### Design docs

- Stored in the repo root under `docs/`.
- Written in Markdown.
- Updated when the implementation diverges from the design.
- Each doc has a "Last updated" date at the top.

---

## 15. Arabic & i18n

### User-facing strings

All user-facing WhatsApp messages are centralized in a single file per language:

```
src/common/messages/
├── ar.ts       # Arabic (primary)
└── en.ts       # English (fallback)
```

```typescript
// common/messages/ar.ts
export const AR = {
  HABIT_REMINDER_START: (name: string) => `🕌 حان وقت *${name}*!\nرد بـ ✅ لما تخلص أو ❌ لو معملتش`,
  HABIT_REMINDER_END: (name: string, mins: number) => `⏳ *${name}* هيخلص بعد ${mins} دقيقة. عملته؟`,
  TASK_SHIFTED: (title: string, date: string) => `✅ تم نقل "${title}" لـ ${date}`,
  TRANSCRIPTION_FAILED: 'لم أتمكن من فهم الرسالة الصوتية. حاول تاني أو ابعت نص.',
  UNKNOWN_INTENT: 'مش فاهم قصدك. ممكن تقول: مهامي، ضيف مهمة، خلصت، أو ابعت صورة.',
  ERROR_GENERIC: 'عذراً، حدث خطأ. حاول مرة أخرى.',
} as const;
```

### Rules

- **Never hardcode Arabic strings in service files.** Import from the messages file.
- **Template function pattern** for strings with variables (not string concatenation).
- **RTL is not our problem** — WhatsApp handles bidirectional text rendering.

---

## 16. Security

| Rule | Detail |
|------|--------|
| **No secrets in code** | All secrets in `.env`, never committed. `.env` is in `.gitignore`. |
| **`.env.example`** | Committed with placeholder values. Always kept in sync with actual env vars. |
| **Single-user guard** | `MY_PHONE_NUMBER` whitelist is the primary access control. Every incoming message is checked. |
| **No eval / dynamic code execution** | Never `eval()`, `new Function()`, or `vm.runInContext()`. |
| **Sanitize file names** | Media files saved with sanitized names (strip path traversal, limit to alphanumeric + dash + dot). |
| **Dependency audit** | Run `npm audit` in CI. Fix critical/high vulnerabilities before merge. |

---

## 17. Performance Guidelines

- **Reminder scheduling:** Compute all daily reminders once at midnight (or app start), not per-message.
- **Prayer time calculation:** Cache per day. Recalculate only on date change.
- **OpenAI calls:** One call per message (intent + entities together). Never make two sequential calls when one structured call suffices.
- **File I/O:** Load the current day file into memory on first access, flush to disk on every write. Don't re-read for every query.
- **Message history:** Keep max 10 messages in the conversation context window. Trim oldest first.

---

## 18. Definition of Done

A feature is "done" when:

- [ ] Implementation follows the conventions in this document.
- [ ] Unit tests cover the happy path and at least one error path.
- [ ] No `any` types without justification.
- [ ] No `console.log` — use `Logger`.
- [ ] User-facing strings are in the messages file, not hardcoded.
- [ ] Design doc is updated if the feature changes the architecture.
- [ ] `npm run lint` passes with zero warnings.
- [ ] `npm run test` passes.
- [ ] PR description explains what and why.
