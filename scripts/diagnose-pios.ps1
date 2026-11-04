$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Write-Host "--- Docker version ---" -ForegroundColor Cyan
docker --version
Write-Host "--- Container status ---" -ForegroundColor Cyan
docker compose ps
Write-Host "--- Backend health ---" -ForegroundColor Cyan
try {
    $backendBinding = (docker compose port backend 8080 | Select-Object -First 1)
    if ($backendBinding -notmatch ':(\d+)$') { throw "Backend has no published port; check container status." }
    Invoke-WebRequest -Uri "http://localhost:$($Matches[1])/actuator/health" -TimeoutSec 5 -UseBasicParsing | Select-Object -ExpandProperty Content
} catch { Write-Host $_.Exception.Message -ForegroundColor Yellow }
Write-Host "--- Recent logs ---" -ForegroundColor Cyan
docker compose logs --tail=100 db backend frontend
