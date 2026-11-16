# Croquis, tanda t4 (René, 2026-11-16): los fps del visor Unity en el navegador, en el sitio
# publicado (con el build que trae el daño y la cámara de personas), en los cuatro niveles. Corre
# tools\unity\medir-web.ps1 desde una carpeta de trabajo fuera del repo (su perfil de Chrome y sus
# mediciones no ensucian git) y deja el resultado en eval\results\rtx-t4\fps_web.json.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$trabajo = Join-Path $env:LOCALAPPDATA "croquis-rtx-t4\web"
New-Item -ItemType Directory -Force $trabajo | Out-Null
Copy-Item (Join-Path $repo "tools\unity\medir-web.ps1") $trabajo -Force
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $trabajo "medir-web.ps1") -Niveles "baja,media,alta,ultra"
if ($LASTEXITCODE) { throw "medir-web terminó con el código $LASTEXITCODE" }
$destino = Join-Path $repo "eval\results\rtx-t4"
New-Item -ItemType Directory -Force $destino | Out-Null
Copy-Item (Join-Path $trabajo "e6_unity_web_demo.json") (Join-Path $destino "fps_web.json") -Force
Write-Host "Listo: eval\results\rtx-t4\fps_web.json"
