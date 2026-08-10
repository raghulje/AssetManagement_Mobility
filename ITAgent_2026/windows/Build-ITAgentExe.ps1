# Build ITAgent_2026.exe from ITAgent_2026_App.ps1
# Usage:
#   .\Build-ITAgentExe.ps1
# Output:
#   .\dist\ITAgent_2026.exe

param(
  [string]$OutDir = (Join-Path $PSScriptRoot 'dist')
)

$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'ITAgent_2026_App.ps1'
if (-not (Test-Path $src)) { throw "Missing $src" }

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$out = Join-Path $OutDir 'ITAgent_2026.exe'
if (Test-Path $out) { Remove-Item $out -Force }

function Invoke-Compile {
  param([scriptblock]$Compile)
  & $Compile
}

if (Get-Command Invoke-ps2exe -ErrorAction SilentlyContinue) {
  Write-Host 'Using Invoke-ps2exe from session/module'
  Invoke-Compile {
    Invoke-ps2exe -inputFile $src -outputFile $out -title 'ITAgent_2026' `
      -description 'Refex IT Asset Management Windows Agent' -company 'Refex' `
      -product 'ITAgent_2026' -version '2026.1.0.0' -noConsole
  }
} elseif (Get-Module -ListAvailable -Name ps2exe) {
  Import-Module ps2exe -Force
  Write-Host 'Using installed ps2exe module'
  Invoke-ps2exe -inputFile $src -outputFile $out -title 'ITAgent_2026' `
    -description 'Refex IT Asset Management Windows Agent' -company 'Refex' `
    -product 'ITAgent_2026' -version '2026.1.0.0' -noConsole
} else {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ps2exe = Join-Path $env:TEMP 'ps2exe-mscholtes.ps1'
  if (-not (Test-Path $ps2exe) -or ((Get-Item $ps2exe).Length -lt 1000)) {
    Write-Host 'Downloading ps2exe compiler…'
    Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/MScholtes/PS2EXE/master/Module/ps2exe.ps1' `
      -OutFile $ps2exe -UseBasicParsing
  }
  Write-Host "Compiling with $ps2exe → $out"
  . $ps2exe
  Invoke-ps2exe -inputFile $src -outputFile $out -title 'ITAgent_2026' `
    -description 'Refex IT Asset Management Windows Agent' -company 'Refex' `
    -product 'ITAgent_2026' -version '2026.1.0.0' -noConsole
}

if (-not (Test-Path $out)) { throw 'Build failed — EXE not created' }

$size = [math]::Round((Get-Item $out).Length / 1KB)
Write-Host ""
Write-Host "OK: $out  ($size KB)"
Write-Host "Distribute this single file. Users double-click → Install & Start."
