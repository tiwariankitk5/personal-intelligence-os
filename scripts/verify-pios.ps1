param(
    [ValidateSet('frontend', 'backend', 'full')][string]$Scope = 'full',
    [switch]$Build,
    [switch]$Audit,
    [switch]$Smoke,
    [string]$PythonPath,
    [string]$ApiUrl,
    [switch]$Plan
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root '.validation'
$steps = @()
$npm = 'npm.cmd'
if ($env:OS -ne 'Windows_NT') { $npm = 'npm' }
if ($Scope -in @('frontend', 'full')) {
    $steps += @{ Name='frontend-tests'; Dir='frontend'; Exe=$npm; Args=@('test') }
    $steps += @{ Name='frontend-types'; Dir='frontend'; Exe=$npm; Args=@('run','typecheck') }
    if ($Build) { $steps += @{ Name='frontend-build'; Dir='frontend'; Exe=$npm; Args=@('run','build') } }
    if ($Audit) { $steps += @{ Name='frontend-audit'; Dir='frontend'; Exe=$npm; Args=@('audit','--omit=dev','--audit-level=high') } }
}
if ($Scope -in @('backend', 'full')) {
        if (-not $PythonPath) {
            $PythonPath = Join-Path $root 'backend-python/.venv/Scripts/python.exe'
            if (-not (Test-Path $PythonPath)) { $PythonPath = Join-Path $root 'backend-python/.venv/bin/python' }
            if (-not (Test-Path $PythonPath)) { $PythonPath = 'python' }
        }
        $steps += @{ Name='backend-python-tests'; Dir='backend-python'; Exe=$PythonPath; Args=@('-m','pytest','-q') }
        $steps += @{ Name='backend-python-lint'; Dir='backend-python'; Exe=$PythonPath; Args=@('-m','ruff','check','pios','tests') }
        if ($Build) { $steps += @{ Name='backend-python-build'; Dir=''; Exe='docker'; Args=@('build','-f','backend-python/Dockerfile','-t','pios-fastapi:verified','.') } }
        if ($Audit) { $steps += @{ Name='backend-python-audit'; Dir='backend-python'; Exe=$PythonPath; Args=@('-m','pip_audit','-r','requirements.txt') } }

}
if ($Smoke) { $steps += @{ Name='api-smoke'; Dir=''; Exe='node'; Args=@('scripts/smoke-test.mjs') } }
if ($Plan) {
    foreach ($step in $steps) { Write-Output ("{0}: {1} {2}" -f $step.Name,$step.Exe,($step.Args -join ' ')) }
    if ($Smoke) { Write-Output 'Smoke uses an already running local backend and creates two test accounts.' }
    exit 0
}

$oldApiUrl = $env:PIOS_TEST_API_URL
try {
    if ($Smoke) {
        if (-not $ApiUrl) {
            Push-Location $root
            try { $binding = & docker compose port backend 8080 2>$null; $portCode = $LASTEXITCODE } finally { Pop-Location }
            if ($portCode -ne 0 -or ($binding -join '') -notmatch ':(\d+)\s*$') { throw 'Cannot find the local backend. Start the stack or pass -ApiUrl http://localhost:8180/api/v1.' }
            $ApiUrl = "http://localhost:$($Matches[1])/api/v1"
        }
        $parsed = [Uri]$ApiUrl
        if (-not $parsed.IsAbsoluteUri -or $parsed.Scheme -notin @('http','https') -or $parsed.Host -notin @('localhost','127.0.0.1','[::1]','::1')) { throw 'Smoke creates accounts; use a local disposable backend URL.' }
        $env:PIOS_TEST_API_URL = $ApiUrl.TrimEnd('/')
        Write-Host 'API smoke will create two local test accounts.'
    }
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    foreach ($step in $steps) {
        $log = Join-Path $logDir ($step.Name + '.log')
        if (-not (Get-Command $step.Exe -ErrorAction SilentlyContinue)) { throw "Missing command: $($step.Exe). Install/configure it before retrying." }
        Write-Host "Running $($step.Name)..."
        Push-Location (Join-Path $root $step.Dir)
        try {
            $previousPreference = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try { & $step.Exe @($step.Args) *> $log; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $previousPreference }
        } finally { Pop-Location }
        if ($code -ne 0) {
            Get-Content -LiteralPath $log -Tail 25 | ForEach-Object {
                if ($_.Length -gt 350) { Write-Host ($_.Substring(0,350) + ' ... [see full log]') } else { Write-Host $_ }
            }
            Write-Host "FAIL $($step.Name) (exit $code). Full log: $log"
            exit $code
        }
        Write-Host "PASS $($step.Name)"
    }
    Write-Host "Validation passed ($($steps.Count) checks). Logs: $logDir"
} catch {
    Write-Host "Validation stopped: $($_.Exception.Message)"
    exit 1
} finally { $env:PIOS_TEST_API_URL = $oldApiUrl }
