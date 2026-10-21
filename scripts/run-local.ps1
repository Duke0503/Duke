<#
    Runs Duke on this computer: the API, the voice worker, and the web app.

        powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1 start
        powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1 status
        powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1 stop

    Why a script instead of `pnpm dev`: Duke is three processes that have to agree with each
    other and with the Cloudflare tunnel, and `next start` hardcodes port 3000 in
    apps/web/package.json. Here the ports are read from .env (WEB_PORT, API_PORT), so the app
    and the tunnel can never disagree.

    The web app is bound to 127.0.0.1 on purpose. The only thing that needs to reach it is the
    tunnel, which runs on this machine - so your home network cannot reach it, and neither can
    anyone else on the same Wi-Fi.

    Logs: logs\run\<service>.out.log and .err.log
    Pids: logs\run\pids.json

    The voice worker only dials outward, so it has no port and nothing to expose.
#>
param(
    [ValidateSet("start", "stop", "status", "restart")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs\run"
$pidFile = Join-Path $logDir "pids.json"

function Get-EnvValue {
    param([string]$Key, [string]$Fallback)

    $envFile = Join-Path $root ".env"
    if (-not (Test-Path $envFile)) { return $Fallback }
    $line = Select-String -Path $envFile -Pattern "^$Key=(.+)$" | Select-Object -First 1
    if (-not $line) { return $Fallback }
    return $line.Matches[0].Groups[1].Value.Trim()
}

$webPort = Get-EnvValue "WEB_PORT" "4477"
$apiPort = Get-EnvValue "API_PORT" "4478"

# The Next CLI. pnpm puts it in the package's own node_modules, so call it with node directly
# rather than going through a .cmd shim - it survives being run by the Task Scheduler that way.
$nextBin = Join-Path $root "apps\web\node_modules\next\dist\bin\next"
if (-not (Test-Path $nextBin)) { $nextBin = Join-Path $root "node_modules\next\dist\bin\next" }

# The optional brain router. `.9router-go` is gitignored: it is a downloaded binary plus a SQLite
# database that holds real provider keys, so it is not source and must never be committed. When it
# is present the agent reaches it through `LLM_BASE_URL` in .env, which makes it part of a working
# call - so it starts and stops with everything else rather than being left for you to remember.
$routerExe = Join-Path $root ".9router-go\9router-go.exe"
$routerData = Join-Path $root ".9router-go\data"
$routerPort = 20130

# Where the brain actually is. A router on this machine is only part of a working call when
# LLM_BASE_URL points back at this machine; pointing it at a hosted router, or leaving it blank to
# talk to Groq directly, makes the local one dead weight. Starting it anyway would bring back a
# second router after every reboot, holding a second copy of the provider keys for nobody.
$brainUrl = Get-EnvValue "LLM_BASE_URL" ""
$needsLocalRouter = $brainUrl -match "//(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(/|$)"

$services = @(
    [pscustomobject]@{
        Name    = "api"
        Dir     = "apps\api"
        Args    = @("dist\main.js")
        # API_HOST keeps the API on loopback. The web app reaches it there, and the tunnel only
        # ever needs the web app - so a port that carries the whole database is not reachable
        # from the same Wi-Fi. Docker sets nothing here, which is right: there the web container
        # has to reach the API over the network.
        Env     = @{ API_PORT = $apiPort; API_HOST = "127.0.0.1" }
        Artifact = "apps\api\dist\main.js"
        Ready   = "http://127.0.0.1:$apiPort/api/health"
    }
    [pscustomobject]@{
        Name    = "agent"
        Dir     = "apps\agent"
        Args    = @("dist\main.js", "start")
        Env     = @{}
        Artifact = "apps\agent\dist\main.js"
        Ready   = $null
    }
    [pscustomobject]@{
        Name    = "web"
        Dir     = "apps\web"
        Args    = @($nextBin, "start", "-p", $webPort, "-H", "127.0.0.1")
        Env     = @{ API_ORIGIN = "http://127.0.0.1:$apiPort" }
        Artifact = "apps\web\.next\BUILD_ID"
        Ready   = "http://127.0.0.1:$webPort"
    }
)

function Get-Recorded {
    if (-not (Test-Path $pidFile)) { return @() }
    try {
        # ConvertFrom-Json on Windows PowerShell 5.1 returns a JSON array as ONE object and does
        # not enumerate it, so a file holding three records arrives looking like a single record
        # whose Pid field is an array of three. ForEach-Object is what forces it apart.
        $data = Get-Content $pidFile -Raw | ConvertFrom-Json
        return @($data | ForEach-Object { $_ })
    } catch { return @() }
}

function Test-RouterReady {
    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:$routerPort/health" -TimeoutSec 3 -UseBasicParsing
        return $true
    } catch { return $false }
}

function Start-Router {
    if (-not (Test-Path $routerExe)) { return }
    if (-not $needsLocalRouter) { return }
    if (Test-RouterReady) {
        Write-Host ("  {0,-8} already up   port {1}" -f "router", $routerPort)
        return
    }

    # Port, address and data folder only. The dashboard password is read on the very first start and
    # stored hashed in the database by then, so keeping it here would put a secret in the repo for
    # no reason. HOST is loopback: the router holds provider credentials and has no business being
    # reachable from the same Wi-Fi.
    $env:PORT = "$routerPort"
    $env:HOST = "127.0.0.1"
    $env:DATA_DIR = $routerData
    try {
        $null = & $routerExe start
    } finally {
        Remove-Item env:PORT, env:HOST, env:DATA_DIR -ErrorAction SilentlyContinue
    }

    Write-Host ("  {0,-8} started   port {1}" -f "router", $routerPort)
}

function Stop-Router {
    if (-not (Test-Path $routerExe)) { return }
    if (-not (Test-RouterReady)) { return }

    # `stop` is a short-lived CLI process, not the server: it finds the daemon by reading DATA_DIR
    # and looking for the pid file there. Without the same value `start` used it looks in the
    # platform default folder (%APPDATA%\9router), finds nothing, and leaves the router running.
    $env:DATA_DIR = $routerData
    try {
        $null = & $routerExe stop
    } finally {
        Remove-Item env:DATA_DIR -ErrorAction SilentlyContinue
    }

    Write-Host ("  {0,-8} stopped" -f "router")
}

function Start-Duke {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    # Before the early return below: if everything is already up but a router this machine is
    # supposed to be running is not, a call still fails, and "already running" would be a lie.
    # Skipped entirely when the brain lives somewhere else, which Start-Router decides.
    Start-Router

    $alive = @(Get-Recorded | Where-Object { Get-Process -Id $_.Pid -ErrorAction SilentlyContinue })
    if ($alive.Count -gt 0) {
        Write-Host "Already running: $(($alive | ForEach-Object { "$($_.Name) pid $($_.Pid)" }) -join ', ')"
        Write-Host "Use 'restart' to cycle it."
        return
    }

    # Refuse to start half of Duke. A web app with no API looks broken rather than absent.
    $missing = $services | Where-Object { -not (Test-Path (Join-Path $root $_.Artifact)) }
    if ($missing) {
        Write-Host "Not built yet:" -ForegroundColor Yellow
        $missing | ForEach-Object { Write-Host "  $(Join-Path $root $_.Artifact)" }
        Write-Host "Run 'pnpm build' first."
        exit 1
    }

    $node = (Get-Command node -ErrorAction Stop).Source
    $records = @()

    foreach ($service in $services) {
        $dir = Join-Path $root $service.Dir
        $out = Join-Path $logDir "$($service.Name).out.log"
        $err = Join-Path $logDir "$($service.Name).err.log"

        # The child inherits our environment, so set each service's values just for its start.
        foreach ($key in $service.Env.Keys) { Set-Item -Path "env:$key" -Value $service.Env[$key] }
        try {
            $process = Start-Process -FilePath $node -ArgumentList $service.Args `
                -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
                -RedirectStandardOutput $out -RedirectStandardError $err
        }
        finally {
            foreach ($key in $service.Env.Keys) { Remove-Item -Path "env:$key" -ErrorAction SilentlyContinue }
        }

        $records += [pscustomobject]@{
            Name    = $service.Name
            Pid     = $process.Id
            Started = (Get-Date).ToString("s")
        }
        Write-Host ("  {0,-6} started   pid {1}" -f $service.Name, $process.Id)
    }

    $records | ConvertTo-Json | Set-Content -Path $pidFile -Encoding utf8

    # Wait for what can be asked, instead of guessing with a sleep. The API takes around twenty
    # seconds to map its routes and open its port, so a flat six-second pause made a perfectly
    # healthy API report "no answer" — which reads exactly like a crash.
    $deadline = (Get-Date).AddSeconds(60)
    foreach ($service in $services | Where-Object { $_.Ready }) {
        while ((Get-Date) -lt $deadline) {
            $answered = $true
            try {
                $null = Invoke-WebRequest -Uri $service.Ready -TimeoutSec 3 -UseBasicParsing
            } catch {
                $answered = $false
            }
            if ($answered) { break }
            Start-Sleep -Milliseconds 500
        }
    }

    Show-Status
}

function Stop-Duke {
    $records = @(Get-Recorded)

    foreach ($record in $records) {
        if (Get-Process -Id $record.Pid -ErrorAction SilentlyContinue) {
            Stop-Process -Id $record.Pid -Force -ErrorAction SilentlyContinue
            Write-Host ("  {0,-6} stopped   pid {1}" -f $record.Name, $record.Pid)
        }
    }

    # Anything still holding Duke's ports and still a node process is a straggler from a build
    # that restarted under us. Only node is touched - never whatever else owns a port.
    foreach ($port in @($webPort, $apiPort)) {
        Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
            ForEach-Object {
                $owner = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
                if ($owner -and $owner.ProcessName -eq "node") {
                    Stop-Process -Id $owner.Id -Force -ErrorAction SilentlyContinue
                    Write-Host ("  {0,-6} stopped   pid {1} (was holding {2})" -f "node", $owner.Id, $port)
                }
            }
    }

    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue

    # Last: the agent has already stopped by now, so nothing is mid-turn against it.
    Stop-Router
}

function Show-Status {
    Write-Host ""
    Write-Host "  service  state" -ForegroundColor DarkGray

    $records = @(Get-Recorded)
    if ($records.Count -eq 0) {
        Write-Host "  (nothing started from this script)"
    } else {
        foreach ($record in $records) {
            $process = @(Get-Process -Id @($record.Pid) -ErrorAction SilentlyContinue) |
                Where-Object { $_ -and $_.ProcessName -eq "node" } |
                Select-Object -First 1
            $state = if ($process) { "up    pid $($process.Id)   $([int]($process.WorkingSet64 / 1MB)) MB" } else { "DOWN" }
            Write-Host ("  {0,-8} {1}" -f $record.Name, $state)
        }
    }

    foreach ($service in $services | Where-Object { $_.Ready }) {
        $answer = try {
            "HTTP $((Invoke-WebRequest -Uri $service.Ready -TimeoutSec 5 -UseBasicParsing).StatusCode)"
        } catch {
            "no answer"
        }
        Write-Host ("  {0,-8} {1}  ->  {2}" -f $service.Name, $service.Ready, $answer)
    }

    # Say where the brain is, so "no local router" never reads as a fault once the brain is hosted.
    # Blank LLM_BASE_URL means Groq is the brain and no router is involved at all.
    if ($needsLocalRouter) {
        $answer = if (Test-RouterReady) { "HTTP 200" } else { "no answer" }
        Write-Host ("  {0,-8} {1}  ->  {2}" -f "router", "http://127.0.0.1:$routerPort/health", $answer)
    } else {
        $brain = if ($brainUrl) { $brainUrl } else { "Groq direct (LLM_BASE_URL blank)" }
        Write-Host ("  {0,-8} {1}" -f "brain", $brain)
    }

    Write-Host ""
    Write-Host "  open on this machine : http://127.0.0.1:$webPort"
    Write-Host "  on your phone        : the Cloudflare tunnel hostname (see docs\run-on-windows.md)"
    Write-Host "  logs                 : $logDir"
    Write-Host ""
}

switch ($Action) {
    "start" { Start-Duke }
    "stop" { Stop-Duke }
    "status" { Show-Status }
    "restart" { Stop-Duke; Start-Sleep -Seconds 2; Start-Duke }
}
