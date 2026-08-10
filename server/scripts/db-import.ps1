# Import a .sql dump into MySQL (local or docker-compose published port).
# Typical server flow after `docker compose up -d`:
#   .\server\scripts\db-import.ps1 -InFile .\itam-dump.sql -Port 3307
param(
  [Parameter(Mandatory = $true)][string]$InFile,
  [string]$Host = '127.0.0.1',
  [int]$Port = $(if ($env:MYSQL_PUBLISH_PORT) { [int]$env:MYSQL_PUBLISH_PORT } else { 3307 }),
  [string]$User = $(if ($env:DB_USER) { $env:DB_USER } else { 'itam' }),
  [string]$Password = $(if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'itam_change_me' }),
  [string]$Database = $(if ($env:DB_NAME) { $env:DB_NAME } else { 'ITAssetManagement_2026' }),
  [switch]$ViaDocker
)

if (-not (Test-Path $InFile)) {
  Write-Error "File not found: $InFile"
  exit 1
}

if ($ViaDocker) {
  Write-Host "Importing $InFile into docker container itam-mysql → $Database" -ForegroundColor Cyan
  Get-Content -Raw $InFile | docker exec -i itam-mysql mysql -u$User -p$Password $Database
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Done (docker)." -ForegroundColor Green
  exit 0
}

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysql) {
  Write-Error "mysql client not found. Use -ViaDocker or install MySQL client tools."
  exit 1
}

Write-Host "Importing $InFile into ${Host}:$Port / $Database" -ForegroundColor Cyan
$env:MYSQL_PWD = $Password
Get-Content -Raw $InFile | & mysql -h $Host -P $Port -u $User $Database
$code = $LASTEXITCODE
Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
if ($code -ne 0) {
  Write-Error "mysql import failed (exit $code)"
  exit $code
}
Write-Host "Done." -ForegroundColor Green
