# Croquis, tanda t4 (René, 2026-11-16): el arranque del 3D de Unity por partes en esta computadora
# (WebAssembly, motor listo, caso cargado, primer cuadro, tarea más larga), con AXA y un caso nuevo
# (la narración de ejemplo grabada: no gasta API), primera y segunda visita. Con ventana (usa la
# tarjeta de video): no muevas el ratón mientras mide (unos 5 min).
#
# t4c (René, 2026-11-18): en la t4 y la t4b el visor se quedó «arrancando» 5 minutos. El registro
# dice por qué: el Chromium de Playwright no compiló el WebAssembly de Unity («Compiling function
# #10005 failed: not enough arguments on the stack for select»), y el visor cayó al respaldo. El
# Chrome instalado sí lo compila (fps-web corre en él). Ahora se mide en ese Chrome, contra la demo
# local de esta máquina (el build de Unity de .cache: nada baja de Vercel Blob), con la tarjeta de
# alto rendimiento. Deja eval\results\rtx-t4\unity_arranque.json, con el navegador y la huella del
# WebAssembly que usó.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repo
New-Item -ItemType Directory -Force (Join-Path $repo "eval\results\rtx-t4") | Out-Null
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "tools\demo-local\demo-local.ps1") -Despues arranque-3d -Salida "eval/results/rtx-t4/unity_arranque.json"
if ($LASTEXITCODE) { throw "la medición del arranque terminó con el código $LASTEXITCODE" }
Write-Host "Listo: eval\results\rtx-t4\unity_arranque.json"
