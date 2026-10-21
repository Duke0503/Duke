# Duke on your own Windows computer

The [VPS page](deploy.md) assumes Linux and Docker. This page is for the other way: Duke running
on the machine you already own. It costs nothing, and it is enough.

Measured on the machine this was written on, all three services together:

```
api    99 MB      agent  134 MB      web  78 MB      =  310 MB
```

---

## 1. What runs, and where

| Service | What it is | Listens on | Reachable from |
|---|---|---|---|
| `api` | NestJS. Characters, sessions, LiveKit tokens. | `API_PORT` (4478) | `127.0.0.1` only |
| `agent` | the voice worker | a health endpoint on `8081`, loopback only | nothing outside this machine |
| `web` | the screens you open | `WEB_PORT` (4477) | `127.0.0.1` only, plus the tunnel |
| `router` | optional, and off by default now. 9router-go **on this machine** — only when `LLM_BASE_URL` points back here — §10 | `20130` | `127.0.0.1` only |

Three processes and no Docker. A fourth, the router, joins them **only when `LLM_BASE_URL` points
at this machine**. Point it at a hosted router, or leave it blank to talk to Groq directly, and the
local one is never started: it is not part of a working call, so starting it would mean a second
router holding a second copy of the provider keys for nobody. The ports are read from `.env`, never
hardcoded, so the launcher and the tunnel can never disagree about where the web app is.

Nothing here is reachable from your network. The web app is loopback-only, and so is the API —
the launcher starts it with `API_HOST=127.0.0.1`, so the port that holds the database does not
answer to the same Wi-Fi. The one way in is the tunnel, and the first thing behind it is a
password (§4).

---

## 2. Start, stop, look

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1 start
powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1 status
powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1 stop
powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1 restart
```

`status` prints each process, its pid, its memory, and the HTTP answer from both ports:

```
  api      up    pid 23952   99 MB
  agent    up    pid 31396   134 MB
  web      up    pid 31416   78 MB
  api      http://127.0.0.1:4478/api/health  ->  HTTP 200
  web      http://127.0.0.1:4477  ->  HTTP 200
  brain    https://ninerouter-go-latest-bdg5.onrender.com/v1
```

That last line says where the brain is, so "no local router" never reads as a fault. When
`LLM_BASE_URL` points at this machine it is a `router` line with a health answer instead, and when
it is blank it says `Groq direct (LLM_BASE_URL blank)`.

Logs, one pair per service: `logs\run\<service>.out.log` and `.err.log`.
Pids: `logs\run\pids.json`.

`start` refuses to start half of Duke. If the apps have not been built it says so and names the
file it wanted, because a web app with no API looks broken rather than absent.

---

## 3. It starts by itself when you log in

A Task Scheduler entry named **Duke** runs `run-local.ps1 start` at logon, as you, without
elevation. It is why Duke survives a reboot.

```powershell
Get-ScheduledTask -TaskName Duke | Select-Object TaskName, State
Get-ScheduledTask -TaskName Duke | Select-Object -ExpandProperty Triggers
Disable-ScheduledTask -TaskName Duke        # stop it auto-starting
Unregister-ScheduledTask -TaskName Duke -Confirm:$false   # remove it entirely
```

---

## 4. The front door: one password

Duke is free to run, which means the thing worth protecting is not data — it is your share of
the free tiers. Anyone who learns the address could otherwise spend it.

So there is one sign-in, and it is two lines in `.env`:

```dotenv
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=scrypt:...     # never the password itself
```

**Never put the password itself in that file.** `AUTH_PASSWORD_HASH` is a hash, and the way to
make one is:

```powershell
node scripts/hash-password.mjs "your password"
```

Paste the line it prints over the one in `.env`, then restart:

```powershell
powershell -File scripts\run-local.ps1 restart
```

That hash has a second job: session cookies are signed with it, so **changing the password signs
out every device** — which is what changing a password should mean. Nothing needs rebuilding:
the API reads this at startup, and the web app never sees it.

What that gives you:

- Any screen without a session lands on `/login`, and after signing in you carry on to the
  screen you asked for.
- The cookie is `HttpOnly` (no script can read it), `SameSite=Lax`, and marked `Secure` whenever
  the address is `https`. One phone stays signed in for `AUTH_SESSION_HOURS` — thirty days by
  default.
- **Leaving** is the sign-out button at the bottom of Settings. There is no session on the
  server to clean up; the cookie *is* the session.
- Forgot it? Make a new hash, paste, restart. There is nothing else to recover, by design.
- If `AUTH_PASSWORD_HASH` is missing, the API answers **503 and names the key** instead of
  letting everyone in. A front door that quietly opens when it is not configured is the bug this
  is written to avoid.

Two things worth knowing:

- The password protects the app; it does not protect the tunnel. Someone who never gets that far
  never sees a login screen either — §5.3 puts a second door on the front of the tunnel.
- Your friends still belong to the device id (Settings → This phone). Signing out keeps them;
  clearing site data would lose them.

---

## 5. Putting it on your domain

**The problem this solves.** iPhone Safari and Android Chrome only give a page the microphone on
`https://`. `http://192.168.x.x:4477` will load the screens and then refuse to listen. A tunnel
gives your phone a real `https://` name while Duke keeps running on your desk.

### 5.1 The sixty-second version, for testing

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:4477
```

It prints a random name like `https://foam-printable-lone-anything.trycloudflare.com`. Open that
on your phone. No account, no DNS, no ports opened. It dies when you close the window and the
name changes every time — which is why it is for testing only.

### 5.2 The real one: `friend.duke.io.vn`

Create a tunnel **on this machine**. A tunnel only ever reaches its own machine's localhost, so
adding this hostname to the existing VPS tunnel would point at the VPS, not at your PC.

**In the Cloudflare dashboard** (Zero Trust → Networks → Tunnels):

1. **Create a tunnel** → connector type **Cloudflared** → name it `duke-pc` → Save.
2. It shows an install command containing a long token. Copy that token.
3. On this PC, in a PowerShell **run as Administrator**:

   ```powershell
   & "C:\Program Files (x86)\cloudflared\cloudflared.exe" service install <paste-token-here>
   ```

   That installs a Windows service that starts with the machine. It replaces the temporary
   tunnel from 5.1 — stop that one first.

   Then confirm it is alive (no Administrator needed just to look):

   ```powershell
   Get-Service cloudflared
   ```

   It should say **Running**, and it starts by itself from now on — so `friend.duke.io.vn` is up
   whenever this PC is on, with nothing to click.
4. Back in the dashboard, open the tunnel → **Public Hostnames** → **Add a public hostname**:

   | Field | Value |
   |---|---|
   | Subdomain | `friend` |
   | Domain | `duke.io.vn` |
   | Path | *(leave empty)* |
   | Service | **HTTP** → `127.0.0.1:4477` |

   Save. Cloudflare creates the DNS record itself — nothing to add by hand.

`127.0.0.1` is the safer spelling when typing by hand — the web app is bound to the IPv4 loopback
on purpose, and `localhost` may try `::1` first. It then falls back to IPv4, so `localhost` works
too: this is a preference, not a rule, and a hostname that already works is not worth changing.

**Prove it, without opening a browser:**

```powershell
curl.exe -s https://friend.duke.io.vn/api/health
```

`{"ok":true}` means the whole chain is live: Cloudflare → the tunnel on this PC → the web app →
the API. That one URL is public on purpose (the API marks it `@Public()` and the web gate lets it
past), so it is also what an uptime monitor should watch. A `502` instead means the hostname is
configured but no connector is running — install the service below.

**The same thing from the command line, if you prefer files to clicking:**

```powershell
cloudflared tunnel login                                  # browser, pick duke.io.vn
cloudflared tunnel create duke-pc                         # writes <id>.json in %USERPROFILE%\.cloudflared
cloudflared tunnel route dns duke-pc friend.duke.io.vn    # creates the DNS record
```

Then `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <the-id-from-create>
credentials-file: C:\Users\ADMIN\.cloudflared\<the-id>.json
ingress:
  - hostname: friend.duke.io.vn
    service: http://127.0.0.1:4477
  - service: http_status:404
```

…then `cloudflared service install` as Administrator. One Windows detail: the service runs as
`LocalSystem`, which cannot see your user profile, so copy **both** `config.yml` and the
credentials file into `C:\Windows\System32\config\systemprofile\.cloudflared\`.

### 5.3 A second door, on the tunnel itself

Duke's own password (§4) is what stops someone using your tokens. Cloudflare Access is what
stops them reaching the login screen at all — worth having, because it is the difference between
"guess my password" and "you are not welcome here".

Cloudflare Access fixes that for free (up to 50 users): **Zero Trust → Access → Applications →
Add an application → Self-hosted**, domain `friend.duke.io.vn`, policy `Allow` for your email
address, login method **One-time PIN**. After that the tunnel demands a code by email before it
serves a single byte. Your phone remembers it.

---

## 6. The thing that bit us, so it does not bite you

**The `/api` forward is baked into the web build.** Next.js resolves the rewrite from
`next.config.ts` at build time and writes the result into
`apps/web/.next/routes-manifest.json`. Change the API port and the built web app keeps calling
the old one — the pages load fine and every action fails with **HTTP 500**.

So after any change to `API_PORT` or `API_ORIGIN`:

```powershell
$env:API_ORIGIN = "http://127.0.0.1:4478"
pnpm --filter @duke/web build
powershell -File scripts\run-local.ps1 restart
```

You can check what a build actually points at:

```powershell
(Get-Content apps\web\.next\routes-manifest.json -Raw |
  ConvertFrom-Json).rewrites | ConvertTo-Json -Depth 6
```

---

## 7. Changing the ports

Three lines in `.env`, and they mean what they say:

```dotenv
API_PORT=4478                                 # the API
WEB_PORT=4477                                 # the screens (also what the tunnel points at)
API_ORIGIN=http://127.0.0.1:4478               # web -> API, and it needs a rebuild (§6)
```

`WEB_ORIGIN` is the browser origin allowed by CORS. Because the browser only ever talks to the
web app's own origin — which forwards `/api` for it — this can be the public name:

```dotenv
WEB_ORIGIN=https://friend.duke.io.vn
```

---

## 8. What is exposed, and what is not

- **Your keys never reach the browser.** The API holds them; the session brief and the LiveKit
  prompt stay server-side.
- **The web app is bound to `127.0.0.1`.** Your Wi-Fi cannot see it; only the tunnel can, because
  the tunnel runs on this machine.
- **The voice worker listens only on loopback.** It dials out to LiveKit Cloud, so nothing needs
  to reach it — but the framework does start a small HTTP endpoint of its own, and by default
  that binds every interface. `apps/agent/src/main.ts` pins it to `127.0.0.1`.
- **The API is on loopback too.** `run-local.ps1` starts it with `API_HOST=127.0.0.1`, so
  `http://<your-pc>:4478` does not answer to your Wi-Fi — and Windows Firewall's old allow rules
  for `node.exe` no longer have anything to let through. (Docker leaves `API_HOST` unset and
  keeps `0.0.0.0`, because there the web container has to reach it; that container publishes no
  port, so it is still not reachable from outside.)
- **Every route needs a session.** Not just the screens — the JSON API itself refuses without a
  valid cookie, so nobody can quietly call `POST /api/calls` and spend a minute. The two
  exceptions are `/api/health` (a probe has to work when the app is broken) and the login.
- **That decision is made in the API, not the browser.** The web app holds no signing key, so
  tampering with the page gains nothing.

---

## 9. When something is wrong

| What you see | Where to look |
|---|---|
| The page loads, then everything fails with 500 | the `/api` rewrite is pointing at an old port — §6, rebuild the web app |
| `status` shows a service `DOWN` | `logs\run\<service>.err.log` |
| The call connects, then silence | `logs\run\agent.out.log`. Usually an Azure region, a Deepgram credit, or the agent registered under a name other than the one the API dispatched to (`LIVEKIT_AGENT_NAME`, default `duke`) |
| "Can not reach the server" | is `api` up? `http://127.0.0.1:4478/api/health` should answer `{"ok":true}` |
| Every screen, including Home, jumps to `/login` | that is the front door working. Sign in. If it happens again immediately after signing in, the cookie is being dropped: check the address is `https://` so a `Secure` cookie is kept |
| The API answers `503` naming `AUTH_PASSWORD_HASH` | the front door is not set up yet — §4 |
| Signed in yesterday, signed out this morning | you changed `AUTH_PASSWORD_HASH`. Sessions are signed with it, so replacing it ends every one on purpose |
| "Duke's own server is not answering" on the login screen | the API is not up: `powershell -File scripts\run-local.ps1 status` |
| The phone shows the page but the microphone is refused | the URL is not `https://` — see §5 |
| Nothing works after a reboot | the **Duke** task, §3 |
| `status` shows the brain line but the friend goes quiet, or replies stop arriving mid-call | the brain is down. If the brain is hosted, that is outside this machine — check its `/health` from a phone. If it is the local router, `restart` starts it again — §10 |

---

## 10. The router: an optional signpost in front of the brain

This is the newest piece and the most optional. Read this before turning it on.

**What it is.** [`9router-go`](https://github.com/luqman-v1/9router-go) is a small local gateway
that speaks the same OpenAI shape Duke already speaks. It is not a model and it is not a provider:
it holds provider keys, forwards each turn, and can move to a different provider when one refuses.
It lives in `.9router-go\`, which is **git-ignored** — a downloaded binary plus a small database
that contains real provider keys is not source, and must never be committed.

**How it is switched on.** Three names in `.env`:

```
LLM_BASE_URL=https://ninerouter-go-latest-bdg5.onrender.com/v1
LLM_API_KEY=<the router's own client key, made in its dashboard>
LLM_MODEL=ag/gemini-2.5-flash
```

The model name carries two parts: the provider as the router knows it (`ag` = Antigravity, `gq` =
Groq) and the model after the slash. Blank `LLM_BASE_URL` and the agent talks to Groq directly,
exactly as it always did. `run-local.ps1` reads that URL and decides: a loopback URL means the local
router is part of a working call, so `start` starts it and `stop` stops it; anything else, hosted or
blank, means the local router is left alone and `status` prints the brain's address instead. That
matters after a reboot — the **Duke** task would otherwise bring back a router nobody is talking to.

### Which brain is in front of it, and why that one

Two providers are configured inside the router: **Antigravity** (your own Google account, connected
through OAuth in the dashboard) and **Groq** (the key Duke already had). The agent asks for
Antigravity, because it is the one with room in it. `LLM_MODEL` was `gq/openai/gpt-oss-20b` before
that and switching back is that one line plus a restart.

The model was chosen by measurement on Duke's real system prompt, three turns, streaming, not on
reputation. First byte is the number that matters on a call: it is how long the character sits
silent before the voice can start.

| `LLM_MODEL` | first byte | full reply | dashes in 3 replies | sentences per reply |
|---|---|---|---|---|
| **`ag/gemini-2.5-flash`** | **1.0 s** | 1.3 s | 0 | 2.0 |
| `ag/gemini-3.8-flash-low` | 7.1 s | 7.2 s | 0 | 3.0 |
| `ag/gemini-3.8-flash` | 5.4 s | 5.5 s | 0 | 3.0 |
| `ag/gpt-oss-120b-medium` | 1.9–3.5 s | — | **3 of 3** | 2.7 |
| `gq/openai/gpt-oss-20b` (Groq, the old one) | 0.43 s | 1.4 s | 0 | 3.0 |

The two 3.8 models are the better writers and five to seven seconds of silence on a phone call is
not a trade worth making, so they are out. The `ag/` catalog is misleading in one more way worth
knowing: the dashboard lists models the account cannot actually serve. `ag/gemini-3.6-flash-low`
and `ag/gemini-3.1-pro-low` are listed and answer `404 Requested entity was not found`.

`ag/gemini-2.5-flash` also fixed a real annoyance with the old brain. On three turns the old model
opened with "Oh really?" all three times, which is exactly the scripted feel the prompt is trying to
avoid. The new one varied every opening.

### It runs on Render now, not on this PC

The router was moved to Render (`ninerouter-go-latest-bdg5.onrender.com`), so the PC no longer runs
it. The local copy under `.9router-go\` is still on disk with its own database, but it is stopped
and the launcher no longer starts it: that is the switch-back path, not a second brain.

Three consequences, all real, and none of them visible in a successful test:

1. **Render's free instances sleep.** After a stretch of idleness the first request has to wake the
   container, and that first turn is slow — tens of seconds, not milliseconds. The instance answered
   in 0.66 s during this switch because it was awake. Wake-up latency is invisible until it happens,
   and it will happen the first time you call after a quiet evening. The fix is a cheap keep-alive
   ping every ten minutes, or an instance type that does not sleep. Not done yet.
2. **The connections live in a SQLite file on the container.** Provider connections are in
   `$DATA_DIR/db/data.sqlite`, and there is no way to seed them from environment variables. On a
   service whose filesystem is reset by a deploy, a redeploy takes the Antigravity connection and
   the client key with it, and Duke then fails with `401`/`404` instead of saying anything useful.
   Check that Render has a persistent disk attached and that `DATA_DIR` points into it. If it does
   not, expect to re-add the connection and the key after every deploy.
3. **That instance has no Groq connection.** All 28 models it lists are `ag/`. The Groq fallback
   below is therefore not available *through the hosted router* — it is still available by clearing
   `LLM_BASE_URL` and letting the agent talk to Groq directly, because `GROQ_API_KEY` is in `.env`
   either way.

One more trap, the mirror image of the one above: the hosted catalogue lists models it cannot serve.
`ag/gemini-4-argon` and its `-low`/`-medium`/`-high` variants are all listed and all answer
`404 Requested entity was not found`. And `ag/gemini-2.5-flash` works while being *absent* from the
list. The list is a hint, not a contract; only a completion proves a model.

### The risk, stated plainly

The router's own dashboard puts this warning on the Antigravity connection, and it is not
decoration:

> This provider uses a subscription/OAuth session not officially licensed for proxy/router use.
> Account may be restricted or banned. Use at your own risk.

That is your **personal** Google account (`minhduc95gl05@gmail.com`), and this is a path Google has
not licensed. The realistic outcomes are that the session starts failing, or that the account is
restricted. Free tiers like this have also disappeared before: the router's own README records the
iFlow, Qwen Code and Gemini CLI free tiers being discontinued during 2026, so this is rented ground
either way.

Two things follow from that:

- **Groq is still reachable.** The old key is still in `.env`, and blanking `LLM_BASE_URL` is the
  supported way back: the agent then talks to Groq directly with no router in between. What is no
  longer true is "Groq is configured inside the router you are using right now" — the hosted one has
  no Groq connection at all.
- **Duke does not need the router to work.** `LLM_BASE_URL` blank is a supported configuration, not
  a fallback hack.

**What it does not do.** Two things worth being blunt about, because both are easy to assume:

1. **It does not raise a ceiling by itself.** A router owns no models. Pointing `LLM_MODEL` at
   Antigravity is what changed the ceiling, and pointing it back at `gq/...` puts the same Groq
   limit back.
2. **It does not fix a long call losing its thread, and it does not save tokens per turn.** Every
   chat API is stateless: Duke re-sends the whole conversation each turn, and a router does not
   change how much is sent. Its own token savers compress tool output, and Duke sends no tools.

**Where it went.** There are two dashboards now, and it is worth knowing which is which. The hosted
one is the Render service's own URL, opened with the password set when it was deployed. The local
one, `http://127.0.0.1:20130`, still exists but nothing uses it; its database holds the connections
from before the move. Both hold provider credentials, so neither belongs on the open internet beyond
its dashboard login. On the PC that is why the launcher binds it to loopback.

**Before it was switched on, the path was proven end to end** — first locally, then again after the
move. On the hosted router, on the real system prompt, three turns:

```
[[sympathetic]] Oh no, long story short, sounds like you really earned your rest tonight.
                Want to grab a quick cuppa and vent about it?
[[surprised]]   No way, moving it up by a whole week is proper harsh. That's a classic case of
                biting off more than they can chew, right?
[[friendly]]    I hear you, let's call it a night and just put our feet up.
```

Valid mood tags, no dashes, two sentences each, and the native collocations the prompt asks for.
Then through the plugin in the agent's own construction, which answered in 1.5 s with a valid tag.
See §9 for the one thing that *is* fixed here and needs no router at all: `DashRewriter`.
