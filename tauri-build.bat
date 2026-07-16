@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
cd /d "%~dp0"
npm run tauri:build
echo.
echo Build complete! Installer is in: src-tauri\target\release\bundle\
