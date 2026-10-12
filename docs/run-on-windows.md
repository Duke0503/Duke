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
| `api` | NestJS. Characters, sessions, LiveKit tokens. | `API_PORT` (4478) | the machine, **and your LAN** — see §7 |
| `agent` | the voice worker | nothing | it only dials out to LiveKit |
| `web` | the screens you open | `WEB_PORT` (4477) | `127.0.0.1` only, plus the tunnel |

Three processes and no Docker. The ports are read from `.env`, never hardcoded, so the launcher
and the tunnel can never disagree about where the web app is.

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

## 4. Putting it on your domain

**The problem this solves.** iPhone Safari and Android Chrome only give a page the microphone on
`https://`. `http://192.168.x.x:4477` will load the screens and then refuse to listen. A tunnel
gives your phone a real `https://` name while Duke keeps running on your desk.

### 4.1 The sixty-second version, for testing

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:4477
```

It prints a random name like `https://foam-printable-lone-anything.trycloudflare.com`. Open that
on your phone. No account, no DNS, no ports opened. It dies when you close the window and the
name changes every time — which is why it is for testing only.

### 4.2 The real one: `friend.duke.io.vn`

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
   tunnel from 4.1 — stop that one first.
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

### 4.3 Lock the front door

Duke authenticates devices, not people. Anyone who learns the URL can invent a device id and
spend your Groq, Deepgram and Azure free tiers.

Cloudflare Access fixes that for free (up to 50 users): **Zero Trust → Access → Applications →
Add an application → Self-hosted**, domain `friend.duke.io.vn`, policy `Allow` for your email
address, login method **One-time PIN**. After that the tunnel demands a code by email before it
serves a single byte. Your phone remembers it.

---

## 5. The thing that bit us, so it does not bite you

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

## 6. Changing the ports

Three lines in `.env`, and they mean what they say:

```dotenv
API_PORT=4478                                 # the API
WEB_PORT=4477                                 # the screens (also what the tunnel points at)
API_ORIGIN=http://127.0.0.1:4478               # web -> API, and it needs a rebuild (§5)
```

`WEB_ORIGIN` is the browser origin allowed by CORS. Because the browser only ever talks to the
web app's own origin — which forwards `/api` for it — this can be the public name:

```dotenv
WEB_ORIGIN=https://friend.duke.io.vn
```

---

## 7. What is exposed, and what is not

- **Your keys never reach the browser.** The API holds them; the session brief and the LiveKit
  prompt stay server-side.
- **The web app is bound to `127.0.0.1`.** Your Wi-Fi cannot see it; only the tunnel can, because
  the tunnel runs on this machine.
- **The voice worker listens on nothing.** It dials out to LiveKit Cloud.
- **The API binds every interface**, and Windows Firewall already has allow rules for `node.exe`
  from earlier development, so `http://<your-pc>:4478` is reachable from your LAN today. Nothing
  needs that — the web app reaches the API over loopback. To close it, in an Administrator shell:

  ```powershell
  New-NetFirewallRule -DisplayName "Duke API - loopback only" -Direction Inbound `
    -Protocol TCP -LocalPort 4478 -Action Block -Profile Any
  ```

  The cleaner fix is to bind the API itself to `127.0.0.1`; that needs a small change in
  `apps/api/src/main.ts` and an `API_HOST` variable, because Docker needs it on `0.0.0.0`.

---

## 8. When something is wrong

| What you see | Where to look |
|---|---|
| The page loads, then everything fails with 500 | the `/api` rewrite is pointing at an old port — §5, rebuild the web app |
| `status` shows a service `DOWN` | `logs\run\<service>.err.log` |
| The call connects, then silence | `logs\run\agent.out.log`. Usually an Azure region, a Deepgram credit, or the agent registered under a name other than the one the API dispatched to (`LIVEKIT_AGENT_NAME`, default `duke`) |
| "Can not reach the server" | is `api` up? `http://127.0.0.1:4478/api/health` should answer `{"ok":true}` |
| The phone shows the page but the microphone is refused | the URL is not `https://` — see §4 |
| Nothing works after a reboot | the **Duke** task, §3 |
