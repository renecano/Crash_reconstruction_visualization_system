# Build de Windows del visor, en apps/visor-unity/Build/windows. No corre en CI (ADR 0111).
. (Join-Path $PSScriptRoot "comun.ps1")
Invoke-Unity -Objetivo "Win64" -Metodo "Croquis.EditorTools.ConstruirVisor.Windows" -Log (Join-Path $script:Proyecto "Logs\build-windows.log")
