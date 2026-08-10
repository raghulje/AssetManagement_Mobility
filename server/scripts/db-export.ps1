# Export MySQL database to a .sql dump (local host MySQL or published compose port).
# Usage:
#   .\server\scripts\db-export.ps1
#   .\server\scripts\db-export.ps1 -OutFile .\itam-dump.sql -Host 127.0.0.1 -Port 3306
param(
  [string]$OutFile = (Join-Path (Get-Location) ("itam-dump-{0:yyyyMMdd-HHmm}.sql" -f (Get-Date))),
  [string]$Host = $(if ($env:DB_HOST) { $env:DB_HOST } else { '127.0.0.1' }),
  [int]$Port = $(if ($env:DB_PORT) { [int]$env:DB_PORT } else { 3306 }),
  [string]$User = $(if ($env:DB_USER) { $env:DB_USER } else { 'raghul' }),
  [string]$Password = $(if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { '' }),
  [string]$Database = $(if ($env:DB_NAME) { $env:DB_NAME } else { 'ITAssetManagement_2026' })
)

$mysqldump = Get-Command mysqldump -ErrorAction SilentlyContinue
if (-not $mysqldump) {
  Write-Error "mysqldump not found on PATH. Install MySQL client tools, then retry."
  exit 1
}

if (-not $Password) {
  $secure = Read-Host "MySQL password for user '$User'" -AsSecureString
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  )
}

Write-Host "Exporting $Database from ${Host}:$Port → $OutFile" -ForegroundColor Cyan
$env:MYSQL_PWD = $Password
& mysqldump `
  -h $Host -P $Port -u $User `
  --single-transaction --routines --triggers --events `
  --default-character-set=utf8mb4 `
  $Database | Set-Content -Path $OutFile -Encoding utf8
Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
  Write-Error "mysqldump failed (exit $LASTEXITCODE)"
  exit $LASTEXITCODE
}
Write-Host "Done: $OutFile" -ForegroundColor Green
