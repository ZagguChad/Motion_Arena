@echo off
title Tower Siege - Push-Up Battle
color 0E

echo.
echo   ========================================
echo     TOWER SIEGE - Push-Up Battle Game
echo   ========================================
echo.

cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo   [*] Installing dependencies...
    call npm install
    echo.
)

echo   Starting server...
echo.
echo   Laptop Game : http://localhost:3000/game/
echo   Phone URL   : Scan QR on screen (HTTPS)
echo.
echo   NOTE: On phone, tap "Advanced" then
echo         "Proceed" on the certificate warning.
echo.
echo   Press Ctrl+C to stop the server
echo   ========================================
echo.

start http://localhost:3000/game/
node server/server.js
pause
