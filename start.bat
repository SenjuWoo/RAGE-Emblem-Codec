@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for the portable local mode.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:4173"
node tools\serve.mjs
