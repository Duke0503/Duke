# Duke — putting it on the VPS

This is the last page. When you finish it, you open your domain on your phone and talk.

Everything is already written. This page is only about **running** it.

---

## 1. Before you start

You need these five things. Nothing else.

| What | Where |
|---|---|
| A VPS with a public IP | where the three containers run |
| A domain, pointing at that IP | for HTTPS, so the phone can use the microphone |
| The repo on GitHub | `https://github.com/Duke0503/Duke` |
| Your six keys | LiveKit, Deepgram, Groq, Azure, Supabase, Upstash |
| Docker on the VPS | one command, step 2 |

> **Point the domain at the VPS first.** Caddy asks Let's Encrypt for a certificate the moment
> it starts, and Let's Encrypt checks that the name already resolves to this machine. If the DNS
> is not ready, Caddy keeps trying and says so — nothing breaks, but HTTPS is not on yet.

**A note on the phone browser.** iPhone Safari and Android Chrome only give a page the
microphone on `https://`. That is why the domain is not optional. `http://<ip>:3000` works for a
look, but the call button will not be allowed to speak or listen.

---

## 2. The steps

SSH into the VPS and run these in order.

### 2.1 Docker

```bash
curl -fsSL https://get.docker.com | sh
docker --version
```

### 2.2 The code

```bash
git clone https://github.com/Duke0503/Duke.git /opt/duke
cd /opt/duke
```

### 2.3 The keys

```bash
cp .env.example .env
nano .env
```

Fill in every blank line. `.env.example` says where to copy each one from. Two things to watch:

- **`DOMAIN`** — at the bottom. Put your domain, `duke.example.com`. Caddy reads it.
- **`AZURE_SPEECH_REGION`** — just the region word, like `eastus`. Not a URL, not the resource
  name. Getting this wrong is the single most common setup mistake, and `doctor` checks it.

Save with `Ctrl+O`, leave with `Ctrl+X`.

### 2.4 Check the keys, then create the tables

```bash
corepack enable
pnpm install
pnpm run doctor
pnpm run db:push
```

- **`pnpm run doctor`** reads your `.env` and prints one screen: what is missing, what looks
  wrong, whether the log folder is writable, and whether Postgres and Redis answer. Fix anything
  it marks `FAIL` and run it again. It exits with a non-zero code until the blocking problems are
  gone, so it works in a script too.
- **`pnpm run db:push`** creates the eight tables in Postgres. It reads
  `packages/adapters/src/drizzle/schema.ts` and applies the difference — so running it twice is
  safe, and it is also what you run after pulling a change that adds a column.

> `pnpm run doctor`, not `pnpm doctor`. pnpm has its own `doctor` command that takes the name and
> prints nothing. `pnpm run` always means *this project's script*.
>
> On a very small VPS you can skip `pnpm install` here and run `pnpm run doctor` and
> `pnpm run db:push` on your laptop instead — they only need the same `.env` and an internet
> connection. The Docker build does not need Node on the VPS.

### 2.5 Start everything

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

The first build takes a few minutes. Four containers come up: `api`, `web`, `agent`, `caddy`.
`caddy` is the only one with open ports.

### 2.6 Firewall

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

Three ports. 80 and 443 are Caddy; 22 is you. Nothing else is reachable from outside — the API
and the web app have no published ports at all, and the voice worker dials out and never listens.

### 2.7 Look at it

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Open `https://your-domain` on the phone. The first request may take a second while the
certificate is issued. Then: **Crew → New → name your friend → Call.**

---

## 3. When you change something

```bash
cd /opt/duke
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

That is the whole update. `-d` leaves it running in the background; `--build` rebuilds only the
images whose files changed.

Run `pnpm run db:push` **only** if the update touched `packages/adapters/src/drizzle/schema.ts`
(the release notes will say).

---

## 4. Where the logs are

Two places, and they are for different questions.

**Container output** — did the process start, and is it still alive?

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f agent
```

**Daily files** — what happened on a specific call, an hour ago. Every service writes two
folders: `logs/all/` with every line, and `logs/error/` with only the problems. One file per
date. Files older than `LOG_RETENTION_DAYS` (14 by default) are gzipped into
`logs/archive/`.

```bash
docker compose -f docker-compose.prod.yml exec api ls -la logs/all
docker compose -f docker-compose.prod.yml exec api tail -n 100 logs/error/$(date +%F).log
docker compose -f docker-compose.prod.yml exec agent tail -f logs/all/$(date +%F).log
```

Every line is JSON and carries a `requestId` (or a `sessionId` for a call), so one call can be
followed across services with a single grep. Keys are never written — the redaction list is in
`packages/shared/src/logger.ts`.

The files live in named volumes (`duke_api-logs`, `duke_agent-logs`), so a rebuild does not
delete them.

---

## 5. When something is wrong

| What you see | Where to look |
|---|---|
| `https://` does not load at all | `logs -f caddy`. Usually the DNS is not pointing here yet, or port 80 is blocked |
| The page loads, then "Can not reach the server" | `logs -f api`, and `curl localhost:3001/api/health` inside the container |
| The call connects, then silence | `logs -f agent`. Three usual causes: a wrong Azure region, a Deepgram credit that is used up, or an agent that joined under a different name than the API dispatched to. The name comes from `LIVEKIT_AGENT_NAME` and both ends default it to `duke` |
| "The server is missing a key" on any screen | the phone is showing a real 503: run `pnpm run doctor` and paste what it names |
| Nothing is logged at all | the volume owns a folder the container cannot write to. `docker compose ... down -v` and up again (this deletes the log volumes) |

---

## 6. What is checked, and what is not

Being honest about this saves an evening later.

**Tested on the machine this was built on**

- `pnpm typecheck`, `pnpm test` (166 tests) and `pnpm build` all pass.
- All nine screens boot against an empty `.env`; the API answers with the right error shape and
  the right status code for a missing key.
- `pnpm run doctor` — every branch: missing keys, placeholder values, wrong shapes, secret
  masking, the log folder probe, a listening port, a real TCP connect to Postgres and Redis.
- `drizzle-kit generate` reads `schema.ts` and produces correct DDL (8 tables, right foreign
  keys, `savage boolean not null default false`). The generated SQL was read and then deleted —
  `db:push` is the workflow, and `schema.ts` stays the only copy of the truth.
- The web build including the PWA manifest and the icon.

**Not tested — no Docker engine was available**

- The three images have never been built. The Dockerfiles are written to the most conservative
  shape available: Debian rather than Alpine (native modules want glibc), every dependency
  installed from the lockfile with `--frozen-lockfile`, and the runtime stage doing its **own**
  production install rather than inheriting a symlink tree from the build stage.
- The compose file and the Caddyfile have never been run.

If something in those files is wrong, it will be a **build or start** error with a message naming
the file. That is the good kind. The risky kind — a wrong Azure region, an expired key — is
checked by `doctor` and reported by the first real call.

---

## 7. The cost check

The whole point is `$0`. Two things to watch, both in `logs/all/`:

- **Azure** gives 500,000 characters a month on the free tier. One hour of talking is roughly
  20,000 characters.
- **LiveKit** gives 1,000 minutes a month on the free tier.

Duke counts both in Redis and the number is on the **Settings** screen. Past 90% it warns and
shortens its replies. A single call ends by itself at **30 minutes** — the call screen hangs up and
shows you the notes, with the reason written on the sheet — and once the month's minutes are gone
the API refuses to start the next call. Nothing can silently start costing money: the free tiers
are per-account, so the worst case is a service that stops answering, not a bill.
