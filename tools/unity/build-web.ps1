# Build WebGL del visor, en apps/visor-unity/Build/web. No corre en CI: necesita licencia y tarda
# más de 10 min (ADR 0111). Cierra Unity si lo tienes abierto: el proyecto no se abre dos veces.
. (Join-Path $PSScriptRoot "comun.ps1")
Invoke-Unity -Objetivo "WebGL" -Metodo "Croquis.EditorTools.ConstruirVisor.Web" -Log (Join-Path $script:Proyecto "Logs\build-web.log")
