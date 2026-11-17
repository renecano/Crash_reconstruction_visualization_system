# Croquis, tanda t4 (René, 2026-11-16): baja del release `rtx-t4` el paquete de escritorio o el de
# fotos, lo corre y deja su resultado chico en eval/results/rtx-t4 (lo que sube la tanda). El build y
# las fotos no van a git: las fotos quedan en un zip en el Escritorio para mandárselo a René.
#
#   powershell -ExecutionPolicy Bypass -File tools\colaborador\desde-release.ps1 -Paso escritorio
#   powershell -ExecutionPolicy Bypass -File tools\colaborador\desde-release.ps1 -Paso fotos
#   powershell -ExecutionPolicy Bypass -File tools\colaborador\desde-release.ps1 -Paso trailer
#
# «trailer» usa el mismo paquete de fotos, con el plan de tomas de tools\trailer\tomas-rtx.mjs.
param(
  [Parameter(Mandatory = $true)][ValidateSet("escritorio", "fotos", "trailer")][string] $Paso
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$base = "https://github.com/renecano/Crash_reconstruction_visualization_system/releases/download/rtx-t4"
$archivo = if ($Paso -eq "escritorio") { "visor-escritorio-t4.zip" } else { "fotos-promo-t4.zip" }
$raiz = Join-Path $env:LOCALAPPDATA "croquis-rtx-t4"
# Las tomas del tráiler usan el mismo visor del paquete de fotos.
$carpeta = if ($Paso -eq "trailer") { "fotos" } else { $Paso }
$trabajo = Join-Path $raiz $carpeta
New-Item -ItemType Directory -Force $trabajo | Out-Null
$zip = Join-Path $raiz $archivo
if (-not (Test-Path $zip)) {
  Write-Host "Bajando $archivo del release rtx-t4..."
  Invoke-WebRequest "$base/$archivo" -OutFile "$zip.parcial" -UseBasicParsing
  Move-Item "$zip.parcial" $zip -Force
}
if (-not (Test-Path (Join-Path $trabajo "VisorCroquis.exe"))) {
  Write-Host "Descomprimiendo $archivo..."
  Expand-Archive $zip -DestinationPath $trabajo -Force
}
$destino = Join-Path $repo "eval\results\rtx-t4"
New-Item -ItemType Directory -Force $destino | Out-Null

if ($Paso -eq "escritorio") {
  # Los cuatro niveles, en las escenas de referencia del paquete; tres repeticiones (el protocolo E6).
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $trabajo "medir-escritorio.ps1") -Niveles "baja,media,alta,ultra"
  if ($LASTEXITCODE) { throw "medir-escritorio terminó con el código $LASTEXITCODE" }
  Copy-Item (Join-Path $trabajo "e6_unity_escritorio.json") (Join-Path $destino "fps_escritorio.json") -Force
  Write-Host "Listo: eval\results\rtx-t4\fps_escritorio.json"
} elseif ($Paso -eq "trailer") {
  # Las tomas del 3D para el tráiler (René, 2026-11-16): secuencias a 3840x2160 en ultra de la
  # escena inventada de noche con lluvia. Quedan en trailer-salida\tomas del repositorio (que git
  # ignora completa) y en un zip en el Escritorio para mandárselo a René: no van a git.
  $plan = Join-Path $trabajo "tomas-trailer.json"
  & node (Join-Path $repo "tools\trailer\tomas-rtx.mjs") $plan
  if ($LASTEXITCODE) { throw "tomas-rtx.mjs terminó con el código $LASTEXITCODE" }
  $salida = Join-Path $repo "trailer-salida\tomas"
  New-Item -ItemType Directory -Force $salida | Out-Null
  # Solo se quita el informe anterior: si el visor falla, no se toma por bueno uno viejo.
  $viejo = Join-Path $salida "fotos.json"
  if (Test-Path $viejo) { Remove-Item $viejo -Force }
  $argumentos = @(
    "-screen-width", "1920", "-screen-height", "1080", "-screen-fullscreen", "0",
    "-fotos", $plan, "-salida", $salida,
    "-ancho", "3840", "-alto", "2160", "-calidad", "ultra",
    "-logFile", (Join-Path $trabajo "tomas-trailer.log")
  )
  Write-Host "Tomando las secuencias del tráiler (no uses la computadora mientras tanto)..."
  $p = Start-Process -FilePath (Join-Path $trabajo "VisorCroquis.exe") -ArgumentList $argumentos -PassThru -Wait
  $informe = Join-Path $salida "fotos.json"
  if (-not (Test-Path $informe)) { throw "El visor no escribió fotos.json (código $($p.ExitCode)). Revisa tomas-trailer.log." }
  Copy-Item $informe (Join-Path $destino "tomas_trailer.json") -Force
  $escritorio = [Environment]::GetFolderPath("Desktop")
  $entrega = Join-Path $escritorio "croquis-tomas-trailer.zip"
  if (Test-Path $entrega) { Remove-Item $entrega -Force }
  Compress-Archive -Path (Join-Path $salida "*_*.png"), $informe -DestinationPath $entrega
  Write-Host ""
  Write-Host "Las tomas del tráiler quedaron en $entrega. Mándale ese archivo a René (por Drive o WeTransfer): no va a git."
} else {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $trabajo "generar-fotos.ps1")
  if ($LASTEXITCODE) { throw "generar-fotos terminó con el código $LASTEXITCODE" }
  $fotos = Join-Path $trabajo "fotos"
  Copy-Item (Join-Path $fotos "fotos.json") (Join-Path $destino "fotos.json") -Force
  $escritorio = [Environment]::GetFolderPath("Desktop")
  $entrega = Join-Path $escritorio "croquis-fotos-promo-t4.zip"
  if (Test-Path $entrega) { Remove-Item $entrega -Force }
  Compress-Archive -Path (Join-Path $fotos "*") -DestinationPath $entrega
  Write-Host ""
  Write-Host "Las fotos quedaron en $entrega. Mándale ese archivo a René (por Drive o WeTransfer): no va a git."
}
