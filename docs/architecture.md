# Duke — Architecture

**Date:** 12 Oct 2026
**Status:** Decisions locked — ready for the build plan
**Written for:** me (simple English, short sentences)
**Related:** `docs/ai-english-friend-plan.md` (product plan), `docs/stitch-design-prompts.md` (UI)

---

## 1. What this document is

This is the **shape of the system** — which parts exist, what each part does, which
framework and database we use, and the rules that keep the code clean.

The app is **Duke**: a phone-call style English practice app. You create **characters**
(your named AI friends), call them, and talk out loud.

---

## 2. Decisions (locked)

From the product plan:

| # | Decision | Answer |
|---|---|---|
| 1 | GPU or 100% online? | **100% online (API).** No GPU, no model hosting. |
| 2 | Hours per month? | **Under 16 h** → fits free plans → **$0**. |
| 3 | One voice or one per role? | **One voice per character** (Azure, 400+ voices). |
| 4 | How far does Savage mode go? | **Playful only. Never real insults.** |

From the architecture discussion:

| # | Decision | Answer |
|---|---|---|
| 5 | Language | **TypeScript everywhere** — web, API and voice agent share one domain package. |
| 6 | Database | **Supabase** (Postgres + Auth + Storage + pgvector in one free service). |
| 7 | Repo shape | **Monorepo** — `apps/` + `packages/`. |
| 8 | Auth | **Anonymous device ID first**, real login later. |
| 9 | Where the server runs | **My own VPS.** The API and the voice agent are pushed to my VPS. No Vercel/Fly needed. |
| 10 | Backend framework | **NestJS** for the API (modules + dependency injection). The voice agent stays a plain TS worker. Frontend is Next.js only. |

---

## 3. The big picture

**Duke has two backends, not one.** This is the most important idea in this document.

```
        ┌──────────────── Phone / browser ────────────────┐
        │  Next.js PWA (React + Tailwind)                 │
        │  the 8 screens  +  LiveKit client (mic+speaker) │
        └──────┬───────────────────────────────┬──────────┘
               │ HTTPS (normal API)            │ WebRTC (live audio)
               ▼                               ▼
   ┌───────────────────────┐      ┌──────────────────────────────┐
   │ NestJS API ("office") │      │ LiveKit Cloud (free 1,000 min)│
   │ characters, sessions, │      │  one room = one phone call   │
   │ memory, auth          │      └───────────────┬──────────────┘
   └──────────┬────────────┘                      │ agent joins room
              │                                   ▼
              │                  ┌─────────────────────────────────┐
              │                  │ VOICE AGENT ("the actor")       │
              │                  │ Deepgram → Groq → Azure + barge-in
              │                  └───────────────┬─────────────────┘
              ▼                                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ CORE (domain + use-cases) — shared, no framework             │
   └───────┬───────────────────────────────────────────┬──────────┘
           ▼                                           ▼
   ┌──────────────────────┐                ┌─────────────────────────┐
   │ Postgres (Supabase)  │                │ Redis (Upstash)         │
   │ characters, sessions │                │ live memory, prompt +   │
   │ turns, corrections   │                │ audio cache, rate limits│
   └──────────────────────┘                └─────────────────────────┘
```

| Part | Nickname | Job |
|---|---|---|
| Next.js app | **the office** | Shows screens, saves data, gives the phone a call token. |
| LiveKit room | **the phone line** | Carries live audio both ways. |
| Voice agent | **the actor** | Listens, thinks, and speaks with emotion. |
| Postgres | **the memory** | Stores everything permanently. |
| Redis | **the desk** | Holds things that are needed *right now*, fast. |

> **Why two backends?** The API is short requests (open a page, save a session).
> The agent is a **long, live process** that must stay on the call for minutes.
> Different jobs, different shapes — so we keep them separate.

---

## 4. Stack (frameworks and why)

| Part | Choice | Why this one |
|---|---|---|
| Frontend | **Next.js (React) + Tailwind CSS v4** | UI **only** now (the API moved to NestJS). Runs on my VPS. Easy PWA (install to the phone home screen). Tailwind matches our design tokens directly. |
| Components | **shadcn/ui** (Radix + Tailwind) | Accessible building blocks — button, dialog, sheet, select, switch, tabs. The code lives **in our repo**, so we own and edit it. |
| Server state | **TanStack Query** | Fetching and caching characters, sessions, history, usage. Loading / error / retry handled in one place. |
| UI state | React state (small) | Things that are **not** server data: mic on/off, open sheet, live waveform. Keep it tiny. |
| API | **NestJS** (REST) | Modules + **dependency injection**. The DI container is exactly what binds our *ports* to real adapters. Guards for auth and rate limits, DTO validation, Swagger for free. |
| Voice agent | **LiveKit Agents (TypeScript)** | Lets web + agent share the same domain code. |
| Real-time audio | **LiveKit Cloud** (WebRTC) | Handles echo cancelling, turn detection, barge-in and bad mobile networks — all the hard parts. |
| STT (ears) | **Deepgram** | Fast streaming, $200 free credit. |
| LLM (brain) | **Groq** | Very fast first token, free tier. |
| TTS (voice) | **Azure Speech F0** | 500k chars/month free, 400+ voices, 50+ emotion styles. |
| Database | **Supabase Postgres** | Relational + `pgvector` + Auth + Storage, one free dashboard. |
| ORM | **Drizzle** | Typed, light, SQL-first, clean migrations. |
| Cache | **Upstash Redis** | Serverless, 10k commands/day free. |
| Validation | **Zod** | One schema shared by API + agent + web forms. |
| Language | **TypeScript** (strict) | One language, shared types, fewer bugs. |
| Package manager | **pnpm workspaces** | Fast monorepo, strict dependencies. |

### Design tokens → shadcn CSS variables

The pen file (`duke.pen`) and the code must speak the same language. shadcn works with CSS
variables (`--background`, `--primary`, ...). Map them **once** in `globals.css` and never
hardcode a hex in a component.

| Our pen token | Hex | shadcn variable | Used for |
|---|---|---|---|
| `$bg` | `#0B0F12` | `--background` | page background |
| `$card` | `#131A1F` | `--card`, `--popover` | panels, dropdowns, sheets |
| `$card-2` | `#182026` | `--secondary`, `--accent`, `--muted` | raised rows, hover / selected |
| `$line` | `#242E35` | `--border`, `--input` | borders, input outlines |
| `$ink` | `#E7EEF0` | `--foreground`, `--card-foreground` | main text |
| `$ink-2` | `#7C8A92` | `--muted-foreground` | labels, hints, `// LABELS` |
| `$accent` | `#5CE0A0` | `--primary`, `--ring` | brand green: active + focus ring |
| `$accent-ink` | `#06231A` | `--primary-foreground` | text / icon **on** green |
| `$danger` | `#E5484D` | `--destructive` | end call, delete |
| `$ember` | `#F08A3C` | `--warning` *(custom)* | Savage mode, cautions |
| `$sage` | `#5AB4D6` | `--info` *(custom)* | secondary accent |
| `$moss` | `#7BE8A8` | `--success` *(custom)* | success states |
| `$font-display` | Space Grotesk | `.font-display` | headings |
| `$font-body` | IBM Plex Sans | `.font-body` | body text |
| `$font-mono` | IBM Plex Mono | `.font-mono` | technical `// LABELS` |

> ⚠️ **Name trap.** Our green is called `$accent`, but in shadcn **`--accent` means something
> else**: it is the *hover / selected background* inside menus (a plain dark surface).
> So our green → shadcn `--primary`, and shadcn `--accent` → our `$card-2`.
> Get this wrong and every dropdown glows bright green on hover.

> **How it is declared.** Duke has **no light mode**. There is no `.dark` block — every value
> lives in `:root`, and `<html class="dark">` exists only so `dark:` utilities still resolve.
> The palette is written **once** as `--duke-bg`, `--duke-card`, `--duke-accent`, … and then
> mapped onto the shadcn names in the table above. A component may read either, and the source
> of truth (`duke.pen`) stays obvious instead of being buried under shadcn's names.
>
> This also keeps the real `--accent` collision visible in code rather than silent.

**Corner radius** — the pen uses a tight **3-step scale**, stored as pen variables so it
cannot drift:

| Pen token | Value | Tailwind | Used for |
|---|---|---|---|
| `$radius-pill` | fully round | `rounded-full` | chips, toggles, segmented controls, waveform bars, avatars, round buttons |
| `$radius-control` | `12px` | `rounded-md` / `rounded-lg` | buttons, rows, inputs, corrections, small tiles |
| `$radius-card` | `20px` | `rounded-xl` / `rounded-2xl` | cards, panels, sheets |

shadcn normally derives six radius steps from `--radius`, which would put buttons on `9.6px`
and cards on `16.8px` — neither is on our scale. So `globals.css` **pins** the steps instead:

```css
--radius: 12px;     /* base, kept for anything reading it directly */
--radius-md: 12px;  /* $radius-control */
--radius-lg: 12px;  /* $radius-control — shadcn's Button defaults to rounded-lg */
--radius-xl: 20px;  /* $radius-card */
--radius-2xl: 20px; /* $radius-card */
```

The shadcn `Button` uses `rounded-lg` at normal sizes and `min(--radius-md, 12px)` at small
sizes, so **every** button lands on the 12px control token. Circles (avatars, round buttons)
are squares using `$radius-pill`, so they need no extra token.

---

## 5. Repo structure (monorepo)

```
duke/
  apps/
    web/                  # Next.js: the 8 screens (UI only)          (delivery)
      src/app/            # routes, layout.tsx, globals.css (design tokens)
      src/components/ui/  # shadcn/ui components (we own them)
      src/components/     # providers (QueryProvider) + the Duke screens
      src/lib/api/        # TanStack Query hooks (useCharacters, useSessions, ...)
      src/lib/livekit/    # the call client (mic + speaker)
    api/                  # NestJS: the REST API ("the office")        (delivery)
      src/modules/        # characters, sessions, calls, usage, auth
      src/main.ts         # HTTP server
    agent/                # the voice worker ("the actor")            (delivery)
      src/main.ts         # joins the room, runs the voice loop
  packages/
    core/                 # THE HEART — pure TypeScript, no I/O
      domain/             # entities and rules
      application/        # use-cases and ports (interfaces)
    adapters/             # Deepgram, Groq, Azure, LiveKit, Drizzle, Redis
    shared/               # types, config, logger, errors
  infra/
    docker-compose.yml    # local Postgres + Redis
    migrations/           # SQL
  docs/                   # this folder
```

`apps/*` are the **delivery** layer — the only places that touch the outside world.
`packages/core` is the **brain** — the only place that knows the rules.

---

## 6. Clean architecture — the one rule

```
delivery (apps/web, apps/api, apps/agent) → adapters → core
                                              ↑
                                   core imports NOTHING outward
```

- `core` does not know that LiveKit, Groq, Azure or Postgres exist.
- `core` talks to the outside world only through **ports** (plain TypeScript interfaces).
- `adapters` implement those ports with real services.
- **NestJS is the delivery layer for the API**, and its dependency-injection container is
  where the wiring happens:
  `{ provide: CHARACTER_REPOSITORY, useClass: DrizzleCharacterRepository }`.
  Swap that class and the whole app changes provider — `core` is untouched.

**Why we do this:** if we switch Azure → Cartesia later, we write **one new adapter**.
The rules, screens and API don't change at all. That is how we stay cheap **and** flexible.

### Ports (interfaces that live in core)

| Port | What it means | Real adapter |
|---|---|---|
| `SpeechToText` | turn my voice into text | Deepgram |
| `Brain` | think and answer | Groq |
| `Voice` | turn text into emotional speech | Azure |
| `Transport` | carry live audio | LiveKit |
| `CharacterRepository` | save/load characters | Drizzle + Postgres |
| `SessionRepository` | save/load sessions and turns | Drizzle + Postgres |
| `Cache` | fast temporary storage | Upstash Redis |
| `Clock` | "now" (so we can test time) | system clock |

### Domain entities (the words of Duke)

| Entity | Meaning |
|---|---|
| `Character` | a named friend: name, role, personality, voice, accent, feedback style, avatar |
| `Session` | one phone call |
| `Turn` | one thing said — by you or by the character |
| `Correction` | `said → fixed` plus the rule name |
| `VocabularyItem` | a new word and its meaning |
| `MemoryCard` | the short "what we talked about" note loaded into a new call |
| `VoiceStyle` | mood (`cheerful`, `angry`, ...) → Azure style. **A rule, not UI code.** |
| `SavageGuard` | rule: playful only, never real insults |
| `BudgetGuard` | rule: stop before we burn a free tier |

### Use-cases (the verbs)

`CreateCharacter` · `UpdateCharacter` · `ListCharacters`
`StartCall` · `EndCall` · `ContinueSession` · `SwitchCharacter`
`BuildPrompt` · `SummarizeSession` · `CheckBudget`

> **The payoff:** "savage safety" and "free-tier budget" are **domain rules**, not random
> `if` statements in a button. They cannot be skipped by accident.

---

## 7. Data model (Postgres)

```
users(id, created_at, ...)

characters(id, user_id, name, role, personality, voice_id, accent,
           feedback_style, avatar_url, default_topic, created_at)

sessions(id, character_id, user_id, started_at, ended_at, duration_sec,
         topic, summary, mood)

turns(id, session_id, idx, speaker, text, created_at)

corrections(id, session_id, turn_id, said, fixed, note)

vocabulary(id, session_id, word, meaning)

memories(id, character_id, session_id, kind, content, embedding vector(1536))

usage_ledger(id, user_id, month, stt_sec, tts_chars, llm_tokens)
```

| Table | Why it exists |
|---|---|
| `characters` | the friends you create (name + role + voice + personality) |
| `sessions` | every call, with its summary |
| `turns` | the transcript, saved at the end of the call |
| `corrections` / `vocabulary` | what to show on the Session Detail screen |
| `memories` | long-term recall; `embedding` lets us fetch *relevant* old moments |
| `usage_ledger` | counts seconds and characters → powers **`BudgetGuard`** |

---

## 8. Caching (Redis) — speed and money savings

| Key | Holds | Why | TTL |
|---|---|---|---|
| `session:{id}:turns` | last ~12 turns | instant context mid-call, no DB hit | 2 h |
| `char:{id}:prompt` | the built system prompt | build once, not every turn | 1 h |
| `tts:{hash(text+voice+style)}` | audio bytes | **never pay Azure twice for the same sentence** | 30 d |
| `ratelimit:{user}` | counter | protect the free tiers | 1 min |
| `usage:{user}:{month}` | seconds + chars | show "X hours left" | 1 month |

The **TTS audio cache** is the quiet win: greetings, fillers ("hmm", "nice!") and repeated
corrections are served from Redis and cost **0 Azure characters**.

---

## 9. The voice loop (one turn, end to end)

```
you speak ─► Deepgram (STT) ─► Groq (LLM) ─► Azure (TTS) ─► you hear it
   ~0 ms        ~150–300 ms      ~200–500 ms    ~150–250 ms   ≈ 0.8–1.5 s total
                        ▲
            MemoryCard + character prompt + feedback style
```

1. LiveKit sends your mic audio to the agent.
2. **VAD** decides when you stopped talking (tuned so it does not cut you off).
3. Deepgram streams the words.
4. `BuildPrompt` (core) puts together: character personality + memory card + feedback style.
5. Groq answers — **short**, like a phone call — and starts with a **mood tag** (`[[cheerful]]`).
6. `VoiceStyle` (core) maps the mood tag to an **Azure `mstts:express-as` style**.
7. Azure streams the emotional voice back into the room.
8. **Barge-in:** if you start talking, the agent stops instantly (LiveKit handles it).

> If the AI ever feels slow, the first thing to tune is the **VAD silence delay** and
> the **LLM reply length** — not the infrastructure.

---

## 10. Memory — "continue an old session" in 3 tiers

| Tier | Where | Size | Loaded when |
|---|---|---|---|
| Working | Redis | last ~12 turns | during the call |
| Session | Postgres | topic + summary + mistakes + new words | when you tap **Continue** |
| Long-term | Postgres + pgvector | facts about you, per character | later (optional) |

Tapping **Continue** starts a **new call**, but the prompt gets a small `MemoryCard`.
We never reload the whole old transcript → it stays fast and free.

---

## 11. Security rules

| Rule | Why |
|---|---|
| **All API keys live on the server/agent only.** | The browser must never see Deepgram, Groq or Azure keys. |
| The browser gets only a **short-lived LiveKit token** from our API. | A leaked token expires and only opens one room. |
| **Rate-limit every user** (Redis). | Stops one person burning a shared free tier. |
| **`SavageGuard` filters output.** | Playful teasing only; never insults about looks, family, identity or intelligence. |
| **Do not send private data to free tiers** (Gemini free trains on data). | Keep private text out of providers that train on input. |
| Row-level security in Supabase. | A user can only read their own characters and sessions. |

---

## 12. Cost guardrails ($0 plan)

| Piece | Free host | Limit |
|---|---|---|
| Web + API | **my own VPS** | already paid for |
| DB + Auth + Storage | Supabase | 500 MB |
| Cache | Upstash Redis | 10k commands/day |
| Audio rooms | LiveKit Cloud | 1,000 min/month |
| STT | Deepgram | $200 credit |
| LLM | Groq | free tier |
| Voice | Azure F0 | 500k chars/month |

`BudgetGuard` runs **before** a call starts and again before TTS: it checks remaining
minutes/characters and **degrades gracefully** (shorter replies, cached audio) instead of
ever crossing into a paid tier by accident.

### Where "the actor" runs (decided)

The agent is a **long-running worker**. It connects **outward** to LiveKit, which means
**no inbound ports are needed** on the server — perfect for a VPS.

**Decision:** the API and the voice agent run on **my own VPS** (Docker Compose).
The only external services are the free APIs (LiveKit Cloud, Deepgram, Groq, Azure).
No Vercel, no Fly, no cold starts.

| Where | What runs there |
|---|---|
| **My VPS** | Next.js app + REST API, the voice agent worker, Caddy (HTTPS) |
| **Supabase (free)** | Postgres + pgvector + Auth |
| **Upstash (free)** | Redis |
| **LiveKit Cloud (free)** | the audio rooms |
| **Deepgram / Groq / Azure** | ears / brain / voice |

> Only inbound ports **22, 80, 443** need to be open on the VPS. The agent talks out.

---

## 13. Fallbacks (what if a service is down?)

| Broken | Fallback |
|---|---|
| Azure TTS | Switch the `Voice` adapter to another provider (Cartesia / OpenAI) — **one file**. |
| Deepgram | Use another STT behind the same `SpeechToText` port. |
| Groq | Same `Brain` port → another LLM provider. |
| LiveKit | Text-only practice mode (type instead of talk). |
| Redis down | Read/write straight to Postgres (slower, still works). |

Because core talks to **ports**, every fallback is an adapter swap, not a rewrite.

---

## 14. Environment variables (names only — never commit values)

```
# runtime
NODE_ENV
LOG_LEVEL
LOG_DIR
LOG_RETENTION_DAYS
API_PORT
WEB_ORIGIN

# data
DATABASE_URL
REDIS_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # server only
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN

# providers
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
DEEPGRAM_API_KEY
GROQ_API_KEY
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION
```

`.env.example` is committed and holds every name with an empty value, so anyone can
set the project up. `.env` itself is git-ignored.

Rule: anything without `NEXT_PUBLIC_` stays on the server. **Never** put a provider key in
the browser.

---

## 15. Build roadmap

| Milestone | Goal | Done when |
|---|---|---|
| **M0 — Skeleton** | Monorepo + core domain + ports + local Postgres/Redis | `pnpm test` runs, types pass |
| **M1 — One free call** | LiveKit room + agent + Deepgram + Groq + Azure | you can talk to one character |
| **M2 — Characters + emotion** | create character, voice per role, mood tag → Azure style | two characters sound different |
| **M3 — Memory** | save sessions, Continue button, memory card | an old talk continues naturally |
| **M4 — App UI** | the 8 dark-console screens wired to the API | full app on the phone |
| **M5 — Safety + budget** | SavageGuard, BudgetGuard, rate limits, usage screen | cannot cross into paid |

---

## 16. Open questions (later, not now)

- Real login (Supabase Auth) or stay anonymous forever?
- Long-term memory with pgvector — how much is enough?
- Offline / text-only mode for bad connections?
- A tiny always-on host, or keep the actor on my own PC?
- When practice grows past 16 h/month — Azure paid (~$0.77/h) or Cartesia (~$1.80/h)?

---

## 17. Logging (backend)

A voice app is hard to debug: the failure is usually "the answer sounded wrong", not a crash.
So every event the API and the agent produce is written as **one JSON line**.

| Piece | Choice | Why |
|---|---|---|
| Library | **pino** | fastest structured logger for Node |
| Output 1 | **stdout** | Docker / the log collector owns shipping |
| Output 2 | **`logs/<service>.<date>.log`** | one file per day, so history survives a restart |
| Format | JSON in production, pretty in development | `NODE_ENV` decides |
| Level | `LOG_LEVEL` (`debug` in dev, `info` in prod) | change behaviour without editing code |
| Rotation | **pino-roll**, daily | e.g. `duke-api.2026-10-12.1.log` |
| Archive | gzip into `logs/archive/*.gz`, delete after `LOG_RETENTION_DAYS` | finished days stop costing disk |

`logs/` is in `.gitignore`. On the VPS, point `LOG_DIR` at a **mounted volume**, otherwise the
files die with the container.

### Every line carries

`time`, `level`, `service` (`duke-api` / `duke-agent`), `env`, and for HTTP:
`requestId`, `method`, `url`, `statusCode`, `responseTime`.

### One id follows one request

`x-request-id` is read from the caller, or created, then echoed back to the client and attached
to every log line for that request — including the error body. The user reports one id and we can
find the whole story.

### Never written (redacted automatically)

`authorization`, `cookie`, `set-cookie`, `x-api-key`, and any `password` / `token` / `secret` /
`apiKey` / `apiSecret` field. pino replaces them with `[redacted]` **before** the line is written,
so it cannot be forgotten at a call site.

### The rules

1. **Log events, not sentences.** `logger.info({ sessionId, durationSec }, "call ended")`.
2. **Log at the edges** — HTTP in/out, provider calls, DB writes. `core` stays silent: it is pure.
3. **Health checks are not logged.** Probes would fill the file with noise.
4. **Transcripts are `debug`, never `info`.** The user's private speech is not for the default log.
5. **Never log a secret**, not even "temporarily". Redaction is the safety net, not the plan.

### Nest is included

`PinoLoggerService` sends Nest's own output through the same pino instance, so framework startup
lines and our logs share one format, one level and one file — instead of two streams.

### Archiving

`startLogMaintenance()` runs once at boot and then every 6 hours:

1. gzip every log file whose date is **not** today → `logs/archive/<name>.log.gz`
2. delete those originals
3. delete archives older than `LOG_RETENTION_DAYS` (default 14)

Today's file is never touched — pino still has it open. A failed pass is logged and ignored;
log housekeeping must never take the app down.

---

## 18. Word list (added words)

| Word | Simple meaning |
|---|---|
| **Port** | An interface the core uses to talk to the outside world |
| **Adapter** | The real implementation of a port (Deepgram, Azure, ...) |
| **Domain** | The pure rules of the app (no frameworks) |
| **Monorepo** | One repository holding several apps and packages |
| **pgvector** | A Postgres add-on that stores "meaning numbers" for smart search |
| **WebRTC** | The system that carries live audio over the internet |
| **Barge-in** | You can interrupt the AI while it is talking |
| **Cold start** | The few seconds a sleeping server needs to wake up |
| **pino** | A fast logger that writes one JSON line per event |
| **Structured log** | A log line with named fields, so a tool can search it |
| **Redaction** | Removing secrets from logs automatically |
| **Rotation** | Starting a new log file (here: every day) |
| **Request id** | A tag that ties all the log lines of one request together |
| **Retention** | How long old archives are kept before deletion |
