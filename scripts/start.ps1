# IceQ Sole - start API, storefront and dashboard in three windows (Windows)
# powershell -ExecutionPolicy Bypass -File scripts\start.ps1
$root = Split-Path -Parent $PSScriptRoot

Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\store'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\dashboard'; npm run dev"

Write-Host 'Starting...'
Write-Host '  Storefront : http://localhost:5173'
Write-Host '  Dashboard  : http://localhost:5174'
Write-Host '  API docs   : http://localhost:8000/api/docs'
Start-Sleep -Seconds 6
Start-Process 'http://localhost:5173'
