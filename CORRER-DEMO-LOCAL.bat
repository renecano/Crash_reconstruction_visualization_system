@echo off
rem Croquis en esta computadora, sin Vercel ni internet (salvo la lectura con IA y el mapa).
rem Instrucciones: LEEME-DEMO-LOCAL.md. Lo que hace: tools\demo-local\demo-local.ps1.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\demo-local\demo-local.ps1" %*
echo.
pause
