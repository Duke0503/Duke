# Duke — the keys I need from you

Duke is finished. It cannot talk yet, because it has no accounts to talk through.

This page is the whole list: **6 accounts, 9 values.** Nothing else is missing — every other line
in `.env.example` already has a working default and you never have to touch it.

Everything on this page is a **free tier**. There is no paid plan anywhere in Duke.

---

## 0. How to hand them over

**Do not paste the keys into the chat.** They are passwords.

1. In the project folder, copy the example file:
   `cp .env.example .env`
2. Open `.env` and paste each value on its line (they are in the same order as this page).
3. Save, then say **"done"** to me. I run `pnpm run doctor`, which checks every key and prints
   *whether* it is set and *whether it looks right* — never the value itself.

`.env` is git-ignored (checked: `git check-ignore .env` says so), so it is never pushed. The logger
also censors any field whose name looks like a secret (`apiKey`, `api_key`, `apiSecret`, `secret`,
`authorization`) before a line reaches stdout or a file, so a key cannot leak into `logs/` either.

If you would rather I never see the file at all, that is fine: run `pnpm run doctor` yourself and
paste **only what it prints** — the output is designed for exactly that.

---

## 1. The list at a glance

| # | Service | What it does for Duke | Values you need | Time |
|---|---|---|---|---|
| 1 | **Groq** | The brain (thinks up the reply) | `GROQ_API_KEY` | 2 min |
| 2 | **Deepgram** | The ears (your voice → text) | `DEEPGRAM_API_KEY` | 3 min |
| 3 | **Upstash** | Short-term memory + counters | `REDIS_URL` | 3 min |
| 4 | **Supabase** | The memory (characters, calls) | `DATABASE_URL` | 5 min |
| 5 | **LiveKit** | The phone line (live audio) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | 5 min |
| 6 | **Azure** | The voice (speaks with emotion) | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | 10 min |

Do them in that order. The first four take a few minutes each; **Azure is the slow one**, so leave
it for last.

---

## 2. One service at a time

### 1. Groq — https://console.groq.com

1. Sign up (Google or email). No card.
2. Left menu → **API Keys** → **Create API Key** → name it `duke` → **Submit**.
3. Copy the key. It starts with `gsk_` and is **shown once**.

```
GROQ_API_KEY=gsk_...
```

Leave `GROQ_MODEL=openai/gpt-oss-20b` as it is. It is the fastest model on the list, which is
what a phone call wants. If replies ever feel shallow, change it to `openai/gpt-oss-120b` — the
same model, bigger. Do not use `llama-3.3-70b-versatile`: it is retired, and a call would fail
the moment the character tried to think.

### 2. Deepgram — https://console.deepgram.com

1. Sign up. The account comes with free credit (`$200`), which is far more than you will use.
2. **API Keys** → **Create a Key** → name it `duke`, give it all the default permissions.
3. Copy the key (also **shown once**).

```
DEEPGRAM_API_KEY=...
```

### 3. Upstash — https://console.upstash.com

1. Sign up (Google or email). No card.
2. **Create Database** → name `duke` → pick the region closest to your VPS → type **Regional**.
3. Open the database → scroll to **Connect** → copy the **`rediss://` URL** (the TLS one).

```
REDIS_URL=rediss://default:...@...upstash.io:6379
```

> `rediss://` — with the extra `s`. That is the encrypted one. `redis://` is for a local Docker
> Redis on your own machine.

### 4. Supabase — https://supabase.com/dashboard

Duke uses Supabase for exactly one thing: **Postgres**. The API speaks to it directly, so the only
value you need is the **connection string**. The dashboard also shows a project URL and an API key
(`sb_publishable_...`, formerly `anon`) — those are for Supabase's own client libraries, and Duke
does not have one. If you are copying something that starts with `NEXT_PUBLIC_`, that is the wrong
page: those are for a browser, and Duke's database is only ever touched by the server.

1. Sign up, then **New project**. Name `duke`, choose a region, and set a **database password**
   (save it — you need it in a moment).
2. Wait about two minutes while the database starts.
3. **Connect** (top of the page, or Project Settings → Database) → the **Connection string** tab.
   There are two lines worth having, and the difference is the port:
   - **Transaction pooler, port `6543`** — this is `DATABASE_URL`, what the app runs on;
   - **Session pooler, port `5432`** — the same host, for one-off schema work.

```
DATABASE_URL=postgresql://postgres.xxxxx:YOUR-PASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
```

- Replace `YOUR-PASSWORD` with the password from step 1. If it contains `@`, `#`, `/` or `:`, reset
  it in Settings → Database to letters and numbers: those characters end the URL early, and the
  error you get for it names something else entirely.
- Use the **pooler** host, not `db.xxxxx.supabase.co`. New Supabase projects answer on IPv6 only at
  the direct host, which a VPS usually cannot reach, and the pooler is the thing that survives
  connections being recycled.
- `pnpm run db:push` is the one command that sends DDL, and DDL prefers the session pooler. If it
  ever refuses, put the other port in front of the command instead of editing the file — a real
  environment variable wins over `.env`, by design:

```powershell
$env:DATABASE_URL="postgresql://postgres.xxxxx:YOUR-PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"; pnpm run db:push
```

### 5. LiveKit — https://cloud.livekit.io

1. Sign up (GitHub is quickest), then **Create project**. Name `duke`, and pick the **free** plan.
2. Project → **Settings** → **Keys**.
3. Copy three things from that screen:
   - the **Project URL** — it starts with `wss://`
   - the **API Key**
   - the **API Secret**

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Leave `LIVEKIT_AGENT_NAME=duke` as it is. The API and the voice worker both use that name to find
each other — if they ever disagree, the call connects and nobody answers, which is the one silent
failure in the whole app, so do not rename it unless you rename it in both places (you do: it is
one line, and both ends read it).

### 6. Azure Speech — https://portal.azure.com

This is the voice, so it is worth doing slowly. It is also the only step that may ask for a card
(that is Azure's identity check — the **F0** plan itself does not charge).

1. Sign in or create an account.
2. **Create a resource** → search **Speech** → **Create**.
3. Fill the form:
   - **Region**: pick one near you, and remember the word (for example **East US**)
   - **Pricing tier**: choose **Free F0** ← this is the important one
4. **Create**, wait for the deployment, then **Go to resource**.
5. Left menu → **Keys and Endpoint**.
6. Copy **KEY 1** and the **Location** word.

```
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus
```

> **The region is a word, not a URL.** `eastus`, `westeurope`, `southeastasia`. Not
> `https://eastus.api.cognitive.microsoft.com` and not the resource name. Pasting the wrong shape
> here is the most common mistake in this whole setup, which is why `pnpm run doctor` checks it.
>
> One subscription can only have one **F0** Speech resource. If Azure says F0 is unavailable, take
> **S0** instead — it has the same 500,000 free characters a month, and Duke warns you at 90% of
> them before anything could be charged.

---

## 3. That is the 9

When they are in `.env`, this is the finish:

```bash
pnpm run doctor      # names anything missing or wrongly shaped, and asks Postgres and Redis to answer
pnpm run db:push     # creates the 8 tables in Supabase
pnpm --filter @duke/api start     # the API
pnpm --filter @duke/web dev       # the app on http://localhost:3000
```

On the VPS it is the same three commands, then the containers — see **`docs/deploy.md`**.

**Note:** `pnpm run doctor`, not `pnpm doctor`. pnpm ships its own `doctor` command and silently
takes the name: bare `pnpm doctor` prints nothing and exits 0.

---

## 4. Two lines that are not keys

| Line | When | Value |
|---|---|---|
| `API_ORIGIN` | only on the VPS | nothing to do — `docker-compose.prod.yml` sets it to `http://api:3001` |
| `DOMAIN` | only on the VPS | your domain, e.g. `duke.example.com`. Caddy uses it for the HTTPS certificate, so the domain has to point at the VPS first |

---

## 5. What the free tiers give you

Duke counts usage and stops before these end. The numbers are in `packages/core/src/domain/budget.ts`.

| Service | Free allowance | Guard in Duke |
|---|---|---|
| LiveKit | ~1,000 call minutes a month | a call ends by itself at **30 minutes**; a new call is refused once the month is gone |
| Azure Speech | 500,000 characters a month (~25 hours of talking) | at 90% the replies get shorter; at 100% speaking stops |
| Deepgram | `$200` credit | Deepgram's own dashboard |
| Groq | free rate limits | Groq's own dashboard |
| Supabase | 500 MB database | transcripts are small text — a long call is a few KB, so hundreds of calls fit |
| Upstash | 10,000 commands a day | counters are a handful of reads per call |

The worst case is a service that stops answering, never a bill: the free tiers are per-account and
do not upgrade themselves.
