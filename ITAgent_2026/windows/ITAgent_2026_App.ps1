# ITAgent_2026 — single Windows app (GUI + install + sync + service)
# Build to EXE:  .\Build-ITAgentExe.ps1
#
# Modes:
#   (default / -Mode gui)   Simple window: Install, Sync, Uninstall
#   -Mode install           Install startup task (needs Admin)
#   -Mode uninstall         Remove startup task
#   -Mode sync              One-shot inventory sync
#   -Mode service           Long-running heartbeat + remote scan loop

param(
  [ValidateSet('gui', 'install', 'uninstall', 'sync', 'service')]
  [string]$Mode = 'gui',
  [string]$ApiUrl = $(if ($env:REFEX_API_URL) { $env:REFEX_API_URL } else { 'http://10.5.7.225:3001/api/v1' }),
  [string]$AgentKey = $(if ($env:REFEX_AGENT_KEY) { $env:REFEX_AGENT_KEY } else { '' }),
  [string]$AssetTag = $(if ($env:REFEX_ASSET_TAG) { $env:REFEX_ASSET_TAG } else { '' }),
  [int]$PollMs = $(if ($env:REFEX_AGENT_POLL_MS) { [int]$env:REFEX_AGENT_POLL_MS } else { 30000 }),
  [int]$FullSyncMs = $(if ($env:REFEX_AGENT_INTERVAL_MS) { [int]$env:REFEX_AGENT_INTERVAL_MS } else { 3600000 })
)

$ErrorActionPreference = 'Stop'
$agentVersion = '2026.1'
$taskName = 'ITAgent_2026'
$script:InstallDir = if ($env:REFEX_AGENT_STATE_DIR) { $env:REFEX_AGENT_STATE_DIR } else {
  Join-Path $env:ProgramData 'ITAgent_2026'
}
$script:StateFile = Join-Path $script:InstallDir 'agent.json'
$script:ServiceLog = Join-Path $script:InstallDir 'service.log'

function Get-SelfLaunch {
  # Prefer compiled EXE path; fall back to this .ps1
  try {
    $procPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    if ($procPath -and ($procPath -match '\.exe$') -and ($procPath -notmatch '\\(powershell|pwsh)\.exe$')) {
      return @{ Kind = 'exe'; Path = $procPath }
    }
  } catch {}
  if ($PSCommandPath -and (Test-Path -LiteralPath $PSCommandPath)) {
    return @{ Kind = 'ps1'; Path = $PSCommandPath }
  }
  throw 'Cannot resolve ITAgent path for scheduled task'
}

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-AgentLog([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  try {
    if (-not (Test-Path $script:InstallDir)) { New-Item -ItemType Directory -Path $script:InstallDir -Force | Out-Null }
    Add-Content -Path $script:ServiceLog -Value $line -Encoding UTF8
  } catch {}
  Write-Host $line
}

function Get-ApiBase([string]$Url) {
  return $Url.TrimEnd('/')
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
  if ($script:AssetTag) { $payload.asset_tag = $script:AssetTag }
  return $payload
}

function Save-State($State) {
  if (-not (Test-Path $script:InstallDir)) { New-Item -ItemType Directory -Path $script:InstallDir -Force | Out-Null }
  $State | ConvertTo-Json -Depth 6 | Set-Content -Path $script:StateFile -Encoding UTF8
}

function Load-State {
  if (-not (Test-Path $script:StateFile)) { return $null }
  try { return (Get-Content $script:StateFile -Raw | ConvertFrom-Json) } catch { return $null }
}

function Get-AgentHeaders($State) {
  $h = @{ 'Content-Type' = 'application/json' }
  if ($script:AgentKey) { $h['X-Agent-Key'] = $script:AgentKey }
  if ($State -and $State.agent_uuid -and $State.agent_token) {
    $h['X-Agent-Id'] = [string]$State.agent_uuid
    $h['X-Agent-Token'] = [string]$State.agent_token
  }
  return $h
}

function Register-Agent {
  $api = Get-ApiBase $script:ApiUrl
  $inv = Collect-Inventory
  $body = @{
    Computer_Name = $inv.Computer_Name
    Serial_Number = $inv.Serial_Number
    platform      = 'windows'
    agent_version = $agentVersion
  }
  if ($script:AssetTag) { $body.asset_tag = $script:AssetTag }
  $headers = @{ 'Content-Type' = 'application/json' }
  if ($script:AgentKey) { $headers['X-Agent-Key'] = $script:AgentKey }

  Write-AgentLog "Registering at $api/agent/register ..."
  $res = Invoke-RestMethod -Uri "$api/agent/register" -Method Post -Body ($body | ConvertTo-Json) -Headers $headers
  $payload = $res.payload
  if (-not $payload.agent_uuid -or -not $payload.agent_token) { throw 'Register response missing credentials' }
  $state = [pscustomobject]@{
    agent_uuid    = $payload.agent_uuid
    agent_token   = $payload.agent_token
    asset_id      = $payload.asset_id
    registered_at = (Get-Date).ToString('o')
    api_base      = $api
  }
  Save-State $state
  if ($payload.poll_interval_ms) { $script:PollMs = [int]$payload.poll_interval_ms }
  Write-AgentLog "Registered agent $($state.agent_uuid)"
  return $state
}

function Sync-Inventory {
  param($State, $CommandId = $null)
  $api = Get-ApiBase $script:ApiUrl
  $payload = Collect-Inventory
  if ($CommandId) { $payload.command_id = $CommandId }
  $headers = Get-AgentHeaders $State
  Write-AgentLog 'Inventory sync...'
  $res = Invoke-RestMethod -Uri "$api/agent/sync" -Method Post -Body ($payload | ConvertTo-Json -Depth 6) -Headers $headers
  $act = [string]$res.payload.action
  if (-not $act) {
    $act = $(if ($res.payload.created) { 'created' } elseif ($res.payload.matched) { 'updated' } else { 'unmatched' })
  }
  $tag = $res.payload.asset.asset_tag
  Write-AgentLog "Sync OK — action=$act tag=$tag matched_by=$($res.payload.matched_by)"
  return $res
}

function Send-Heartbeat {
  param($State)
  $api = Get-ApiBase $script:ApiUrl
  $body = @{
    hostname      = [System.Net.Dns]::GetHostName()
    platform      = 'windows'
    agent_version = $agentVersion
  } | ConvertTo-Json
  $headers = Get-AgentHeaders $State
  return (Invoke-RestMethod -Uri "$api/agent/heartbeat" -Method Post -Body $body -Headers $headers)
}

function Write-EnvFile {
  $envFile = Join-Path $script:InstallDir 'env.ps1'
  @"
`$env:REFEX_API_URL = '$((Get-ApiBase $script:ApiUrl))'
`$env:REFEX_AGENT_KEY = '$($script:AgentKey -replace "'", "''")'
`$env:REFEX_ASSET_TAG = '$($script:AssetTag -replace "'", "''")'
`$env:REFEX_AGENT_POLL_MS = '$($script:PollMs)'
`$env:REFEX_AGENT_INTERVAL_MS = '$($script:FullSyncMs)'
`$env:REFEX_AGENT_STATE_DIR = '$($script:InstallDir -replace "'", "''")'
"@ | Set-Content -Path $envFile -Encoding UTF8
  return $envFile
}

function Install-AgentTask {
  if (-not (Test-IsAdmin)) { throw 'Install requires Administrator. Right-click → Run as administrator.' }
  New-Item -ItemType Directory -Path $script:InstallDir -Force | Out-Null
  $null = Write-EnvFile
  $self = Get-SelfLaunch
  $runner = Join-Path $script:InstallDir 'run.cmd'
  $dir = $script:InstallDir

  if ($self.Kind -eq 'exe') {
    Copy-Item -LiteralPath $self.Path -Destination (Join-Path $dir 'ITAgent_2026.exe') -Force
    $exe = Join-Path $dir 'ITAgent_2026.exe'
    @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& { . '$dir\env.ps1'; & '$exe' -Mode service }"
"@ | Set-Content -Path $runner -Encoding ASCII
  } else {
    Copy-Item -LiteralPath $self.Path -Destination (Join-Path $dir 'ITAgent_2026_App.ps1') -Force
    $app = Join-Path $dir 'ITAgent_2026_App.ps1'
    @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& { . '$dir\env.ps1'; & '$app' -Mode service }"
"@ | Set-Content -Path $runner -Encoding ASCII
  }

  $action = New-ScheduledTaskAction -Execute $runner
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Write-AgentLog "Installed scheduled task $taskName → $runner"
  return "Installed. Task: $taskName`nAPI: $(Get-ApiBase $script:ApiUrl)`nState: $dir"
}

function Uninstall-AgentTask {
  if (-not (Test-IsAdmin)) { throw 'Uninstall requires Administrator.' }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-AgentLog "Removed scheduled task $taskName"
  return "Removed scheduled task $taskName"
}

function Invoke-SyncOnce {
  $env:REFEX_API_URL = Get-ApiBase $script:ApiUrl
  $env:REFEX_AGENT_KEY = $script:AgentKey
  $env:REFEX_ASSET_TAG = $script:AssetTag
  $env:REFEX_AGENT_STATE_DIR = $script:InstallDir
  $state = Load-State
  if (-not $state -or -not $state.agent_uuid) { $state = Register-Agent }
  $res = Sync-Inventory $state
  $tag = [string]$res.payload.asset.asset_tag
  $id = [string]$res.payload.asset.id
  $act = [string]$res.payload.action
  return "Sync OK — $act`nAsset: $tag (id $id)"
}

function Start-ServiceLoop {
  $script:ApiUrl = if ($env:REFEX_API_URL) { $env:REFEX_API_URL } else { $script:ApiUrl }
  $script:AgentKey = if ($env:REFEX_AGENT_KEY) { $env:REFEX_AGENT_KEY } else { $script:AgentKey }
  $script:AssetTag = if ($env:REFEX_ASSET_TAG) { $env:REFEX_ASSET_TAG } else { $script:AssetTag }
  if ($env:REFEX_AGENT_POLL_MS) { $script:PollMs = [int]$env:REFEX_AGENT_POLL_MS }
  if ($env:REFEX_AGENT_INTERVAL_MS) { $script:FullSyncMs = [int]$env:REFEX_AGENT_INTERVAL_MS }
  if ($env:REFEX_AGENT_STATE_DIR) {
    $script:InstallDir = $env:REFEX_AGENT_STATE_DIR
    $script:StateFile = Join-Path $script:InstallDir 'agent.json'
    $script:ServiceLog = Join-Path $script:InstallDir 'service.log'
  }

  Write-AgentLog "Service start → $(Get-ApiBase $script:ApiUrl) poll=$($script:PollMs)ms"
  $state = Load-State
  if (-not $state -or -not $state.agent_uuid -or -not $state.agent_token) {
    $state = Register-Agent
  }
  try { Sync-Inventory $state | Out-Null } catch { Write-AgentLog "Initial sync failed: $($_.Exception.Message)" }
  $lastFull = [datetime]::UtcNow

  while ($true) {
    try {
      $hb = Send-Heartbeat $state
      foreach ($cmd in @($hb.payload.commands)) {
        if (-not $cmd) { continue }
        $name = [string]$cmd.command
        Write-AgentLog "Command #$($cmd.id): $name"
        if ($name -eq 'scan' -or $name -eq 'rerun') {
          try {
            Sync-Inventory $state $cmd.id | Out-Null
          } catch {
            $api = Get-ApiBase $script:ApiUrl
            $errBody = @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json
            Invoke-RestMethod -Uri "$api/agent/commands/$($cmd.id)/ack" -Method Post -Body $errBody -Headers (Get-AgentHeaders $state) | Out-Null
            Write-AgentLog "Command failed: $($_.Exception.Message)"
          }
        }
      }
      if (([datetime]::UtcNow - $lastFull).TotalMilliseconds -ge $script:FullSyncMs) {
        Sync-Inventory $state | Out-Null
        $lastFull = [datetime]::UtcNow
      }
    } catch {
      Write-AgentLog "Loop error: $($_.Exception.Message)"
      if ($_.Exception.Message -match '401|Unauthorized|Invalid agent') {
        try { $state = Register-Agent } catch { Write-AgentLog "Re-register failed: $($_.Exception.Message)" }
      }
    }
    Start-Sleep -Milliseconds $script:PollMs
  }
}

function Show-Gui {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  [System.Windows.Forms.Application]::EnableVisualStyles()

  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'ITAgent_2026 — Refex IT Asset Agent'
  $form.Size = New-Object System.Drawing.Size(520, 420)
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)

  $y = 16
  function Add-LabeledText([string]$label, [string]$value, [int]$top) {
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = $label
    $lbl.Location = New-Object System.Drawing.Point(20, $top)
    $lbl.Size = New-Object System.Drawing.Size(100, 22)
    $form.Controls.Add($lbl)
    $tb = New-Object System.Windows.Forms.TextBox
    $tb.Text = $value
    $tb.Location = New-Object System.Drawing.Point(130, ($top - 2))
    $tb.Size = New-Object System.Drawing.Size(350, 24)
    $form.Controls.Add($tb)
    return $tb
  }

  $tbApi = Add-LabeledText 'API URL' $ApiUrl $y; $y += 36
  $tbKey = Add-LabeledText 'Agent key' $AgentKey $y; $y += 36
  $tbTag = Add-LabeledText 'Asset tag' $AssetTag $y; $y += 40

  $status = New-Object System.Windows.Forms.TextBox
  $status.Multiline = $true
  $status.ReadOnly = $true
  $status.ScrollBars = 'Vertical'
  $status.Location = New-Object System.Drawing.Point(20, 150)
  $status.Size = New-Object System.Drawing.Size(460, 140)
  $status.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
  $status.Text = "Ready.`r`n1) Install & Start — always-on agent (remote scan from UI)`r`n2) Sync once — one inventory push`r`n3) Uninstall — remove startup task`r`n`r`nRun Install as Administrator."
  $form.Controls.Add($status)

  function Apply-Fields {
    $script:ApiUrl = $tbApi.Text.Trim()
    $script:AgentKey = $tbKey.Text.Trim()
    $script:AssetTag = $tbTag.Text.Trim()
  }

  function Set-Status([string]$msg) {
    $status.Text = $msg
    $status.SelectionStart = $status.Text.Length
    $status.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
  }

  $btnInstall = New-Object System.Windows.Forms.Button
  $btnInstall.Text = 'Install & Start'
  $btnInstall.Location = New-Object System.Drawing.Point(20, 310)
  $btnInstall.Size = New-Object System.Drawing.Size(140, 36)
  $btnInstall.BackColor = [System.Drawing.Color]::FromArgb(11, 110, 102)
  $btnInstall.ForeColor = [System.Drawing.Color]::White
  $btnInstall.FlatStyle = 'Flat'
  $btnInstall.Add_Click({
    try {
      Apply-Fields
      if (-not (Test-IsAdmin)) {
        $self = Get-SelfLaunch
        $args = "-Mode install -ApiUrl `"$($script:ApiUrl)`" -AgentKey `"$($script:AgentKey)`" -AssetTag `"$($script:AssetTag)`""
        if ($self.Kind -eq 'exe') {
          Start-Process -FilePath $self.Path -Verb RunAs -ArgumentList $args | Out-Null
        } else {
          Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$($self.Path)`" $args" | Out-Null
        }
        Set-Status 'Elevated Install window opened. Approve UAC, then check status there.'
        return
      }
      Set-Status (Install-AgentTask)
    } catch { Set-Status "Install failed:`r`n$($_.Exception.Message)" }
  })
  $form.Controls.Add($btnInstall)

  $btnSync = New-Object System.Windows.Forms.Button
  $btnSync.Text = 'Sync once'
  $btnSync.Location = New-Object System.Drawing.Point(175, 310)
  $btnSync.Size = New-Object System.Drawing.Size(120, 36)
  $btnSync.Add_Click({
    try {
      Apply-Fields
      Set-Status 'Syncing inventory…'
      Set-Status (Invoke-SyncOnce)
    } catch { Set-Status "Sync failed:`r`n$($_.Exception.Message)" }
  })
  $form.Controls.Add($btnSync)

  $btnUn = New-Object System.Windows.Forms.Button
  $btnUn.Text = 'Uninstall'
  $btnUn.Location = New-Object System.Drawing.Point(310, 310)
  $btnUn.Size = New-Object System.Drawing.Size(100, 36)
  $btnUn.Add_Click({
    try {
      Apply-Fields
      if (-not (Test-IsAdmin)) {
        $self = Get-SelfLaunch
        $args = '-Mode uninstall'
        if ($self.Kind -eq 'exe') {
          Start-Process -FilePath $self.Path -Verb RunAs -ArgumentList $args | Out-Null
        } else {
          Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$($self.Path)`" $args" | Out-Null
        }
        Set-Status 'Elevated Uninstall window opened.'
        return
      }
      Set-Status (Uninstall-AgentTask)
    } catch { Set-Status "Uninstall failed:`r`n$($_.Exception.Message)" }
  })
  $form.Controls.Add($btnUn)

  $btnFolder = New-Object System.Windows.Forms.Button
  $btnFolder.Text = 'Logs'
  $btnFolder.Location = New-Object System.Drawing.Point(420, 310)
  $btnFolder.Size = New-Object System.Drawing.Size(60, 36)
  $btnFolder.Add_Click({
    if (-not (Test-Path $script:InstallDir)) { New-Item -ItemType Directory -Path $script:InstallDir -Force | Out-Null }
    Start-Process explorer.exe $script:InstallDir
  })
  $form.Controls.Add($btnFolder)

  [void]$form.ShowDialog()
}

# --- entry ---
$script:ApiUrl = $ApiUrl
$script:AgentKey = $AgentKey
$script:AssetTag = $AssetTag
$script:PollMs = $PollMs
$script:FullSyncMs = $FullSyncMs

switch ($Mode) {
  'gui' { Show-Gui }
  'install' {
    $msg = Install-AgentTask
    Write-Host $msg
    if (-not $env:REFEX_AGENT_NO_PAUSE) { Read-Host 'Press Enter to close'; }
  }
  'uninstall' {
    $msg = Uninstall-AgentTask
    Write-Host $msg
    if (-not $env:REFEX_AGENT_NO_PAUSE) { Read-Host 'Press Enter to close' }
  }
  'sync' {
    Write-Host (Invoke-SyncOnce)
  }
  'service' { Start-ServiceLoop }
}
