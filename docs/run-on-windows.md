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
| `agent` | the voice worker | nothing | it only dials out to LiveKit |
| `web` | the screens you open | `WEB_PORT` (4477) | `127.0.0.1` only, plus the tunnel |

Three processes and no Docker. The ports are read from `.env`, never hardcoded, so the launcher
and the tunnel can never disagree about where the web app is.

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
```

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
4. Back in the dashboard, open the tunnel → **Public Hostnames** → **Add a public hostname**:

   | Field | Value |
   |---|---|
   | Subdomain | `friend` |
   | Domain | `duke.io.vn` |
   | Path | *(leave empty)* |
   | Service | **HTTP** → `127.0.0.1:4477` |

   Save. Cloudflare creates the DNS record itself — nothing to add by hand.

Write `127.0.0.1`, not `localhost`: the web app is bound to the IPv4 loopback on purpose, and
`localhost` can resolve to `::1` first and miss it.

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
- **The voice worker listens on nothing.** It dials out to LiveKit Cloud.
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
