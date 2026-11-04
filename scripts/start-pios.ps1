param(
    [switch]$SkipBrowser
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function New-Base64Secret([int]$Length = 32) {
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

Write-Host "PIOS local setup" -ForegroundColor Green
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found. Install Docker Desktop, then reopen PowerShell."
}
try { docker info *> $null } catch {
    throw "Docker Desktop is not running. Start Docker Desktop with the Linux container engine, then run this script again."
}
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop is not ready. Wait for Docker Desktop to finish starting, then retry."
}

$EnvFile = Join-Path $Root ".env"
if (-not (Test-Path $EnvFile)) {
    $dbPassword = New-Base64Secret 32
    $jwtSecret = New-Base64Secret 32
    $encryptionKey = New-Base64Secret 32
    @(
        "DB_PASSWORD=$dbPassword"
        "APP_JWT_SECRET_BASE64=$jwtSecret"
        "PIOS_ENCRYPTION_KEY=$encryptionKey"
        "NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1"
    ) | Set-Content -Path $EnvFile -Encoding ascii
    Write-Host "Created .env with three independent random secrets." -ForegroundColor Green
    Write-Host "Keep .env private. Back up PIOS_ENCRYPTION_KEY; do not rotate it after saving AI provider keys." -ForegroundColor Yellow
} else {
    $envText = Get-Content $EnvFile -Raw
    foreach ($name in @("DB_PASSWORD", "APP_JWT_SECRET_BASE64", "PIOS_ENCRYPTION_KEY")) {
        if ($envText -notmatch "(?m)^$name=.+$") {
            throw ".env is missing $name. Add a strong value or remove .env and rerun this script to regenerate local secrets."
        }
        if ($envText -match "(?m)^$name=replace-me$") {
            throw ".env still contains the placeholder for $name. Remove .env and rerun this script."
        }
    }
}

Write-Host "Building and starting PIOS containers. First run downloads dependencies and container images." -ForegroundColor Cyan
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed. Inspect with: docker compose logs --tail=150" }

$backendBinding = (docker compose port backend 8080 | Select-Object -First 1)
$frontendBinding = (docker compose port frontend 3000 | Select-Object -First 1)
if ($backendBinding -notmatch ':(\d+)$') { throw "Could not determine the backend port." }
$backendUrl = "http://localhost:$($Matches[1])"
if ($frontendBinding -notmatch ':(\d+)$') { throw "Could not determine the frontend port." }
$frontendUrl = "http://localhost:$($Matches[1])"

Write-Host "Waiting for the backend health endpoint..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "$backendUrl/actuator/health" -TimeoutSec 3 -UseBasicParsing
        if ($response.StatusCode -eq 200) { $ready = $true; break }
        Start-Sleep -Seconds 2
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) {
    Write-Host "The backend did not become healthy within the local startup window." -ForegroundColor Yellow
    Write-Host "Check logs with: docker compose logs --tail=200 backend db frontend" -ForegroundColor Yellow
    exit 1
}

Write-Host "PIOS backend is healthy." -ForegroundColor Green
Write-Host "Waiting for the frontend..." -ForegroundColor Cyan
$frontendReady = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $response = Invoke-WebRequest -Uri $frontendUrl -TimeoutSec 3 -UseBasicParsing
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $frontendReady = $true; break }
        Start-Sleep -Seconds 2
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $frontendReady) {
    Write-Host "The frontend did not respond within the local startup window." -ForegroundColor Yellow
    Write-Host "Check logs with: docker compose logs --tail=200 frontend backend" -ForegroundColor Yellow
    exit 1
}

Write-Host "PIOS is ready." -ForegroundColor Green
Write-Host "Frontend: $frontendUrl"
Write-Host "Backend:  $backendUrl/actuator/health"
if (-not $SkipBrowser) { Start-Process $frontendUrl }
