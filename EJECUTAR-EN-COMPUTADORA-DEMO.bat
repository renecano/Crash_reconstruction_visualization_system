@echo off
rem Croquis en la computadora de la demo: doble clic y listo.
rem Instrucciones: LEEME-COMPUTADORA-DEMO.md. Lo que hace: tools\demo\computadora-demo.ps1.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\demo\computadora-demo.ps1" %*
echo.
pause
