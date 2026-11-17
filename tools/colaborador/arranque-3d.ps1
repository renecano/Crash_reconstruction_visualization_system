# Croquis, tanda t4 (René, 2026-11-16): el arranque del 3D de Unity por partes en esta computadora
# (WebAssembly, motor listo, caso cargado, primer cuadro, tarea más larga), en el sitio publicado,
# con AXA y un caso nuevo (la narración de ejemplo grabada: no gasta API), primera y segunda visita.
# Abre Chromium con ventana (usa la tarjeta de video): no muevas el ratón mientras mide (unos 5 min).
# Deja eval\results\rtx-t4\unity_arranque.json.
#
# t4b (René, 2026-11-17): en la t4 el visor se quedó «arrancando» 5 minutos. El hilo de la página
# estuvo bloqueado casi todo ese tiempo (Playwright solo alcanzó a consultarla 4 veces, y el propio
# plazo de 90 s del visor no llegó a correr), que es lo que pasa cuando las llamadas de WebGL esperan
# a una GPU atorada. Esta computadora tiene dos tarjetas: la medición de Chrome que sí funciona aquí
# (tools/unity/medir-web.ps1) fija Chrome a la de alto rendimiento en la configuración de gráficos de
# Windows, y el Chromium de Playwright no la tenía. Ahora se fija igual mientras corre la medición y se
# deja como estaba al terminar. La prueba anota qué tarjeta usó WebGL y, si vuelve a fallar, lo que
# dijo la consola.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repo
New-Item -ItemType Directory -Force (Join-Path $repo "eval\results\rtx-t4") | Out-Null
Write-Host "Instalando Chromium para Playwright (si falta)..."
& pnpm --filter "@croquis/web" exec playwright install chromium
if ($LASTEXITCODE) { throw "playwright install terminó con el código $LASTEXITCODE" }

# El ejecutable de Chromium que abre Playwright, para la preferencia de gráficos de Windows.
Push-Location (Join-Path $repo "apps\web")
$exe = (& pnpm --silent exec node -e "console.log(require('@playwright/test').chromium.executablePath())" | Select-Object -Last 1)
Pop-Location
if ($exe) { $exe = $exe.Trim() }
$llaveGpu = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
$gpuAntes = $null
$fijada = $false
if ($exe -and (Test-Path $exe)) {
  if (-not (Test-Path $llaveGpu)) { New-Item -Path $llaveGpu -Force | Out-Null }
  $gpuAntes = (Get-ItemProperty -Path $llaveGpu -Name $exe -ErrorAction SilentlyContinue).$exe
  Set-ItemProperty -Path $llaveGpu -Name $exe -Value "GpuPreference=2;"
  $fijada = $true
  Write-Host "Chromium de la medición con la tarjeta de alto rendimiento: $exe"
} else {
  Write-Host "No encontré el Chromium de Playwright ($exe): sigo sin fijar la tarjeta." -ForegroundColor Yellow
}

try {
  $env:CROQUIS_ARRANQUE_SALIDA = "eval/results/rtx-t4/unity_arranque.json"
  $env:CROQUIS_URL = "https://croquis-sage.vercel.app"
  & pnpm --filter "@croquis/web" exec playwright test -c playwright.produccion.config.ts e2e/medir-unity-arranque.spec.ts
  if ($LASTEXITCODE) { throw "la medición del arranque terminó con el código $LASTEXITCODE" }
  Write-Host "Listo: eval\results\rtx-t4\unity_arranque.json"
} finally {
  # La preferencia de gráficos queda como estaba.
  if ($fijada) {
    if ($null -ne $gpuAntes) { Set-ItemProperty -Path $llaveGpu -Name $exe -Value $gpuAntes }
    else { Remove-ItemProperty -Path $llaveGpu -Name $exe -ErrorAction SilentlyContinue }
  }
}
