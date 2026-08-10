# ITAgent_2026 — Windows inventory agent
# Collects hardware facts and POSTs to /api/v1/agent/sync

$ErrorActionPreference = 'Stop'

$apiBase = if ($env:REFEX_API_URL) { $env:REFEX_API_URL.TrimEnd('/') } else { 'http://localhost:3001/api/v1' }
$agentKey = $env:REFEX_AGENT_KEY
$assetTag = $env:REFEX_ASSET_TAG

Write-Host "ITAgent_2026 → $apiBase/agent/sync"

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$tz = Get-CimInstance Win32_TimeZone

$hostname = [System.Net.Dns]::GetHostName()
$serialnumber = [string]$bios.SerialNumber

# Installed software (prefer registry — faster/safer than Win32_Product)
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
  create_if_missing     = $true
}
if ($assetTag) { $payload.asset_tag = $assetTag }

Write-Host ""
Write-Host "Collected from this PC:"
Write-Host "  Hostname : $hostname"
Write-Host "  Serial   : $serialnumber"
Write-Host "  Model    : $($cs.Model)"
Write-Host "  OEM      : $($cs.Manufacturer)"
Write-Host "  OS       : $($os.Caption) $($os.Version)"
Write-Host "  CPU      : $($cpu.Name)"
Write-Host ""

$json = $payload | ConvertTo-Json -Depth 6
$headers = @{ 'Content-Type' = 'application/json' }
if ($agentKey) { $headers['X-Agent-Key'] = $agentKey }

try {
  $response = Invoke-RestMethod `
    -Uri "$apiBase/agent/sync" `
    -Method Post `
    -Body $json `
    -Headers $headers
  Write-Host "Sync OK"
  $response | ConvertTo-Json -Depth 6
}
catch {
  Write-Host "Sync failed"
  Write-Host $_.Exception.Message
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  exit 1
}
