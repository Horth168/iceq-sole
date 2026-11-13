# IceQ Sole - first-time setup for Windows (PowerShell 5.1+)
# Run from the project folder:   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Step 'Checking Python and Node.js'
$py = $null
foreach ($candidate in @('py -3.13', 'py -3.12', 'python')) {
    try {
        $v = Invoke-Expression "$candidate --version" 2>$null
        if ($v -match 'Python 3\.(1[2-9])') { $py = $candidate; break }
    } catch { }
}
if (-not $py) { throw 'Python 3.12 or 3.13 is required. Install it from https://www.python.org/downloads/ (tick "Add to PATH").' }
Write-Host "Using $py ($v)"
try { $nv = node --version } catch { throw 'Node.js 20+ is required. Install the LTS version from https://nodejs.org/' }
Write-Host "Node $nv"

Step 'Creating Python virtual environment (backend\.venv)'
if (-not (Test-Path 'backend\.venv')) { Invoke-Expression "$py -m venv backend\.venv" }
& backend\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& backend\.venv\Scripts\pip.exe install -r backend\requirements.txt --quiet

Step 'Creating backend\.env (only if it does not exist)'
if (-not (Test-Path 'backend\.env')) {
    $secret = & backend\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
    (Get-Content 'backend\.env.example') -replace '^SECRET_KEY=.*', "SECRET_KEY=$secret" | Set-Content -Encoding utf8 'backend\.env'
    Write-Host 'backend\.env created with a fresh random SECRET_KEY'
} else {
    $envText = Get-Content 'backend\.env' -Raw
    if ($envText -notmatch 'SECRET_KEY=\S{32,}') { throw 'backend\.env exists but SECRET_KEY is missing or shorter than 32 characters.' }
    Write-Host 'backend\.env already exists - left unchanged'
}

Step 'Creating database tables (Alembic migrations)'
Push-Location backend
& .\.venv\Scripts\alembic.exe upgrade head
Step 'Loading demo catalogue, banners and sample orders'
& .\.venv\Scripts\python.exe seed.py --demo-orders
Pop-Location

Step 'Installing storefront and dashboard packages'
Push-Location store;     npm install --no-audit --no-fund; Pop-Location
Push-Location dashboard; npm install --no-audit --no-fund; Pop-Location

Step 'Create your admin account'
Push-Location backend
& .\.venv\Scripts\python.exe create_admin.py
Pop-Location

Write-Host "`nAll set! Start everything with:  powershell -ExecutionPolicy Bypass -File scripts\start.ps1" -ForegroundColor Green
