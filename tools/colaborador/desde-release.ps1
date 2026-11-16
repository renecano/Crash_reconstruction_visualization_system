# Croquis, tanda t4 (René, 2026-11-16): baja del release `rtx-t4` el paquete de escritorio o el de
# fotos, lo corre y deja su resultado chico en eval/results/rtx-t4 (lo que sube la tanda). El build y
# las fotos no van a git: las fotos quedan en un zip en el Escritorio para mandárselo a René.
#
#   powershell -ExecutionPolicy Bypass -File tools\colaborador\desde-release.ps1 -Paso escritorio
#   powershell -ExecutionPolicy Bypass -File tools\colaborador\desde-release.ps1 -Paso fotos
param(
  [Parameter(Mandatory = $true)][ValidateSet("escritorio", "fotos")][string] $Paso
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$base = "https://github.com/renecano/Crash_reconstruction_visualization_system/releases/download/rtx-t4"
$archivo = if ($Paso -eq "escritorio") { "visor-escritorio-t4.zip" } else { "fotos-promo-t4.zip" }
$raiz = Join-Path $env:LOCALAPPDATA "croquis-rtx-t4"
$trabajo = Join-Path $raiz $Paso
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
