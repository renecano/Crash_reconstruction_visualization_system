# Croquis, tanda t4 (René, 2026-11-16): el arranque del 3D de Unity por partes en esta computadora
# (WebAssembly, motor listo, caso cargado, primer cuadro, tarea más larga), en el sitio publicado,
# con AXA y un caso nuevo (la narración de ejemplo grabada: no gasta API), primera y segunda visita.
# Abre Chromium con ventana (usa la tarjeta de video): no muevas el ratón mientras mide (unos 5 min).
# Deja eval\results\rtx-t4\unity_arranque.json.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repo
New-Item -ItemType Directory -Force (Join-Path $repo "eval\results\rtx-t4") | Out-Null
Write-Host "Instalando Chromium para Playwright (si falta)..."
& pnpm --filter "@croquis/web" exec playwright install chromium
if ($LASTEXITCODE) { throw "playwright install terminó con el código $LASTEXITCODE" }
$env:CROQUIS_ARRANQUE_SALIDA = "eval/results/rtx-t4/unity_arranque.json"
$env:CROQUIS_URL = "https://croquis-sage.vercel.app"
& pnpm --filter "@croquis/web" exec playwright test -c playwright.produccion.config.ts e2e/medir-unity-arranque.spec.ts
if ($LASTEXITCODE) { throw "la medición del arranque terminó con el código $LASTEXITCODE" }
Write-Host "Listo: eval\results\rtx-t4\unity_arranque.json"
