# Arma el paquete «fotos-promo» (material promocional, René 2026-11-13): el build de Windows del
# visor, los paquetes y la lista de tomas de `paquetes-promo.mts` y generar-fotos.ps1, en
# apps/visor-unity/Build/fotos-promo.zip. Va a un release de GitHub, no a git.
#
#   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-promo.mts
#   powershell -ExecutionPolicy Bypass -File tools/unity/paquete-fotos-promo.ps1 [-SinBuild]
param([switch] $SinBuild)
. (Join-Path $PSScriptRoot "comun.ps1")
$ErrorActionPreference = "Stop"
$build = Join-Path $script:Proyecto "Build"
$promo = Join-Path $build "fotos-promo"
if (-not (Test-Path (Join-Path $promo "tomas.json"))) { throw "Falta Build\fotos-promo\tomas.json: corre paquetes-promo.mts." }
if (-not $SinBuild) { & (Join-Path $PSScriptRoot "build-windows.ps1") }
if (-not (Test-Path (Join-Path $build "windows\VisorCroquis.exe"))) { throw "No hay build de Windows en Build\windows." }
$destino = Join-Path $build "fotos-promo-paquete"
if (Test-Path $destino) { Remove-Item -Recurse -Force $destino }
Copy-Item -Recurse (Join-Path $build "windows") $destino
# La información de depuración de Burst no se distribuye (Unity la marca «DoNotShip»).
Get-ChildItem $destino -Directory -Filter "*DoNotShip*" | Remove-Item -Recurse -Force
Copy-Item -Recurse (Join-Path $promo "casos") (Join-Path $destino "casos")
Copy-Item (Join-Path $promo "tomas.json") $destino
Copy-Item (Join-Path $PSScriptRoot "generar-fotos.ps1") $destino
@"
Fotos del material promocional de Croquis (visor de escritorio)

1. Conecta la computadora a la corriente y cierra los demás programas.
2. Descomprime esta carpeta, abre PowerShell dentro de ella y corre:
     powershell -ExecutionPolicy Bypass -File .\generar-fotos.ps1
   Abre el visor una vez, en una ventana, y dibuja cada toma en PNG a 3840x2160 en ultra.
   No uses la computadora mientras tanto.
3. Devuelve la carpeta «fotos».

Hace falta conexión a internet: los modelos 3D se bajan de Vercel Blob.
Es solo para publicidad: no cambia ningún número del caso. Reconstrucción ilustrativa: el entorno
es procedural, no es el lugar real.
"@ | Set-Content -Encoding utf8 (Join-Path $destino "LEEME.txt")
$zip = Join-Path $build "fotos-promo.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $destino "*") -DestinationPath $zip
Write-Host ("Paquete: {0} ({1:N0} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
