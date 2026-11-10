# E6 del visor Unity de escritorio en alta y ultra (U5, ADR 0115), para la computadora con tarjeta
# de video. Va dentro del paquete `visor-escritorio-u5.zip` junto a VisorCroquis.exe y la carpeta
# `casos`. En esa computadora:
#
#   1. Conectarla a la corriente y cerrar los demás programas.
#   2. Descomprimir el paquete, abrir PowerShell en esa carpeta y correr:
#        powershell -ExecutionPolicy Bypass -File .\medir-escritorio.ps1
#   3. Devolver el archivo `e6_unity_escritorio.json` que queda en la carpeta.
#
# Por cada escena y nivel: tres repeticiones en orden alterno de escenas, un proceso nuevo por
# medición (como el navegador nuevo de E6), a 1920x1080 en pantalla completa, 3 s de calentamiento y
# 12 s de tiempos de cuadro. Se reporta la mediana del promedio de fps. Durante la medición se activa
# el plan de energía «Alto rendimiento» y al terminar se restaura el que había. Los modelos 3D se
# bajan de internet (Vercel Blob): hace falta conexión.
param(
    [string[]] $Niveles = @("alta", "ultra"),
    [int] $Repeticiones = 3,
    [int] $Segundos = 12,
    [int] $Ancho = 1920,
    [int] $Alto = 1080
)
$ErrorActionPreference = "Stop"
$aqui = $PSScriptRoot
$exe = Join-Path $aqui "VisorCroquis.exe"
if (-not (Test-Path $exe)) { throw "No encuentro VisorCroquis.exe junto a este script." }
$casos = Get-ChildItem (Join-Path $aqui "casos") -Filter *.json | Sort-Object Name
$tmp = Join-Path $aqui "mediciones"
New-Item -ItemType Directory -Force $tmp | Out-Null

function Condiciones {
    $b = Get-CimInstance Win32_Battery
    $c = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    $so = Get-CimInstance Win32_OperatingSystem
    [pscustomobject]@{
        momento          = (Get-Date).ToString("o")
        conectada        = if ($null -eq $b) { $null } else { $b.BatteryStatus -ne 1 }
        bateria_pct      = if ($null -eq $b) { $null } else { $b.EstimatedChargeRemaining }
        carga_cpu_pct    = $c
        memoria_libre_mb = [math]::Round($so.FreePhysicalMemory / 1024)
        plan_energia     = ((powercfg /getactivescheme) -replace '^.*\((.*)\).*$', '$1')
    }
}

# Plan «Alto rendimiento» mientras se mide; se restaura el de antes al terminar, también si falla.
$planAntes = ((powercfg /getactivescheme) -replace '^.*GUID: ([0-9a-f-]+).*$', '$1').Trim()
$altoRendimiento = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
$cambioPlan = $false
try {
    powercfg /setactive $altoRendimiento 2>$null
    $cambioPlan = ($LASTEXITCODE -eq 0)
} catch { $cambioPlan = $false }

$gpus = (Get-CimInstance Win32_VideoController | ForEach-Object { "$($_.Name) ($($_.DriverVersion))" }) -join "; "
$inicio = Condiciones
$corridas = @()
try {
    for ($rep = 1; $rep -le $Repeticiones; $rep++) {
        $orden = @($casos)
        if ($rep % 2 -eq 0) { [array]::Reverse($orden) }
        foreach ($caso in $orden) {
            foreach ($nivel in $Niveles) {
                $salida = Join-Path $tmp ("{0}-{1}-{2}.json" -f $caso.BaseName, $nivel, $rep)
                if (Test-Path $salida) { Remove-Item $salida }
                $argumentos = @(
                    "-screen-width", $Ancho, "-screen-height", $Alto, "-screen-fullscreen", "1",
                    "-caso", "`"$($caso.FullName)`"", "-calidad", $nivel, "-segundos", $Segundos,
                    "-salida", "`"$salida`"", "-logFile", "`"$salida.log`""
                )
                $p = Start-Process -FilePath $exe -ArgumentList $argumentos -PassThru
                if (-not $p.WaitForExit(240000)) { $p.Kill(); Write-Warning "$($caso.BaseName) $nivel rep $rep tardó más de 4 min." }
                if (Test-Path $salida) {
                    $r = Get-Content $salida -Raw | ConvertFrom-Json
                    $r | Add-Member repeticion $rep
                    $corridas += $r
                    Write-Host ("{0} {1} rep {2}: {3} fps (prom {4})" -f $caso.BaseName, $nivel, $rep, $r.fps_mediana, $r.fps_promedio)
                } else {
                    Write-Warning "$($caso.BaseName) $nivel rep $rep no dejó resultado (ver $salida.log)."
                }
                Start-Sleep -Seconds 2
            }
        }
    }
} finally {
    if ($cambioPlan) { powercfg /setactive $planAntes | Out-Null }
}
$fin = Condiciones

function Mediana($xs) {
    $v = @($xs | Where-Object { $null -ne $_ } | Sort-Object)
    if ($v.Count -eq 0) { return $null }
    $m = [math]::Floor($v.Count / 2)
    if ($v.Count % 2) { return $v[$m] } else { return ($v[$m - 1] + $v[$m]) / 2 }
}
$resumen = [ordered]@{}
foreach ($nivel in $Niveles) {
    $porCaso = [ordered]@{}
    foreach ($caso in $casos) {
        $rs = @($corridas | Where-Object { $_.caso -eq $caso.BaseName -and $_.nivel -eq $nivel -and -not $_.error })
        $prom = Mediana ($rs | ForEach-Object { $_.fps_promedio })
        $porCaso[$caso.BaseName] = [ordered]@{
            fps_promedio_mediana  = $prom
            fps_1pct_bajo_mediana = Mediana ($rs | ForEach-Object { $_.fps_1pct_bajo })
            carga_s_mediana       = Mediana ($rs | ForEach-Object { $_.carga_s })
            repeticiones          = $rs.Count
            cumple                = if ($null -eq $prom) { $null } else { $prom -ge 60 }
        }
    }
    $resumen[$nivel] = $porCaso
}
$doc = [ordered]@{
    fecha       = (Get-Date).ToString("o")
    metodo      = "Programa de escritorio; ${Ancho}x${Alto} en pantalla completa; un proceso por medición; $Repeticiones repeticiones en orden alterno; cámara cinematográfica en bucle; 3 s de calentamiento y $Segundos s de tiempos de cuadro; nivel fijo; sin vsync. Mediana del promedio de fps."
    meta        = "PLAN §7.8: ≥ 60 fps en alta o ultra en todas las escenas canónicas, en la computadora de demo."
    maquina     = [ordered]@{
        gpus = $gpus
        cpu  = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
        ram_gb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
        so   = (Get-CimInstance Win32_OperatingSystem).Caption
    }
    condiciones = [ordered]@{ plan_antes = $planAntes; plan_cambiado = $cambioPlan; inicio = $inicio; fin = $fin }
    resumen     = $resumen
    corridas    = $corridas
}
$archivo = Join-Path $aqui "e6_unity_escritorio.json"
$doc | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $archivo
Write-Host "Listo: $archivo. Devuélvelo para guardarlo en eval/results/."
