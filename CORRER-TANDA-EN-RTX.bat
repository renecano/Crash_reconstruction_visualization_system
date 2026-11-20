@echo off
rem Croquis: lo pesado de la tanda vigente, en la computadora con la RTX. Doble clic y listo.
rem Instrucciones: LEEME-TANDA-RTX.md. Lo que hace: tools\colaborador\tanda.ps1.
chcp 65001 >nul
cd /d "%~dp0"
rem Si una tanda anterior se corto y la copia quedo en su rama o commit, el tanda.ps1 de aqui seria
rem el viejo: primero se regresa a main (Rene, 2026-11-20). El resto lo hace tanda.ps1.
set "CROQUIS_RAMA="
for /f "delims=" %%r in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CROQUIS_RAMA=%%r"
if defined CROQUIS_RAMA if not "%CROQUIS_RAMA%"=="main" (
  echo La copia estaba en %CROQUIS_RAMA%, no en main ^(una tanda anterior se corto^): regreso a main.
  git checkout -q main
  if errorlevel 1 (
    echo No pude regresar a main. Escribe en esta carpeta: git stash y despues git checkout main
    pause
    exit /b 1
  )
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\colaborador\tanda.ps1" %*
echo.
pause
