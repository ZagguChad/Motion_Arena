@echo off
title Motion Arena
echo.
echo   ========================================
echo        MOTION ARENA - Starting Server
echo   ========================================
echo.

:: Kill any existing Node processes on our ports
echo   Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3443 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "%~dp0"
timeout /t 1 /nobreak >nul
start http://localhost:3000
node server.js
pause
