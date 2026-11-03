param([switch]$RemoveData)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if ($RemoveData) {
    Write-Warning "This permanently deletes the PIOS PostgreSQL and uploaded-file Docker volumes."
    $confirm = Read-Host "Type DELETE to continue"
    if ($confirm -ne "DELETE") { Write-Host "Cancelled."; exit 0 }
    docker compose down -v
} else {
    docker compose down
    Write-Host "PIOS stopped. Data volumes were preserved."
}
