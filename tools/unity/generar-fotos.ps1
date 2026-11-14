# Genera las fotos del material promocional de Croquis con el visor de escritorio (René,
# 2026-11-13). Va dentro del paquete `fotos-promo.zip`, junto a VisorCroquis.exe, la carpeta `casos`
# y `tomas.json`. En la computadora con tarjeta de video:
#
#   1. Conectarla a la corriente y cerrar los demás programas.
#   2. Descomprimir el paquete, abrir PowerShell en esa carpeta y correr:
#        powershell -ExecutionPolicy Bypass -File .\generar-fotos.ps1
#   3. Devolver la carpeta `fotos` (PNG a 3840x2160 en ultra, y fotos.json con lo que hizo).
#
# Las tomas de ingeniería salen dos veces con la misma cámara: con su capa y «-limpia». Los modelos
# 3D se bajan de internet (Vercel Blob): hace falta conexión. Es solo para publicidad: no cambia
# ningún número del caso.
param(
    [int] $Ancho = 3840,
    [int] $Alto = 2160,
    [string] $Calidad = "ultra",
    # Solo algunas tomas, separadas por comas (los «id» de tomas.json).
    [string] $Solo = ""
)
$ErrorActionPreference = "Stop"
$aqui = $PSScriptRoot
$exe = Join-Path $aqui "VisorCroquis.exe"
if (-not (Test-Path $exe)) { throw "No encuentro VisorCroquis.exe junto a este script." }
$salida = Join-Path $aqui "fotos"
New-Item -ItemType Directory -Force $salida | Out-Null
$argumentos = @(
    "-screen-width", "1920", "-screen-height", "1080", "-screen-fullscreen", "0",
    "-fotos", (Join-Path $aqui "tomas.json"), "-salida", $salida,
    "-ancho", "$Ancho", "-alto", "$Alto", "-calidad", $Calidad,
    "-logFile", (Join-Path $aqui "fotos.log")
)
if ($Solo) { $argumentos += @("-solo", $Solo) }
$reloj = [Diagnostics.Stopwatch]::StartNew()
Write-Host "Generando las fotos en $salida (no uses la computadora mientras tanto)..."
$p = Start-Process -FilePath $exe -ArgumentList $argumentos -PassThru -Wait
$informe = Join-Path $salida "fotos.json"
if (-not (Test-Path $informe)) { throw "El visor no escribió fotos.json (código $($p.ExitCode)). Revisa fotos.log." }
$r = Get-Content -Raw $informe | ConvertFrom-Json
$fallas = @($r.tomas | Where-Object { $_.error })
$pngs = @(Get-ChildItem $salida -Filter *.png).Count
Write-Host ("Listo en {0:N1} min: {1} PNG en {2}." -f $reloj.Elapsed.TotalMinutes, $pngs, $salida)
Write-Host "Tarjeta: $($r.gpu) · calidad $($r.calidad) · $($r.resolucion)"
if ($fallas.Count) {
    Write-Host "Tomas con error:" -ForegroundColor Yellow
    $fallas | ForEach-Object { Write-Host "  $($_.id): $($_.error)" }
    exit 1
}
