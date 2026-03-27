@echo off
title Knight Dash — Gyroscope Runner
color 0A

echo.
echo  ██╗  ██╗███╗   ██╗██╗ ██████╗ ██╗  ██╗████████╗    ██████╗  █████╗ ███████╗██╗  ██╗
echo  ██║ ██╔╝████╗  ██║██║██╔════╝ ██║  ██║╚══██╔══╝    ██╔══██╗██╔══██╗██╔════╝██║  ██║
echo  █████╔╝ ██╔██╗ ██║██║██║  ███╗███████║   ██║       ██║  ██║███████║███████╗███████║
echo  ██╔═██╗ ██║╚██╗██║██║██║   ██║██╔══██║   ██║       ██║  ██║██╔══██║╚════██║██╔══██║
echo  ██║  ██╗██║ ╚████║██║╚██████╔╝██║  ██║   ██║       ██████╔╝██║  ██║███████║██║  ██║
echo  ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝       ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
echo.
echo  ⚔️  GYROSCOPE ENDLESS RUNNER  ⚔️
echo.
echo  ─────────────────────────────────────────────────────
echo   CONTROLS:
echo     📱 Phone Gyroscope — Jerk/tilt phone UP to jump
echo     ⌨️  Keyboard        — SPACE or ARROW UP to jump
echo     🖱️  Mouse / Touch   — Click or Tap to jump
echo     ⏸️  Pause           — Press P or Escape
echo  ─────────────────────────────────────────────────────
echo.

:: Check if the game folder exists
if not exist "%~dp0index.html" (
    echo  ❌ ERROR: index.html not found in this folder!
    echo     Make sure launch_game.bat is inside the KnightDash folder.
    pause
    exit /b 1
)

:: Try to find the best available browser
set "GAME_PATH=%~dp0index.html"
set "BROWSER_FOUND=0"

:: Try Chrome first (best for DeviceMotion on Android)
for %%B in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
    if exist %%B (
        echo  🌐 Opening in Google Chrome...
        echo  ─────────────────────────────────────────────────────
        echo.
        echo  📱 TO USE GYROSCOPE:
        echo     1. Make sure your phone is on the SAME Wi-Fi as this PC
        echo     2. On your phone, open the URL shown in Chrome
        echo     3. Allow motion sensor permission when asked
        echo     4. Jerk your phone UPWARD quickly to make the knight jump!
        echo.
        start %%B --allow-file-access-from-files "%GAME_PATH%"
        set "BROWSER_FOUND=1"
        goto :done
    )
)

:: Try Edge
for %%B in (
    "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) do (
    if exist %%B (
        echo  🌐 Opening in Microsoft Edge...
        start %%B --allow-file-access-from-files "%GAME_PATH%"
        set "BROWSER_FOUND=1"
        goto :done
    )
)

:: Try Firefox
for %%B in (
    "%ProgramFiles%\Mozilla Firefox\firefox.exe"
    "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
) do (
    if exist %%B (
        echo  🌐 Opening in Firefox...
        start %%B "%GAME_PATH%"
        set "BROWSER_FOUND=1"
        goto :done
    )
)

:: Fallback — use default browser
if "%BROWSER_FOUND%"=="0" (
    echo  🌐 Opening with default browser...
    start "" "%GAME_PATH%"
    set "BROWSER_FOUND=1"
)

:done
echo.
echo  ✅ Game launched! Have fun jumping! ⚔️
echo.
echo  TIP: For gyroscope controls, serve via HTTPS or use
echo       Motion Arena's server (start.bat in parent folder)
echo.
timeout /t 5 /nobreak >nul
