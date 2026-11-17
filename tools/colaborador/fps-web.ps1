# Croquis, tanda t4 (René, 2026-11-16; sin Vercel Blob desde el 2026-11-17): los fps del visor Unity en
# el navegador, en los cuatro niveles. Desde el 2026-11-17 no mide el sitio publicado: compila el sitio
# en modo local (tools/demo-local/demo-local.ps1, el visor y los modelos servidos desde esta máquina),
# mide ahí con tools/unity/medir-web.ps1 y lo apaga. Es el mismo build de Unity que sirve producción;
# los fps dependen de la tarjeta de video, no de dónde se bajó. Deja eval/results/rtx-t4/fps_web.json.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "tools\demo-local\demo-local.ps1") -Despues fps-web -Salida (Join-Path $repo "eval\results\rtx-t4\fps_web.json")
if ($LASTEXITCODE) { throw "La medición de fps en el navegador terminó con el código $LASTEXITCODE" }
Write-Host "Listo: eval\results\rtx-t4\fps_web.json"
