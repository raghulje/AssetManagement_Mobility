# ITAgent_2026 - long-running Windows agent
# Registers once, heartbeats, and runs inventory when the server queues a scan
# (or on a slow periodic schedule).

$ErrorActionPreference = 'Stop'

$apiBase = if ($env:REFEX_API_URL) { $env:REFEX_API_URL.TrimEnd('/') } else { 'http://localhost:3001/api/v1' }
$agentKey = $env:REFEX_AGENT_KEY
$assetTag = $env:REFEX_ASSET_TAG
$pollMs = if ($env:REFEX_AGENT_POLL_MS) { [int]$env:REFEX_AGENT_POLL_MS } else { 30000 }
$fullSyncMs = if ($env:REFEX_AGENT_INTERVAL_MS) { [int]$env:REFEX_AGENT_INTERVAL_MS } else { 3600000 }
$stateDir = if ($env:REFEX_AGENT_STATE_DIR) { $env:REFEX_AGENT_STATE_DIR } else {
  Join-Path $env:ProgramData 'ITAgent_2026'
}
$stateFile = Join-Path $stateDir 'agent.json'
$agentVersion = '2026.1'

function Get-AgentHeaders {
  param($State)
  $h = @{ 'Content-Type' = 'application/json' }
  if ($agentKey) { $h['X-Agent-Key'] = $agentKey }
  if ($State -and $State.agent_uuid -and $State.agent_token) {
    $h['X-Agent-Id'] = [string]$State.agent_uuid
    $h['X-Agent-Token'] = [string]$State.agent_token
  }
  return $h
}

function Collect-Inventory {
  $os = Get-CimInstance Win32_OperatingSystem
  $cs = Get-CimInstance Win32_ComputerSystem
  $bios = Get-CimInstance Win32_BIOS
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $tz = Get-CimInstance Win32_TimeZone
  $hostname = [System.Net.Dns]::GetHostName()
  $serialnumber = [string]$bios.SerialNumber

  $software = @()
  $uninstallPaths = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($path in $uninstallPaths) {
    Get-ItemProperty $path -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName } |
      ForEach-Object {
        $software += ('"{0}", "{1}", "{2}", "{3}"' -f `
          $_.DisplayName, $_.Publisher, $_.DisplayVersion, $_.InstallDate)
      }
  }
  $databaseString = ($software | Select-Object -Unique | Select-Object -First 400) -join ', '

  $payload = [ordered]@{
    Computer_Name         = $hostname
    Host_Name             = $hostname
    Serial_Number         = $serialnumber
    OS_Name               = $os.Caption
    OS_Version            = $os.Version
    OS_Manufacturer       = $os.Manufacturer
    OS_Build_Type         = $os.BuildType
    OS_Configuration      = [string]$cs.DomainRole
    Registered_Owner      = $os.RegisteredUser
    Product_ID            = $os.SerialNumber
    System_Manufacturer   = $cs.Manufacturer
    System_Model          = $cs.Model
    Processor             = $cpu.Name
    Domain                = $cs.Domain
    BIOS_Version          = $bios.SMBIOSBIOSVersion
    Windows_Directory     = $env:windir
    System_Directory      = $env:SystemRoot
    System_Locale         = $os.Locale
    Time_Zone             = $tz.Caption
    Total_Physical_RAM    = [string]$cs.TotalPhysicalMemory
    Virtual_RAM_Max       = [string]$os.TotalVirtualMemorySize
    Virtual_RAM_Available = [string]$os.FreeVirtualMemory
    Installed_Software    = $databaseString
    platform              = 'windows'
    Created_By            = 'ITAgent_2026'
    agent_version         = $agentVersion
    create_if_missing     = $true
  }
  if ($assetTag) { $payload.asset_tag = $assetTag }
  return $payload
}

function Save-State($State) {
  if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }
  $State | ConvertTo-Json -Depth 6 | Set-Content -Path $stateFile -Encoding UTF8
}

function Load-State {
  if (-not (Test-Path $stateFile)) { return $null }
  try { return (Get-Content $stateFile -Raw | ConvertFrom-Json) } catch { return $null }
}

function Register-Agent {
  $inv = Collect-Inventory
  $body = @{
    Computer_Name   = $inv.Computer_Name
    Serial_Number   = $inv.Serial_Number
    platform        = 'windows'
    agent_version   = $agentVersion
  }
  if ($assetTag) { $body.asset_tag = $assetTag }
  $headers = @{ 'Content-Type' = 'application/json' }
  if ($agentKey) { $headers['X-Agent-Key'] = $agentKey }

  Write-Host "Registering agent at $apiBase/agent/register ..."
  $res = Invoke-RestMethod -Uri "$apiBase/agent/register" -Method Post -Body ($body | ConvertTo-Json) -Headers $headers
  $payload = $res.payload
  if (-not $payload.agent_uuid -or -not $payload.agent_token) {
    throw "Register response missing credentials"
  }
  $state = [pscustomobject]@{
    agent_uuid  = $payload.agent_uuid
    agent_token = $payload.agent_token
    asset_id    = $payload.asset_id
    registered_at = (Get-Date).ToString('o')
    api_base    = $apiBase
  }
  Save-State $state
  if ($payload.poll_interval_ms) { $script:pollMs = [int]$payload.poll_interval_ms }
  Write-Host "Registered agent $($state.agent_uuid)"
  return $state
}

function Sync-Inventory {
  param($State, $CommandId = $null)
  $payload = Collect-Inventory
  if ($CommandId) { $payload.command_id = $CommandId }
  $headers = Get-AgentHeaders $State
  Write-Host "$(Get-Date -Format o) Inventory sync..."
  $res = Invoke-RestMethod -Uri "$apiBase/agent/sync" -Method Post -Body ($payload | ConvertTo-Json -Depth 6) -Headers $headers
  $act = [string]$res.payload.action
  if (-not $act) { $act = $(if ($res.payload.created) { 'created' } elseif ($res.payload.matched) { 'updated' } else { 'unmatched' }) }
  Write-Host "  Sync OK - action=$act tag=$($res.payload.asset.asset_tag) matched_by=$($res.payload.matched_by)"
  return $res
}

function Send-Heartbeat {
  param($State)
  $hostname = [System.Net.Dns]::GetHostName()
  $body = @{
    hostname      = $hostname
    platform      = 'windows'
    agent_version = $agentVersion
  } | ConvertTo-Json
  $headers = Get-AgentHeaders $State
  $res = Invoke-RestMethod -Uri "$apiBase/agent/heartbeat" -Method Post -Body $body -Headers $headers
  return $res
}

Write-Host "ITAgent_2026 service -> $apiBase  (poll ${pollMs}ms, full sync ${fullSyncMs}ms)"
Write-Host "State file: $stateFile"

$state = Load-State
if (-not $state -or -not $state.agent_uuid -or -not $state.agent_token) {
  $state = Register-Agent
}

# Initial inventory
try { Sync-Inventory $state | Out-Null } catch { Write-Host "Initial sync failed: $($_.Exception.Message)" }

$lastFull = [datetime]::UtcNow

while ($true) {
  try {
    $hb = Send-Heartbeat $state
    $cmds = @($hb.payload.commands)
    foreach ($cmd in $cmds) {
      if (-not $cmd) { continue }
      $name = [string]$cmd.command
      Write-Host "$(Get-Date -Format o) Command #$($cmd.id): $name"
      if ($name -eq 'scan' -or $name -eq 'rerun') {
        try {
          Sync-Inventory $state $cmd.id | Out-Null
        } catch {
          $errBody = @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json
          $headers = Get-AgentHeaders $state
          Invoke-RestMethod -Uri "$apiBase/agent/commands/$($cmd.id)/ack" -Method Post -Body $errBody -Headers $headers | Out-Null
          Write-Host "  Command failed: $($_.Exception.Message)"
        }
      }
    }

    $elapsed = ([datetime]::UtcNow - $lastFull).TotalMilliseconds
    if ($elapsed -ge $fullSyncMs) {
      Sync-Inventory $state | Out-Null
      $lastFull = [datetime]::UtcNow
    }
  } catch {
    Write-Host "$(Get-Date -Format o) Loop error: $($_.Exception.Message)"
    # Re-register if credentials rejected
    if ($_.Exception.Message -match "401|Unauthorized|Invalid agent") {
      try { $state = Register-Agent } catch { Write-Host "Re-register failed: $($_.Exception.Message)" }
    }
  }
  Start-Sleep -Milliseconds $pollMs
}
