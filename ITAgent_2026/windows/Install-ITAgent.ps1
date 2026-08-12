# Install ITAgent_2026 as a startup scheduled task (runs service loop).
# Run elevated once on the device:
#   .\Install-ITAgent.ps1 -ApiUrl "https://asset.refexone.com/api/v1"

param(
  [string]$ApiUrl = $(if ($env:REFEX_API_URL) { $env:REFEX_API_URL } else { 'https://asset.refexone.com/api/v1' }),
  [string]$AgentKey = $(if ($env:REFEX_AGENT_KEY) { $env:REFEX_AGENT_KEY } else { '' }),
  [string]$AssetTag = $(if ($env:REFEX_ASSET_TAG) { $env:REFEX_ASSET_TAG } else { '' }),
  [int]$PollMs = 30000,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$taskName = 'ITAgent_2026'
$installDir = Join-Path $env:ProgramData 'ITAgent_2026'
$serviceScript = Join-Path $PSScriptRoot 'ITAgent_2026_Service.ps1'
$runner = Join-Path $installDir 'run.cmd'

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed scheduled task $taskName"
  exit 0
}

if (-not (Test-Path $serviceScript)) {
  throw "Missing $serviceScript"
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -Path $serviceScript -Destination (Join-Path $installDir 'ITAgent_2026_Service.ps1') -Force

# Persist env for the task
$envFile = Join-Path $installDir 'env.ps1'
@"
`$env:REFEX_API_URL = '$($ApiUrl.TrimEnd('/'))'
`$env:REFEX_AGENT_KEY = '$AgentKey'
`$env:REFEX_ASSET_TAG = '$AssetTag'
`$env:REFEX_AGENT_POLL_MS = '$PollMs'
`$env:REFEX_AGENT_STATE_DIR = '$installDir'
"@ | Set-Content -Path $envFile -Encoding UTF8

$svc = Join-Path $installDir 'ITAgent_2026_Service.ps1'
$bootstrap = Join-Path $installDir 'run-agent.ps1'
@"
. '$envFile'
& '$svc'
"@ | Set-Content -Path $bootstrap -Encoding UTF8

@"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$bootstrap"
"@ | Set-Content -Path $runner -Encoding ASCII

$action = New-ScheduledTaskAction -Execute $runner
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

# Start now
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "ITAgent_2026 installed."
Write-Host "  API     : $ApiUrl"
Write-Host "  State   : $installDir"
Write-Host "  Task    : $taskName (At startup + running now)"
Write-Host ""
Write-Host "From Refex Asset Management → open the asset → Agent tab → Request inventory scan."
