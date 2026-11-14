# Tiempo del resultado completo de AXA en Chromium, worker de producción contra el de la copia de
# trabajo, en rondas alternadas (W8; protocolo de E6, ADR 0026): plan «Alto rendimiento» mientras
# mide y una pausa para que el equipo se enfríe; al terminar se restaura el plan de antes y se borra
# el que se creó. Lo medido queda en eval/results/w8/tiempo_navegador_rondas.json.
#
#   powershell -ExecutionPolicy Bypass -File tools/unity/medir-tiempo-solver.ps1 -WorkerProduccion <ruta> [-Rondas 3]
param(
    [Parameter(Mandatory = $true)] [string] $WorkerProduccion,
    [int] $Rondas = 3,
    [int] $PausaS = 60
)
$ErrorActionPreference = "Stop"
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $raiz
$salida = Join-Path $raiz "eval\results\w8\tiempo_navegador_rondas.json"
$previo = (powercfg /getactivescheme) -replace '.*:\s*([0-9a-f-]{36}).*', '$1'
$alto = $null
$filas = @()
try {
    $dup = powercfg -duplicatescheme 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
    $alto = $dup -replace '.*:\s*([0-9a-f-]{36}).*', '$1'
    powercfg /setactive $alto
    Start-Sleep -Seconds $PausaS
    node apps/web/scripts/build-worker.mjs | Out-Null
    for ($r = 1; $r -le $Rondas; $r++) {
        foreach ($cual in @("antes", "despues")) {
            if ($cual -eq "antes") { node eval/axa_tiempo_navegador.mjs antes $WorkerProduccion | Out-Null }
            else { node eval/axa_tiempo_navegador.mjs despues | Out-Null }
            $d = Get-Content eval\results\axa_tiempo_navegador.json -Raw | ConvertFrom-Json
            $filas += [pscustomobject]@{ ronda = $r; worker = $cual; mediana_completo_ms = $d.$cual.mediana_completo_ms; mediana_reconstruccion_ms = $d.$cual.mediana_reconstruccion_ms; corridas = $d.$cual.corridas }
            Start-Sleep -Seconds 20
        }
    }
} finally {
    powercfg /setactive $previo
    if ($alto) { powercfg /delete $alto }
    git checkout -- eval/results/axa_tiempo_navegador.json
}
$doc = [pscustomobject]@{
    descripcion = "AXA, resultado completo en Chromium: worker de producción (antes) contra el de la copia de trabajo (despues), rondas alternadas, plan Alto rendimiento mientras mide (restaurado al terminar), 3 corridas por medición."
    fecha = (Get-Date).ToString("s")
    plan_restaurado = $previo
    filas = $filas
}
New-Item -ItemType Directory -Force (Split-Path $salida) | Out-Null
$doc | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $salida
Write-Host "Listo: $salida"
