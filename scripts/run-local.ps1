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

$services = @(
    [pscustomobject]@{
        Name    = "api"
        Dir     = "apps\api"
        Args    = @("dist\main.js")
        Env     = @{ API_PORT = $apiPort }
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

function Start-Duke {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

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

    Start-Sleep -Seconds 6
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
