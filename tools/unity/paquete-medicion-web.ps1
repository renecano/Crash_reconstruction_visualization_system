# Arma el paquete para medir el build WEB del visor Unity en la computadora de demo (U6, ADR 0116):
# medir-web.ps1 y sus instrucciones, en apps/visor-unity/Build/visor-web-medicion.zip. La página
# que mide (`/visor-unity/medir-e6.html`), el build y las escenas están en el sitio publicado: el
# paquete solo lleva el script. Va a un release de GitHub, no a git.
#
#   powershell -ExecutionPolicy Bypass -File tools/unity/paquete-medicion-web.ps1
. (Join-Path $PSScriptRoot "comun.ps1")
$ErrorActionPreference = "Stop"
$build = Join-Path $script:Proyecto "Build"
$destino = Join-Path $build "visor-web-medicion"
if (Test-Path $destino) { Remove-Item -Recurse -Force $destino }
New-Item -ItemType Directory -Force $destino | Out-Null
Copy-Item (Join-Path $PSScriptRoot "medir-web.ps1") $destino
@"
Visor de Croquis en el navegador - medición de alta y ultra (U6)

Mide el visor 3D tal como se ve dentro de Croquis (en Chrome), en la misma computadora donde se
midió el programa de escritorio.

1. Conecta la computadora a la corriente y cierra los demás programas, también Chrome.
2. Descomprime esta carpeta, abre PowerShell dentro de ella y corre:
     powershell -ExecutionPolicy Bypass -File .\medir-web.ps1
   Abre y cierra Chrome 60 veces en pantalla completa (10 escenas, alta y ultra, 3 veces cada una):
   unos 40 minutos. La primera vez baja el visor (unos 70 MB); después sale de la caché.
   No uses la computadora mientras mide. Si se interrumpe, vuelve a correrlo: sigue donde se quedó.
3. Devuelve el archivo e6_unity_web_demo.json que queda en esta carpeta.

Mientras mide, el script pone el plan de energía «Alto rendimiento» y le pide a Windows que Chrome
use la tarjeta de video de alto rendimiento; al terminar deja las dos cosas como estaban.
Necesita Google Chrome y conexión a internet.
"@ | Set-Content -Encoding utf8 (Join-Path $destino "LEEME.txt")
$zip = Join-Path $build "visor-web-medicion.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $destino "*") -DestinationPath $zip
Write-Host ("Paquete: {0} ({1:N0} KB)" -f $zip, ((Get-Item $zip).Length / 1KB))
