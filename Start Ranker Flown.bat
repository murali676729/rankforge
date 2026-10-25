@echo off
setlocal
title Ranker Flown
cd /d "%~dp0"

set "PORT=5173"
set "URL=http://localhost:%PORT%/"

echo.
echo   ===============================
echo     Ranker Flown - video editor
echo   ===============================
echo.

rem --- Node.js must be installed (Vite 5 needs version 18 or newer) ---
where node >nul 2>nul
if errorlevel 1 (
  echo   ERROR: Node.js is not installed or not on PATH.
  echo   Install the LTS version from https://nodejs.org and run this again.
  goto fail
)
for /f "tokens=1 delims=v." %%v in ('node -v') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 18 (
  echo   ERROR: Node.js 18 or newer is required. You have:
  node -v
  echo   Update it from https://nodejs.org and run this again.
  goto fail
)

rem --- Already running? Then just open it instead of starting a second copy ---
rem     exit 0 = Ranker Flown answers, 2 = some other program owns the port, 1 = nothing there
powershell -NoProfile -Command "try { $r = Invoke-WebRequest '%URL%' -UseBasicParsing -TimeoutSec 3; if ($r.Content -match 'RankForge') { exit 0 } else { exit 2 } } catch { if ($_.Exception.Response) { exit 2 } else { exit 1 } }"
if %errorlevel%==0 (
  echo   Ranker Flown is already running. Opening %URL%
  if /i not "%BROWSER%"=="none" start "" "%URL%"
  timeout /t 3 >nul
  exit /b 0
)
if %errorlevel%==2 (
  echo   ERROR: Port %PORT% is being used by another program.
  echo   Close that program, or restart the PC, then run this again.
  goto fail
)

rem --- First run, or dependencies were deleted: install them ---
if not exist "node_modules\vite" (
  echo   Installing dependencies - first run only, this can take a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo   ERROR: "npm install" failed. Check your internet connection and run this again.
    goto fail
  )
)

echo   Starting... your browser will open when the editor is ready.
echo.
echo   KEEP THIS WINDOW OPEN while you use Ranker Flown.
echo   To stop it: close this window, or press Ctrl+C.
echo.
rem Vite opens the browser itself once the server is ready (server.open in vite.config.js).
call npm run dev -- --strictPort
if errorlevel 1 (
  echo.
  echo   ERROR: The server stopped with an error. Read the messages above.
  goto fail
)
exit /b 0

:fail
echo.
pause
exit /b 1
