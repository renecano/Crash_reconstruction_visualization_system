# Arma el paquete del visor de escritorio (U5 y U6, ADR 0115): el build de Windows, un caso de
# ejemplo que abre al arrancar, los casos de D1 con su escenario y medir-escritorio.ps1, en
# apps/visor-unity/Build/<Nombre>.zip. Va a un release de GitHub, no a git.
#
#   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts
#   powershell -ExecutionPolicy Bypass -File tools/unity/paquete-escritorio.ps1 [-SinBuild] [-Nombre visor-escritorio]
#
# -SinBuild arma el paquete con el build de Windows que ya está en Build\windows.
param([switch] $SinBuild, [string] $Nombre = "visor-escritorio")
. (Join-Path $PSScriptRoot "comun.ps1")
$ErrorActionPreference = "Stop"
$build = Join-Path $script:Proyecto "Build"
# Invoke-Unity lanza una excepción si el build falla.
if (-not $SinBuild) { & (Join-Path $PSScriptRoot "build-windows.ps1") }
if (-not (Test-Path (Join-Path $build "windows\VisorCroquis.exe"))) { throw "No hay build de Windows en Build\windows." }
$destino = Join-Path $build $Nombre
if (Test-Path $destino) { Remove-Item -Recurse -Force $destino }
Copy-Item -Recurse (Join-Path $build "windows") $destino
Copy-Item -Recurse (Join-Path $build "casos") (Join-Path $destino "casos")
# El caso que abre el programa al arrancar: AXA de día, con su escenario.
Copy-Item (Join-Path $build "casos\axa-dia.json") (Join-Path $destino "casos\ejemplo.json")
Copy-Item (Join-Path $PSScriptRoot "medir-escritorio.ps1") $destino
@"
Visor de Croquis (escritorio)

Abrir un caso:
  - Doble clic en VisorCroquis.exe abre el caso de ejemplo (AXA).
  - Para ver un caso propio: en Croquis, en la reconstrucción, usa «Descargar paquete 3D» y
    arrastra el archivo .caso3d.json sobre VisorCroquis.exe (o .\VisorCroquis.exe -abrir <archivo>).
  - Teclas: 1 cinematográfica, 2 órbita, 3 cenital, 4 acera, 5 libre; Espacio pausa; F3 diagnóstico.
  - Reconstrucción ilustrativa: el entorno es procedural, no es el lugar real.

Medición de alta y ultra (U5):

1. Conecta la computadora a la corriente y cierra los demás programas.
2. Descomprime esta carpeta, abre PowerShell dentro de ella y corre:
     powershell -ExecutionPolicy Bypass -File .\medir-escritorio.ps1
   Abre y cierra el visor 60 veces en pantalla completa (10 escenas, alta y ultra, 3 veces cada una):
   unos 35 minutos. No uses la computadora mientras mide.
3. Devuelve el archivo e6_unity_escritorio.json que queda en esta carpeta.

Para ver el visor con el panel de diagnóstico (F3 lo abre y lo cierra):
     .\VisorCroquis.exe -caso casos\axa-noche.json -calidad ultra -segundos 600 -diagnostico
Hace falta conexión a internet: los modelos 3D se bajan de Vercel Blob.
"@ | Set-Content -Encoding utf8 (Join-Path $destino "LEEME.txt")
$zip = Join-Path $build "$Nombre.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $destino "*") -DestinationPath $zip
Write-Host ("Paquete: {0} ({1:N0} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
