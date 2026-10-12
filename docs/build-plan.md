# Duke — Build Plan

**Date:** 12 Oct 2026
**Status:** Ready to build — plan only, no code yet
**Written for:** me (simple English, step-by-step)
**Related:** `docs/architecture.md` (the shape), `docs/ai-english-friend-plan.md` (the product)

---

## 0. How to read this plan

- Work goes in **milestones** (M0 → M5). Finish one before starting the next.
- Every milestone has a **"Done when…"** line. If it is not true, the milestone is not done.
- Every step says **what to do**, **the command**, and **the check**.
- Nothing here needs a credit card. The only money is **the VPS I already have.**

**The golden rule while building:**
> Do the smallest thing that proves the idea works. One character. One voice. One call.

---

## 1. Accounts and keys (do this first)

Open all of these and keep the keys in one safe place. **Never commit keys to git.**

| # | Service | What for | Free limit | What to copy |
|---|---|---|---|---|
| 1 | **LiveKit Cloud** | the phone line (rooms) | 1,000 min/month | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| 2 | **Deepgram** | ears (STT) | $200 credit | `DEEPGRAM_API_KEY` |
| 3 | **Groq** | brain (LLM) | free tier | `GROQ_API_KEY` |
| 4 | **Azure Speech** | voice (TTS, F0 free) | 500k chars/month | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| 5 | **Supabase** | Postgres + Auth | 500 MB | `SUPABASE_URL`, anon key, service key |
| 6 | **Upstash** | Redis (cache) | 10k cmds/day | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| 7 | **My VPS** | runs the server | — | SSH access, a domain name |

**Done when:** all keys are saved in a password manager, and none of them are in the repo.

> Tip: create the keys **one service at a time** and test it before moving on (see M1).
> A key that "probably works" costs hours later.

---

## 2. Where everything runs

```
        Phone (browser)
          │                    │
     HTTPS│                    │WebRTC
          ▼                    ▼
   ┌─────────────────┐   ┌──────────────┐
   │  MY VPS         │   │ LiveKit Cloud│
   │  Caddy (HTTPS)  │   └──────┬───────┘
   │  Next.js (web)  │          │ agent joins
   │  NestJS (api)   │          │
   │  Voice agent ───┼──────────┘
   └────┬───────┬────┘
        ▼       ▼
   Supabase   Upstash
   (Postgres)  (Redis)
```

| Inbound ports on the VPS | Why |
|---|---|
| **22** | SSH |
| **80 / 443** | the website + API (Caddy gets the HTTPS certificate automatically) |

The voice agent makes **outbound** connections only. No extra ports, no firewall pain.

---

## 3. Tools on my machine (and on the VPS)

| Tool | Where | Why |
|---|---|---|
| **Node.js 22 LTS** | PC + VPS | runs everything |
| **pnpm** | PC + VPS | the monorepo package manager |
| **Docker + Compose** | PC + VPS | local Postgres/Redis, and the deploy |
| **Git** | PC | version control |
| **shadcn CLI** (`npx shadcn@latest`) | PC | copies UI components into the repo |
| **Caddy** | VPS | free automatic HTTPS |
| **ffmpeg** *(optional)* | PC | check audio files while debugging |

**Done when:** `node -v`, `pnpm -v`, `docker -v` all answer on my PC.

---

## 4. The order of work (one picture)

| Milestone | Goal | Rough size |
|---|---|---|
| **M0** | Skeleton: monorepo + core + ports (no real calls yet) | small |
| **M1** | One real free call: talk to one character | medium |
| **M2** | Characters + emotion: many roles, many voices | medium |
| **M3** | Memory: save sessions, "Continue" an old talk | medium |
| **M4** | The 8 screens wired to the API | large |
| **M5** | Safety + budget + deploy to the VPS | medium |

---

## M0 — Skeleton

**Goal:** the repo exists, the rules live in `core`, nothing talks to the internet yet.

### Steps
1. Create the workspace.
   ```bash
   mkdir duke && cd duke
   git init
   pnpm init
   ```
2. Add `pnpm-workspace.yaml` with `apps/*` and `packages/*`.
3. Add TypeScript strict config + shared `tsconfig.base.json`.
4. Create the folders:
   ```
   apps/web   apps/api   apps/agent
   packages/core/{domain,application}
   packages/adapters  packages/shared
   infra
   ```
5. **Frontend foundation** (in `apps/web`) — ✅ done:
   - Scaffold Next.js (App Router, TypeScript) + **Tailwind CSS v4**.
   - `npx shadcn@latest init` (CSS variables).
   - Re-map the **token → CSS variable** table from `architecture.md §4`. The CLI writes
     its own **light** theme into `:root` — we overwrite all of it. Duke is dark only, so
     there is no `.dark` block; the palette is declared as `--duke-*` and mapped to the
     shadcn names (this is what dodges the `--accent` collision).
   - Load the 3 fonts (Space Grotesk, IBM Plex Sans, IBM Plex Mono) and add the
     `.font-display` / `.font-body` / `.font-mono` classes.
   - Pin the radius steps to the pen scale (see the notes table below).
   - Add the **TanStack Query** provider (`QueryClientProvider`) in the root layout.
6. **Backend foundation** (in `apps/api`) — **logging comes first**:
   - **Logging** (see `architecture.md §17`): pino to stdout **and** `logs/<service>.<date>.log`,
     request ids, secret redaction, and a gzip archive of finished days. The agent uses the
     same logger, so one conversation can be traced in one file.
   - NestJS app, compiled with plain `tsc` (no Nest CLI — see the notes below).
   - Add one module per area: `characters`, `sessions`, `calls`, `usage`, `auth`.
   - Bind adapters to ports with DI providers (see `architecture.md §6`).
   - `GET /api/health` returning `{ ok: true }`.
7. Write the **ports** in `packages/core/application/ports.ts`
   (`SpeechToText`, `Brain`, `Voice`, `Transport`, `CharacterRepository`,
   `SessionRepository`, `Cache`, `Clock`).
8. Write the first **entities** in `packages/core/domain`
   (`Character`, `Session`, `Turn`, `Correction`, `MemoryCard`).
9. Add `infra/docker-compose.yml` for local Postgres (with pgvector) + Redis.
10. Add a test runner (Vitest) and one test per domain rule.

### Done when…
- `pnpm -r typecheck` passes.
- `pnpm test` runs and one domain test is green.
- `docker compose up -d` gives a local Postgres + Redis.
- the Nest API answers `GET /api/health` with `{ ok: true }`.
- a normal request writes a JSON line with a `requestId` into `logs/`, while
  health checks stay out of the file.
- `.env.example` lists every variable, and `logs/` is git-ignored.
- `core` imports **nothing** from `apps/` or a provider SDK.
- a shadcn `Button` on a test page is **exactly our green** on our dark `--background`
  (proof the tokens are wired, not the shadcn default grey).

### Notes from the scaffold (gotchas already solved)

| Thing | Decision | Why |
|---|---|---|
| Nest CLI | **not used** — `tsc` + `node dist/main.js` | `@nestjs/cli` needs TypeScript's programmatic API; TS 7 ships `tsc` only. `emitDecoratorMetadata` still works, so Nest DI is fine. |
| TypeScript | pinned at the **workspace root (7.x)** | Nest 12 requires >= 6. TS 6+ **removed `baseUrl`** and now needs an explicit **`rootDir`**. |
| pnpm build scripts | `onlyBuiltDependencies: ["esbuild"]` | pnpm 10 blocks postinstall scripts by default, which silently breaks vitest. |
| API dev loop | two scripts: `dev` (`tsc --watch`) + `serve` (`node --watch dist/main.js`) | gets us live reload without another dependency. |
| Log files | `logs/` is **git-ignored**; the folder is created at runtime | daily files are local state, not source. On the VPS `LOG_DIR` must point at a mounted volume. |
| `.env.example` | **committed**, all keys present with empty values | so anyone cloning the repo knows exactly what to configure. `.env` is ignored. |
| `shadcn init` flags | `--base radix -p nova` — base **colour** is no longer a flag | shadcn v5 renamed `-b` to mean the *component library* (radix/base/aria) and moved colours into presets. Without `-p` it hangs on an interactive menu. |
| shadcn v5 style | imports `shadcn/tailwind.css`, `cn` from the **`cn`** package, `radix-ui` (not `@radix-ui/react-*`) | the `radix-nova` style ships its keyframes and variants from the `shadcn` package instead of copying them into `globals.css`. |
| Duke palette | declared as `--duke-*`, **then** mapped to the shadcn names | avoids the `--accent` trap, and keeps `duke.pen` readable as the source of truth. |
| Corner radius | steps **pinned** (`--radius-md/lg: 12px`, `--radius-xl/2xl: 20px`) | shadcn derives 6 steps from `--radius`; the derived values (9.6px buttons, 16.8px cards) are off our 3-token scale. |
| Dark mode | no `.dark` block — everything lives in `:root` | Duke has no light mode, so nothing to switch. `<html class="dark">` is kept only so `dark:` utilities resolve. |

---

## M1 — One real free call

**Goal:** I say "hello", one character answers out loud with emotion. One row of code per service.

### M1.1 — The phone line (LiveKit)
1. Create a LiveKit Cloud project, copy the 3 keys.
2. In Nest, add `POST /calls/start` → returns a **short-lived room token**.
3. Test with LiveKit's own sample app first (so we know the keys are good).

**Check:** two browser tabs can hear each other in a room. ✅

### M1.2 — The ears (Deepgram)
1. Write `adapters/deepgram/DeepgramStt.ts` implementing `SpeechToText`.
2. Test alone: send a recorded wav file, print the text.

**Check:** the transcript of my test file is correct. ✅

### M1.3 — The brain (Groq)
1. Write `adapters/groq/GroqBrain.ts` implementing `Brain`.
2. Test alone: send "Say hi in 5 words", print the answer.

**Check:** the answer comes back in under ~1 second. ✅

### M1.4 — The voice (Azure, with emotion)
1. Write `adapters/azure/AzureVoice.ts` implementing `Voice`.
2. Test alone: send "Oh nice, you finally said that right!" with style `cheerful`,
   save the mp3, listen.

**Check:** I can hear the emotion in the mp3. ✅

### M1.5 — Connect them (the actor)
1. Scaffold `apps/agent` with the **LiveKit Agents (TypeScript)** quickstart.
2. Tell it: STT = Deepgram, LLM = Groq, TTS = Azure.
3. Start the agent → join a room → talk.

How `apps/agent` is built (the shape that was chosen):

| File | What it does |
|---|---|
| `main.ts` | `defineAgent` (VAD prewarm + `entry`), the per-call wiring, and `cli.runApp` |
| `brief.ts` | reads `duke:session:<id>:brief` from Redis — the session id is in the room name |
| `azure-tts.ts` | Azure as a LiveKit `tts.TTS`; wraps the `Voice` port from `@duke/adapters` |
| `duke-agent.ts` | the `voice.Agent` subclass; overrides `llmNode` to strip the mood tag |
| `mood-filter.ts` | that override, as a `TransformStream` over the token stream |
| `recorder.ts` | turns → Postgres, usage → Redis counters |

Run it with **`node dist/main.js start`** (or `pnpm --filter @duke/agent serve` in watch mode).
The `start` is the LiveKit CLI's own subcommand. Without it the CLI prints its help and exits,
so a bare `node dist/main.js` looks like it did nothing at all.

Two things the agent deliberately does **not** do:

- It does not build the prompt. `StartCall` in the API renders it once and leaves it in Redis,
  so there is one implementation of the personality rules and the two cannot drift.
- It does not talk to the browser. It only makes **outbound** connections, so it needs no open
  port on the VPS.

**Done when:** I speak → the character answers in an emotional voice, and I can
interrupt it while it talks (barge-in), with no more than ~1.5 s delay.

---

## M2 — Characters and emotion

**Goal:** many characters, each with its own voice and personality.

### M2.1 — Save characters (DB + API)
- `POST /api/characters`, `GET /api/characters`, `PATCH /api/characters/:id`.
- Drizzle schema for `characters`.

### M2.2 — The role prompt (the "brain" text)
This is the heart of the personality. Put it in `core/application/BuildPrompt.ts`.

```
You are {name}, my English-speaking friend.
Role: {role}.
Personality: {personality}.
Speak like a real phone call: 1-3 short sentences, natural, warm.

Rules:
- Always answer in English, at my level, and keep it simple.
- Start EVERY reply with one mood tag in double brackets, like [[cheerful]].
  Choose from: cheerful, calm, excited, sad, angry, whisper, teasing,
  serious, friendly, curious, surprised, sympathetic.
- Feedback style is "{feedbackStyle}":
    just talk      → do not correct me, just keep the conversation going
    quiet tips     → correct me gently, and only the important mistakes
    correct aloud  → correct my mistakes clearly, then continue
- Never write long paragraphs. This is a phone call, not an essay.
- If I roleplay, stay in character until I say "stop".
```

### M2.3 — The voice for each role (map)
> ⚠️ These voices must be **confirmed against Azure's live voice list** before we trust them.
> Not every voice supports every emotion style — the code must fall back to default.

| Role | Voice | Feeling |
|---|---|---|
| Friend (default) | `en-US-AriaNeural` | warm, casual |
| English teacher | `en-US-JennyNeural` | clear, patient |
| Senior developer | `en-US-GuyNeural` | calm, confident |
| Coffee barista | `en-US-JasonNeural` | young, friendly |
| Job interviewer | `en-US-TonyNeural` | serious, formal |
| Savage friend | `en-US-DavisNeural` | funny, teasing |
| British friend | `en-GB-RyanNeural` | native UK accent |

### M2.4 — Mood tag → Azure style (the emotion bridge)
`core/domain/VoiceStyle.ts` holds this map. The agent strips the tag and sends SSML.

| Mood tag | Azure style | Degree |
|---|---|---|
| `cheerful` | `cheerful` | 1.2 |
| `excited` | `excited` | 1.3 |
| `sad` | `sad` | 1.0 |
| `angry` | `angry` | 0.9 |
| `whisper` | `whispering` | 1.0 |
| `friendly` | `friendly` | 1.1 |
| `serious` | *(default, no style)* | — |
| `calm` | *(default, no style)* | — |
| `teasing` | *(default, no style)* | — |
| `curious` | *(default, no style)* | — |
| `surprised` | `excited` | 0.8 |
| `sympathetic` | *(default, no style)* | — |

Example SSML the `AzureVoice` adapter builds:

```xml
<speak version="1.0" xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="en-US-AriaNeural">
    <mstts:express-as style="cheerful" styledegree="1.2">
      Oh nice, you finally said that right!
    </mstts:express-as>
  </voice>
</speak>
```

### M2.5 — Switch character mid-call
- Switch = swap the voice + the prompt in the running session (`SwitchCharacter` use-case).
- "Keep the same voice" toggle = skip the voice swap.

**Done when:** two characters sound clearly different, and the emotion is audible in both.

---

## M3 — Memory ("continue an old session")

**Goal:** Duke remembers what we talked about.

### Steps
1. **Save a session.** On call end: write `sessions` + all `turns`.
2. **Summarize.** One extra LLM call (cheap) that returns JSON:
   ```json
   { "topic": "job interview practice",
     "summary": "We practised past tense and small talk.",
     "mistakes": ["I finish → I finished", "He don't → He doesn't"],
     "newWords": ["shipped", "deadline", "code review"] }
   ```
   Save it, and save `corrections` + `vocabulary` rows.
3. **Build a MemoryCard** in core (small, max ~150 words).
4. **Continue.** `POST /sessions/:id/continue` → new call + the MemoryCard is
   added to the prompt. **Never** reload the whole transcript.
5. **Working memory.** Keep the last ~12 turns in Redis during the call.

**Done when:** ending a call saves it, History shows it, and "Continue" starts a new
call where the character clearly remembers the old topic.

---

## M4 — The 8 screens (wire the UI)

**Goal:** the dark-console design becomes a real app.

### Steps
1. **Design system is already wired** from M0 (tokens → CSS variables, fonts, shadcn).
   Use **shadcn/ui** components everywhere — don't hand-build buttons, sheets or toggles.
2. **Data hooks first.** In `lib/api/` write one **TanStack Query** hook per resource:
   - reads: `useCharacters`, `useCharacter`, `useSessions`, `useSession`, `useUsage`
   - writes: `useCreateCharacter`, `useUpdateCharacter`, `useStartCall`, `useEndCall`

   Every screen uses these hooks. **No raw `fetch` inside a screen** — loading, errors and
   retries live in the hooks.
3. Build the screens in this order — **each one wired before the next**:

| # | Screen | shadcn pieces | TanStack Query |
|---|---|---|---|
| 1 | Home | Card, Button, Avatar, Badge | `useCharacters` |
| 2 | Create Character | Input, Textarea, Select, Switch | `useCreateCharacter` |
| 3 | Active Call | Button, Avatar, ScrollArea | `useStartCall` / `useEndCall` |
| 4 | Switch Character | **Sheet**, RadioGroup, Switch | `useSwitchCharacter` |
| 5 | Reading Practice | Card, Button, Progress | `useCharacters` |
| 6 | History | Card, Badge, ScrollArea | `useSessions` |
| 7 | Session Detail | Card, Badge, Separator, **Dialog** | `useSession` |
| 8 | Settings | Switch, Select, RadioGroup, Dialog | `useUsage` |

4. Use **Sonner** (shadcn's toast) for "character saved", "call ended", and errors.
5. Add the **PWA** bits: `manifest.json` + icons, so it installs on the phone.

> ⚠️ **Match the pen, not the shadcn default.** Right after `init`, shadcn looks neutral
> grey with soft corners. Set `--primary`, `--radius` and the dark values from the token
> table in `architecture.md §4`, or the app will look like "shadcn", not like Duke.
> Remember the name trap: our green is `--primary`, **not** `--accent`.

**Done when:** I can create a character on my phone and have a full call, start to finish.

### What was built (and the two places the plan above was wrong)

Sonner was **not** used. It is a toast library, and Duke's errors are not toasts: a failed call
start, a missing key and a rejected form all need to sit on the screen until they are dealt
with, next to the thing that caused them. So errors are inline (`ErrorNote`) and the API's own
`problems[].problem` — which is already written for a human — is what gets shown.

`Select` was not used either; the voice and correction pickers are **RadioGroup**, because a
menu hides the options and there are only 3–7 of each.

Routes, which is the real shape of the app:

| Route | Screen | Reads | Writes |
|---|---|---|---|
| `/` | Home | `useCharacters`, `useSessions(1)`, `useSetup` | — |
| `/crew` | Crew + Switch Character sheet | `useCharacters` | `useDeleteCharacter` |
| `/create` | Create / Edit friend | `useCharacter` | `useCreateCharacter`, `useUpdateCharacter` |
| `/call/[characterId]` | Active Call | — | `useStartCall`, `useEndCall` |
| `/practice` | Reading practice | — | — (the phone's own speech engine) |
| `/history` | History | `useSessions` | — |
| `/history/[id]` | Session Detail | `useSession` | — |
| `/settings` | Settings | `useUsage`, `useSetup` | — |
| `/setup` | Keys checklist | `useSetup` | — |

Four notes that are easy to get wrong:

1. **The browser only ever calls `/api` on its own origin.** A rewrite in `next.config.ts`
   forwards it to the API in development; Caddy does it in production. No API base URL, no
   CORS, and the API's address never reaches the browser bundle.
2. **A call is started by the call screen, not by Home.** Home navigates to
   `/call/<friendId>`; that screen does the `POST /calls`. A room token therefore never appears
   in a URL, in the back button, or in a link someone could share.
3. **Starting a call is idempotent.** React double-invokes effects in development; without the
   `call !== null` guard the app would open two rooms and bill two agents.
4. **The tab bar has four items, and a call is not one of them.** A call takes the whole phone,
   so it renders outside the shell that owns the tab bar.

---

## M5 — Safety, budget, and deploy

### M5.1 — SavageGuard (kind teasing only)
- Put the rule **in the prompt** *and* check the output.
- **Allowed:** teasing the mistake, funny exaggeration about the sentence, playful jokes.
- **Never:** looks, family, identity, religion, intelligence, or anything cruel.
- If the filter catches a bad line → **rewrite it once**, then fall back to a safe reply.

> Silent note: *I am the only user for now*, but the rule is written in the domain so it
> can never be skipped later.

### M5.2 — BudgetGuard (never cross into paid)
| Limit | Value | Action at 90% |
|---|---|---|
| LiveKit | 1,000 min/month | warn, shorten replies |
| Azure | 500k chars/month | warn, serve more from the **TTS audio cache** |
| Per call | 30 min max | soft stop with a friendly goodbye |

Also: a `usage_ledger` row per call, and cache greetings/fillers in Redis so they cost
**0 Azure characters**.

### M5.3 — Deploy to the VPS
1. SSH in. Create a user, update the system.
2. Install Docker + Compose.
3. `git clone` the repo to `/opt/duke`.
4. Put the secrets in `/opt/duke/.env` (never in git).
5. `docker compose up -d --build` → web + API + agent.
6. Point the domain at the VPS; **Caddy** gets the HTTPS certificate by itself.
7. Firewall: allow **22, 80, 443** only (`ufw`).
8. Add `GET /api/health` and a simple uptime check.
9. Backup: Supabase handles the DB backup (or a nightly `pg_dump` if self-hosted).
10. Update flow: `git pull && docker compose up -d --build`.

**Done when:** I open my domain on my phone, create a character, and have a call —
with the agent running on **my VPS**, and no service asking for money.

### What was built (and what the plan did not know)

**SavageGuard, second line of defence.** `checkSavage` existed in core and was never called.
It is now wired into the reply stream in `apps/agent/src/savage-filter.ts`:

- The check runs on **sentences**, not tokens. A reply is spoken as it arrives, so the unit has
  to be complete *and* early; a sentence is exactly what the Azure plugin already waits for
  before it synthesises, so the guard costs no delay a listener can hear.
- It runs **only for a savage character**. `checkSavage` is deliberately blunt, and a friendly
  teacher saying "I hate that construction" is a good sentence that the hostility rule would
  flag. Outside savage mode the prompt never asked for roasting, so the guard is off.
- A flagged sentence becomes `SAFE_FALLBACK_LINE`, in the same voice, and the reason is logged.
  Asking the model to try again would mean a second round trip with the microphone open.
- `MoodTagStripper` and the guard both rebuild chunks, so the two shared helpers moved to
  `apps/agent/src/reply-chunk.ts` — usage totals, tool calls and flush sentinels have to survive
  both filters, and that is easier to see in one file than in two.

The sentence splitter is the part that needed tests (`savage-filter.test.ts`, 9 of them, and the
first run found a real bug). Streamed replies contain `3.5`, `e.g.` and `Mr.`, and all three look
like a full stop; splitting there hands the guard half a sentence, which is worse than not
splitting at all. Three rules decide it: a digit before the stop is a decimal, a word with a dot
inside it is `e.g.`, and a single letter or a listed abbreviation is `Mr.`. The test suite had to
assert on the **pieces that come back**, not the joined text, because buffering is invisible once
the text is concatenated — and buffering is the feature.

**The tables had no creation step.** `schema.ts` described eight tables and nothing anywhere
created them, so the first query on a fresh database would have failed with "relation users does
not exist". `packages/adapters/drizzle.config.ts` + `pnpm run db:push` now derive the DDL from the
schema file: no committed migration folder to drift, and `schema.ts` stays the only copy of the
truth. Verified offline with `drizzle-kit generate`, which read the schema and wrote correct DDL
for all 8 tables; the file was then deleted, because `push` is the workflow.

**A deploy that is four containers, not three.** The plan said "web + API + agent" and skipped
the front door. `docker-compose.prod.yml` adds Caddy, which is what makes the domain work and is
why there is no CORS anywhere in Duke: one origin, `/api/*` to Nest, everything else to Next —
the same two rules as the development rewrite in `next.config.ts`, one file each.

**`pnpm doctor` cannot be called `pnpm doctor`.** pnpm ships its own `doctor` command, and it
takes the name silently: bare `pnpm doctor` prints nothing and exits 0, which is the worst
possible failure for a diagnostic tool. It is `pnpm run doctor`, and the reason is written down
in both `docs/deploy.md` and the script.

**The per-call cap had a rule and no enforcer.** `checkBudget` has a `callMinutes: 30` branch and
nothing ever passed a non-zero `currentCallSeconds`, so it was dead at runtime — a call left open
would sit there spending the month's LiveKit minutes. The call screen now applies it
(`CALL_CAP_SECONDS`, read from `DEFAULT_BUDGET_LIMITS` in `@duke/core`, not copied): at 30 minutes
it ends the call through the same `finish()` the hang-up button uses, so the learner gets the
end-of-call notes, and the sheet says why. Two minutes before, the timer area says how much is
left. It is in the browser on purpose: that screen is the only thing that knows a call is still
open, and a second way to end a call is a second way to leave one half-closed. The honest limit is
that a client cannot be forced — but the monthly minutes are enforced by the API, which is what
bounds the cost.

**Two tables are shaped and deliberately unused:** `memories` (semantic memory is on the "do not
build yet" list) and `usage_ledger` (a durable monthly mirror of the Redis counters). The Redis
counters are the live source of truth and already feed the budget guard and the Settings screen.
Writing the ledger would mean a tenth port, an adapter and a use-case for a number Redis already
holds, in the call-shutdown path — the most fragile place in the system — and it would be
unverifiable without a real database. It is a one-place change when there is a reason for it; the
reason would be Upstash losing a counter, which has not happened.

Also: the PWA manifest and the app icon (so the phone can install it instead of opening a tab),
and `DEEPGRAM_MODEL` defaulted to `nova-3` in the agent — it said `nova-2` while the adapter, the
key list and `.env.example` all said `nova-3`.

**One silent failure found by reading the SDK.** The API creates each room with
`RoomAgentDispatch({ agentName })`, and the agents SDK decides the worker's own name like this:
`LIVEKIT_AGENT_NAME_OVERRIDE`, else the `agentName` option, else `LIVEKIT_AGENT_NAME`, else the
**empty string**. Duke passed no `agentName`, and `.env.example` happens to set
`LIVEKIT_AGENT_NAME=duke`, so it worked — until someone blanked that line, at which point the
worker registers unnamed, the dispatch by name finds nobody, and the call connects, plays, and is
answered by silence. No error on either side. The agent now passes `agentName` explicitly from
`DEFAULT_AGENT_NAME` in `@duke/adapters`, the same constant the dispatch uses: the two ends cannot
disagree, whatever is in the environment.

> Not verified: **the images were never built.** No Docker engine was available. The Dockerfiles
> take the conservative shape (Debian not Alpine, `--frozen-lockfile`, the runtime stage doing its
> own `--prod` install instead of copying a pnpm symlink tree), and any mistake in them is a
> build or start error that names the file. `docs/deploy.md` §6 says this on the page the person
> deploying will read.

---

## 5. The whole plan on one page

- [ ] **Keys** — LiveKit, Deepgram, Groq, Azure, Supabase, Upstash
- [ ] **M0** — monorepo + core + ports + local Postgres/Redis
- [ ] **M1** — LiveKit ✅ → Deepgram ✅ → Groq ✅ → Azure ✅ → connect the actor
- [ ] **M2** — characters + role prompt + voice map + mood → style + switch
- [ ] **M3** — save sessions + summarizer + MemoryCard + Continue
- [ ] **M4** — the 8 screens, wired one by one + PWA
- [ ] **M5** — SavageGuard + BudgetGuard + deploy to the VPS

---

## 6. Risks (and the plan for each)

| Risk | What we do |
|---|---|
| Azure voice list is not what we guessed | Confirm voices **in M2.1** before wiring the map |
| A voice does not support a style | Code checks a per-voice style list → falls back to default |
| Delay feels too long | Tune the VAD silence delay and shorten LLM replies |
| We hit a free limit | `BudgetGuard` warns at 90% and degrades gracefully |
| A provider goes down | Swap the adapter (ports make this a one-file change) |
| VPS goes down | The app is stateless; restart with `docker compose up -d` |
| Keys leak | Keys live only in `.env` on the server + password manager |

---

## 7. What we do NOT build (yet)

- Real login (anonymous device ID is enough at first)
- Payments / subscriptions
- A mobile native app (the PWA is enough)
- Self-hosting any AI model (decision 1: 100% online)
- Long-term semantic memory with pgvector (nice, but later)

---

*Next step after this plan: scaffold the repo (M0) — only after I say "go".*
