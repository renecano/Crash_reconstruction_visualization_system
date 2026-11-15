@echo off
rem Croquis: lo pesado de la tanda vigente, en la computadora con la RTX. Doble clic y listo.
rem Instrucciones: LEEME-TANDA-RTX.md. Lo que hace: tools\colaborador\tanda.ps1.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\colaborador\tanda.ps1" %*
echo.
pause
