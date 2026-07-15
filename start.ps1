#!/usr/bin/env powershell
# INTELLAGENT All-in-One Startup Script for Windows
# Run this from your project root (D:\research)
# Usage: powershell -ExecutionPolicy Bypass -File start.ps1

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot
$ORCH = Join-Path $ROOT "mini-services\research-orchestrator"

Write-Host ""
Write-Host "  ====================================================" -ForegroundColor Cyan
Write-Host "            INTELLAGENT All-in-One Startup                  " -ForegroundColor Cyan
Write-Host "  ====================================================" -ForegroundColor Cyan
Write-Host ""

# --- Check prerequisites ---
Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow

$missing = @()

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    $missing += "bun (install from https://bun.sh)"
}

$pyOk = $false
$pyCmd = ""
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>$null
        if ($LASTEXITCODE -eq 0) { $pyOk = $true; $pyCmd = $cmd; break }
    } catch {}
}
if (-not $pyOk) {
    $missing += "python (install from https://python.org - check 'Add to PATH' during install)"
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "  [FAIL] Missing prerequisites:" -ForegroundColor Red
    foreach ($m in $missing) { Write-Host "     - $m" -ForegroundColor Red }
    Write-Host ""
    exit 1
}

Write-Host "  [OK] bun found" -ForegroundColor Green
Write-Host "  [OK] python found ($pyCmd)" -ForegroundColor Green

# --- Check directories exist ---
Write-Host ""
Write-Host "[2/6] Checking project structure..." -ForegroundColor Yellow

if (-not (Test-Path (Join-Path $ROOT "package.json"))) {
    Write-Host "  [FAIL] No package.json in $ROOT" -ForegroundColor Red
    Write-Host "     Run this script from the project root." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $ORCH)) {
    Write-Host "  [FAIL] mini-services\research-orchestrator not found" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Project structure OK" -ForegroundColor Green

# --- Install dependencies if needed ---
Write-Host ""
Write-Host "[3/6] Checking dependencies..." -ForegroundColor Yellow

$needInstall = $false
if (-not (Test-Path (Join-Path $ROOT "node_modules"))) { $needInstall = $true }
if (-not (Test-Path (Join-Path $ORCH "node_modules"))) { $needInstall = $true }

if ($needInstall) {
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location $ROOT
    bun install
    Pop-Location

    Write-Host "  Installing orchestrator dependencies..." -ForegroundColor Cyan
    Push-Location $ORCH
    bun install
    Pop-Location
    Write-Host "  [OK] Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  [OK] Dependencies already installed" -ForegroundColor Green
}

# --- Init database ---
Write-Host ""
Write-Host "[4/6] Checking database..." -ForegroundColor Yellow

$dbFile = Join-Path $ROOT "db\custom.db"
if (-not (Test-Path $dbFile)) {
    Write-Host "  Initializing database..." -ForegroundColor Cyan
    Push-Location $ROOT
    bun run db:push 2>$null
    Pop-Location
    Write-Host "  [OK] Database initialized" -ForegroundColor Green
} else {
    Write-Host "  [OK] Database exists" -ForegroundColor Green
}

# --- Kill anything on ports 3000 and 3003 ---
Write-Host ""
Write-Host "[5/6] Clearing ports 3000 and 3003..." -ForegroundColor Yellow

foreach ($port in @("3000", "3003")) {
    $conns = netstat -ano | Select-String ":$port\s" | Select-String "LISTENING"
    if ($conns) {
        foreach ($conn in $conns) {
            $parts = $conn -split '\s+'
            $procId = $parts[-1]
            if ($procId -and $procId -ne "0") {
                try {
                    taskkill /PID $procId /F 2>$null | Out-Null
                    Write-Host "  Killed PID $procId on port $port" -ForegroundColor DarkGray
                } catch {}
            }
        }
    }
}
Write-Host "  [OK] Ports cleared" -ForegroundColor Green

# --- Start both services ---
Write-Host ""
Write-Host "[6/6] Starting services..." -ForegroundColor Yellow
Write-Host ""

# Start orchestrator in a new window
Write-Host "  Starting orchestrator (port 3003)..." -ForegroundColor Cyan
$orchCmd = "cd '$ORCH'; Write-Host 'INTELLAGENT Orchestrator - port 3003'; bun run dev; Write-Host 'Press Enter to close'; Read-Host"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $orchCmd

Start-Sleep -Seconds 3

# Start frontend in a new window
Write-Host "  Starting frontend (port 3000)..." -ForegroundColor Cyan
$frontCmd = "cd '$ROOT'; Write-Host 'INTELLAGENT Frontend - port 3000'; bun run dev; Write-Host 'Press Enter to close'; Read-Host"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontCmd

# --- Done ---
Write-Host ""
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host "              STARTED SUCCESSFULLY                    " -ForegroundColor Green
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Two PowerShell windows opened:" -ForegroundColor White
Write-Host "    Window 1 = Orchestrator (port 3003)" -ForegroundColor Gray
Write-Host "    Window 2 = Frontend     (port 3000)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Wait 5-10 seconds for both to compile, then:" -ForegroundColor White
Write-Host ""
Write-Host "    Open:  http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Look for 'orchestrator live' in the top-right." -ForegroundColor White
Write-Host "  If it says 'reconnecting...', check the orchestrator window for errors." -ForegroundColor Gray
Write-Host ""
Write-Host "  To configure Ollama/LM Studio:" -ForegroundColor White
Write-Host "    Click Settings (gear icon) -> select provider -> Fetch -> Save" -ForegroundColor Gray
Write-Host ""

# Auto-open browser after delay
Write-Host "  Opening browser in 8 seconds..." -ForegroundColor DarkGray
Start-Sleep -Seconds 8
Start-Process "http://localhost:3000"
