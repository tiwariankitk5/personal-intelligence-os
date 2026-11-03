$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Write-Host "--- Docker version ---" -ForegroundColor Cyan
docker --version
Write-Host "--- Container status ---" -ForegroundColor Cyan
docker compose ps
Write-Host "--- Backend health ---" -ForegroundColor Cyan
try { Invoke-WebRequest -Uri "http://localhost:8080/actuator/health" -TimeoutSec 5 -UseBasicParsing | Select-Object -ExpandProperty Content } catch { Write-Host $_.Exception.Message -ForegroundColor Yellow }
Write-Host "--- Recent logs ---" -ForegroundColor Cyan
docker compose logs --tail=100 db backend frontend
