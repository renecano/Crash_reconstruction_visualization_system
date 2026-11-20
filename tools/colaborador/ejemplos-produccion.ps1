# t5-verificacion (René, 2026-11-19): el «antes» de los cinco ejemplos, contra producción (el código de
# main), en el Chrome instalado y sin el 3D (no baja nada de Vercel Blob: cada ejemplo usa su lectura
# guardada y la reconstrucción corre en el navegador). El «después» es `demo-local.ps1 -Despues ejemplos`.
param([string] $Salida = "eval/results/t5/ejemplos_antes.json")
$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repo
$env:CROQUIS_URL = "https://croquis-sage.vercel.app"
$env:CROQUIS_CANAL = "chrome"
$env:CROQUIS_SALIDA = $Salida
$env:CROQUIS_CAPTURAS = "docs/cesvi/ronda-4/evidencia/t5-ejemplos-antes"
Remove-Item Env:CROQUIS_UNITY -ErrorAction SilentlyContinue
# Chrome con la tarjeta de alto rendimiento mientras corre (René, 2026-11-20); al final, como estaba.
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$llaveGpu = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
$gpuAntes = $null
if ($chrome) {
  if (-not (Test-Path $llaveGpu)) { New-Item -Path $llaveGpu -Force | Out-Null }
  $gpuAntes = (Get-ItemProperty -Path $llaveGpu -Name $chrome -ErrorAction SilentlyContinue).$chrome
  Set-ItemProperty -Path $llaveGpu -Name $chrome -Value "GpuPreference=2;"
}
try {
  & pnpm --filter "@croquis/web" exec playwright test -c playwright.produccion.config.ts e2e/ejemplos-ronda2.spec.ts
  $codigo = $LASTEXITCODE
} finally {
  if ($chrome) {
    if ($null -eq $gpuAntes) { Remove-ItemProperty -Path $llaveGpu -Name $chrome -ErrorAction SilentlyContinue }
    else { Set-ItemProperty -Path $llaveGpu -Name $chrome -Value $gpuAntes }
  }
}
exit $codigo
