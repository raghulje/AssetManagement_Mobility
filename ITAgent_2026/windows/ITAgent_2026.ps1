# ITAgent_2026 — Windows inventory agent (one-shot)
# 1) Registers this PC with the server (enables remote "Request inventory scan")
# 2) Syncs inventory — UPDATES existing asset by serial/hostname (no duplicate)
#
# Usage:
#   .\ITAgent_2026.ps1
#   .\ITAgent_2026.ps1 -NoPause
#   For continuous remote scans, also run Install-ITAgent.ps1 or ITAgent_2026_Service.ps1

param(
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'

$apiBase = if ($env:REFEX_API_URL) { $env:REFEX_API_URL.TrimEnd('/') } else { 'https://asset.refexone.com/api/v1' }
$agentKey = $env:REFEX_AGENT_KEY
$assetTag = $env:REFEX_ASSET_TAG
$stateDir = if ($env:REFEX_AGENT_STATE_DIR) { $env:REFEX_AGENT_STATE_DIR } else {
  Join-Path $env:ProgramData 'ITAgent_2026'
}
$stateFile = Join-Path $stateDir 'agent.json'
$logDir = Join-Path $env:TEMP 'ITAgent_2026'
$logFile = Join-Path $logDir ("sync_{0:yyyyMMdd_HHmmss}.log" -f (Get-Date))
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log([string]$msg, [string]$color = 'White') {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Write-Host $line -ForegroundColor $color
  Add-Content -Path $logFile -Value $line
}

function Get-Inventory {
  $os = Get-CimInstance Win32_OperatingSystem
  $cs = Get-CimInstance Win32_ComputerSystem
  $bios = Get-CimInstance Win32_BIOS
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $tz = Get-CimInstance Win32_TimeZone
  $hostname = [System.Net.Dns]::GetHostName()
  $serialnumber = [string]$bios.SerialNumber

  function Sanitize-Text([string]$s) {
    if ([string]::IsNullOrWhiteSpace($s)) { return '' }
    return (($s -replace '[\x00-\x1F\x7F]', ' ') -replace '\s+', ' ').Trim()
  }

  $apps = New-Object System.Collections.Generic.List[object]
  $uninstallPaths = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($path in $uninstallPaths) {
    Get-ItemProperty -Path $path -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName } |
      ForEach-Object {
        $name = Sanitize-Text ([string]$_.DisplayName)
        if (-not $name) { return }
        $apps.Add([pscustomobject]@{
          name         = $name
          publisher    = Sanitize-Text ([string]$_.Publisher)
          version      = Sanitize-Text ([string]$_.DisplayVersion)
          install_date = Sanitize-Text ([string]$_.InstallDate)
        })
      }
  }
  $unique = @($apps | Sort-Object name, version -Unique | Select-Object -First 500)
  $legacyCsv = (
    $unique | ForEach-Object {
      '"{0}", "{1}", "{2}", "{3}"' -f $_.name, $_.publisher, $_.version, $_.install_date
    }
  ) -join ', '
  Write-Log ("Collected {0} installed apps" -f $unique.Count) 'Cyan'

  $payload = [ordered]@{
    Computer_Name            = $hostname
    Host_Name                = $hostname
    Serial_Number            = $serialnumber
    OS_Name                  = $os.Caption
    OS_Version               = $os.Version
    OS_Manufacturer          = $os.Manufacturer
    OS_Build_Type            = $os.BuildType
    OS_Configuration         = [string]$cs.DomainRole
    Registered_Owner         = $os.RegisteredUser
    Product_ID               = $os.SerialNumber
    System_Manufacturer      = $cs.Manufacturer
    System_Model             = $cs.Model
    Processor                = $cpu.Name
    Domain                   = $cs.Domain
    BIOS_Version             = $bios.SMBIOSBIOSVersion
    Windows_Directory        = $env:windir
    System_Directory         = $env:SystemRoot
    System_Locale            = $os.Locale
    Time_Zone                = $tz.Caption
    Total_Physical_RAM       = [string]$cs.TotalPhysicalMemory
    Virtual_RAM_Max          = [string]$os.TotalVirtualMemorySize
    Virtual_RAM_Available    = [string]$os.FreeVirtualMemory
    Installed_Software       = $legacyCsv
    Installed_Software_List  = @($unique)
    Installed_Software_Count = [int]$unique.Count
    platform                 = 'windows'
    Created_By               = 'ITAgent_2026'
    agent_version            = '2026.1'
    create_if_missing        = $true
  }
  if ($assetTag) { $payload.asset_tag = $assetTag }
  return $payload
}

function Save-AgentState($State) {
  if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }
  $State | ConvertTo-Json -Depth 6 | Set-Content -Path $stateFile -Encoding UTF8
}

function Load-AgentState {
  if (-not (Test-Path $stateFile)) { return $null }
  try { return (Get-Content $stateFile -Raw | ConvertFrom-Json) } catch { return $null }
}

Write-Log "ITAgent_2026 → $apiBase" 'Cyan'
Write-Log "State file: $stateFile" 'DarkGray'
Write-Log "Log file: $logFile" 'DarkGray'

$payload = Get-Inventory
Write-Host ""
Write-Log "Collected from this PC:"
Write-Log "  Hostname : $($payload.Computer_Name)"
Write-Log "  Serial   : $($payload.Serial_Number)"
Write-Log "  Model    : $($payload.System_Model)"
Write-Log "  OEM      : $($payload.System_Manufacturer)"
Write-Log "  OS       : $($payload.OS_Name) $($payload.OS_Version)"
Write-Host ""

$headers = @{ 'Content-Type' = 'application/json' }
if ($agentKey) { $headers['X-Agent-Key'] = $agentKey }

try {
  # --- Register (required for Agent tab / remote scan) ---
  $state = Load-AgentState
  $needsRegister = (-not $state -or -not $state.agent_uuid -or -not $state.agent_token -or [string]$state.api_base -ne $apiBase)
  if ($needsRegister) {
    if ($state -and [string]$state.api_base -and [string]$state.api_base -ne $apiBase) {
      Write-Log "API URL changed ($($state.api_base) → $apiBase); re-registering…" 'Cyan'
    } else {
      Write-Log "Registering agent with server…" 'Cyan'
    }
    $regBody = @{
      Computer_Name = $payload.Computer_Name
      Serial_Number = $payload.Serial_Number
      platform      = 'windows'
      agent_version = '2026.1'
    }
    if ($assetTag) { $regBody.asset_tag = $assetTag }
    $reg = Invoke-RestMethod -Uri "$apiBase/agent/register" -Method Post `
      -Body ($regBody | ConvertTo-Json) -Headers $headers -TimeoutSec 60
    if (-not $reg.payload.agent_uuid -or -not $reg.payload.agent_token) {
      throw "Register response missing credentials"
    }
    $state = [pscustomobject]@{
      agent_uuid    = $reg.payload.agent_uuid
      agent_token   = $reg.payload.agent_token
      asset_id      = $reg.payload.asset_id
      registered_at = (Get-Date).ToString('o')
      api_base      = $apiBase
    }
    Save-AgentState $state
    Write-Log "Registered OK — uuid=$($state.agent_uuid) asset_id=$($state.asset_id)" 'Green'
  } else {
    Write-Log "Already registered — uuid=$($state.agent_uuid)" 'DarkGray'
  }

  $headers['X-Agent-Id'] = [string]$state.agent_uuid
  $headers['X-Agent-Token'] = [string]$state.agent_token

  # --- Heartbeat (marks Online) ---
  Write-Log "Sending heartbeat…" 'Cyan'
  $hb = Invoke-RestMethod -Uri "$apiBase/agent/heartbeat" -Method Post `
    -Body (@{ hostname = $payload.Computer_Name; platform = 'windows'; agent_version = '2026.1' } | ConvertTo-Json) `
    -Headers $headers -TimeoutSec 60
  Write-Log "Heartbeat OK" 'Green'

  # --- Inventory sync ---
  Write-Log "Syncing inventory (software=$([int]$payload.Installed_Software_Count))…" 'Cyan'
  $headers['Content-Type'] = 'application/json; charset=utf-8'
  $response = Invoke-RestMethod -Uri "$apiBase/agent/sync" -Method Post `
    -Body ($payload | ConvertTo-Json -Depth 8 -Compress) -Headers $headers -TimeoutSec 180

  $payloadOut = $response.payload
  $action = [string]$payloadOut.action
  if (-not $action) {
    if ($payloadOut.created) { $action = 'created' }
    elseif ($payloadOut.matched) { $action = 'updated' }
    else { $action = 'unmatched' }
  }

  $tag = $payloadOut.asset.asset_tag
  $assetId = $payloadOut.asset.id
  $matchedBy = $payloadOut.matched_by
  if ($assetId) {
    $state.asset_id = $assetId
    Save-AgentState $state
  }

  Write-Host ""
  Write-Host "========================================" -ForegroundColor Green
  if ($action -eq 'updated') {
    Write-Host " RESULT: UPDATED existing asset" -ForegroundColor Green
  } elseif ($action -eq 'created') {
    Write-Host " RESULT: CREATED new asset" -ForegroundColor Yellow
  } else {
    Write-Host " RESULT: $action" -ForegroundColor Cyan
  }
  Write-Host " Agent    : REGISTERED (remote scan enabled when Service is running)" -ForegroundColor Green
  Write-Host " Asset tag: $tag" -ForegroundColor Green
  Write-Host " Asset id : $assetId" -ForegroundColor Green
  Write-Host " Matched  : $matchedBy" -ForegroundColor Green
  $publicOrigin = ($apiBase -replace '/api/v1/?$', '')
  Write-Host " Open     : $publicOrigin/hardware/$assetId  (Agent tab)" -ForegroundColor Cyan
  Write-Host " Message  : $($response.messages -join '; ')" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor Green
  Write-Host ""
  Write-Log "RESULT action=$action tag=$tag id=$assetId matched_by=$matchedBy registered=yes"
  Write-Host "Tip: for Online presence + remote scan, keep ITAgent_2026_Service.ps1 running (or Install-ITAgent.ps1)." -ForegroundColor DarkGray
  Write-Host "Local log: $logFile" -ForegroundColor DarkGray
}
catch {
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Red
  Write-Host " RESULT: FAILED" -ForegroundColor Red
  Write-Host " $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host " $($_.ErrorDetails.Message)" -ForegroundColor Red }
  Write-Host "========================================" -ForegroundColor Red
  Write-Log "FAILED: $($_.Exception.Message)" 'Red'
  if (-not $NoPause) {
    Write-Host "Press Enter to close..."
    [void][Console]::ReadLine()
  }
  exit 1
}

if (-not $NoPause) {
  Write-Host ""
  Write-Host "Press Enter to close..."
  [void][Console]::ReadLine()
}
