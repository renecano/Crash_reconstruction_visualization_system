# E6 del visor Unity en el NAVEGADOR, en alta y ultra (U6, ADR 0116), para la computadora de demo:
# la demo puede ser dentro de Croquis. Va en el paquete `visor-web-medicion.zip`. En esa computadora:
#
#   1. Conectarla a la corriente y cerrar los demás programas (también Chrome).
#   2. Descomprimir el paquete, abrir PowerShell en esa carpeta y correr:
#        powershell -ExecutionPolicy Bypass -File .\medir-web.ps1
#   3. Devolver el archivo `e6_unity_web_demo.json` que queda en la carpeta.
#
# Por cada escena y nivel: tres repeticiones en orden alterno de escenas, un proceso de Chrome nuevo
# por medición (como en E6), a 1920x1080 en pantalla completa, sin vsync, 3 s de calentamiento y 12 s
# de tiempos de cuadro de la página `medir-e6.html` del sitio publicado. Se reporta la mediana del
# promedio de fps. Es reanudable: lo ya medido queda en `mediciones\` y no se repite.
#
# Mientras mide, y se restaura al terminar (también si falla):
#   - el plan de energía «Alto rendimiento»;
#   - Chrome con la tarjeta de video de alto rendimiento (preferencia de gráficos de Windows del
#     usuario), para que no use la integrada.
# El build y las escenas se bajan del sitio (Vercel Blob) la primera vez; después salen de la caché
# del perfil de Chrome que usa la medición (carpeta `perfil-chrome\`).
param(
    [string] $Sitio = "https://croquis-sage.vercel.app",
    [string[]] $Niveles = @("alta", "ultra"),
    [int] $Repeticiones = 3,
    [int] $Segundos = 12,
    # Solo estas escenas (para una prueba corta); sin ella, las del manifiesto. (No se llama
    # «Casos»: en PowerShell sería la misma variable que $casos.)
    [string[]] $Solo = @()
)
$ErrorActionPreference = "Stop"
$Niveles = @($Niveles | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$aqui = $PSScriptRoot
$mediciones = Join-Path $aqui "mediciones"
$perfil = Join-Path $aqui "perfil-chrome"
New-Item -ItemType Directory -Force $mediciones, $perfil | Out-Null
$descargas = Join-Path $aqui "descargas"
New-Item -ItemType Directory -Force $descargas | Out-Null

$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "No encuentro Google Chrome. Instálalo y vuelve a correr el script." }

$man = Invoke-RestMethod "$Sitio/visor-unity/manifest.json"
if (-not $man.casos) { throw "El manifiesto del sitio no trae la lista de escenas (casos)." }
$casos = @($man.casos)
$Solo = @($Solo | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($Solo.Count) { $casos = @($casos | Where-Object { $Solo -contains $_ }) }

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

# Plan «Alto rendimiento», como medir-escritorio.ps1.
$rxGuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
$planAntes = [regex]::Match((powercfg /getactivescheme | Out-String), $rxGuid).Value
$altoRendimiento = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
$cambioPlan = $false
if ($planAntes -and $planAntes -ne $altoRendimiento) {
    try { powercfg /setactive $altoRendimiento 2>$null; $cambioPlan = ($LASTEXITCODE -eq 0) } catch { $cambioPlan = $false }
}

# Chrome con la tarjeta de alto rendimiento (Configuración > Pantalla > Gráficos, por usuario).
$llaveGpu = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
if (-not (Test-Path $llaveGpu)) { New-Item -Path $llaveGpu -Force | Out-Null }
$gpuAntes = (Get-ItemProperty -Path $llaveGpu -Name $chrome -ErrorAction SilentlyContinue).$chrome
Set-ItemProperty -Path $llaveGpu -Name $chrome -Value "GpuPreference=2;"

$gpus = (Get-CimInstance Win32_VideoController | ForEach-Object { "$($_.Name) ($($_.DriverVersion))" }) -join "; "
$inicio = Condiciones
try {
    for ($rep = 1; $rep -le $Repeticiones; $rep++) {
        $orden = @($casos)
        if ($rep % 2 -eq 0) { [array]::Reverse($orden) }
        foreach ($caso in $orden) {
            foreach ($nivel in $Niveles) {
                $nombre = "e6web-$caso-$nivel-$rep.json"
                $destino = Join-Path $mediciones $nombre
                if (Test-Path $destino) { continue }
                $bajado = Join-Path $descargas $nombre
                if (Test-Path $bajado) { Remove-Item $bajado }
                # Las descargas del perfil van a `descargas\`, sin preguntar.
                $prefs = Join-Path $perfil "Default\Preferences"
                New-Item -ItemType Directory -Force (Split-Path $prefs) | Out-Null
                $p = [ordered]@{ download = [ordered]@{ default_directory = $descargas; prompt_for_download = $false } }
                if (-not (Test-Path $prefs)) { $p | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $prefs }
                $url = "$Sitio/visor-unity/medir-e6.html?caso=$caso&nivel=$nivel&segundos=$Segundos&rep=$rep"
                $argumentos = @(
                    "--user-data-dir=`"$perfil`"", "--no-first-run", "--no-default-browser-check",
                    "--disable-gpu-vsync", "--disable-frame-rate-limit", "--ignore-gpu-blocklist",
                    "--start-fullscreen", "--window-size=1920,1080", "--new-window", $url
                )
                $proc = Start-Process -FilePath $chrome -ArgumentList $argumentos -PassThru
                $limite = (Get-Date).AddMinutes(6)
                while (-not (Test-Path $bajado) -and (Get-Date) -lt $limite) { Start-Sleep -Seconds 2 }
                Start-Sleep -Seconds 1
                Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
                    Where-Object { $_.CommandLine -like "*$perfil*" } |
                    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
                if (Test-Path $bajado) {
                    Move-Item $bajado $destino -Force
                    $r = Get-Content $destino -Raw | ConvertFrom-Json
                    if ($r.error) { Write-Warning "$caso $nivel rep ${rep}: $($r.error)"; Rename-Item $destino "$destino.error" -Force }
                    else { Write-Host ("{0} {1} rep {2}: {3} fps (GPU: {4})" -f $caso, $nivel, $rep, $r.fps_promedio, $r.gpu) }
                } else {
                    Write-Warning "$caso $nivel rep $rep no terminó en 6 min."
                }
                Start-Sleep -Seconds 3
            }
        }
    }
} finally {
    if ($cambioPlan) { powercfg /setactive $planAntes | Out-Null }
    if ($null -eq $gpuAntes) { Remove-ItemProperty -Path $llaveGpu -Name $chrome -ErrorAction SilentlyContinue }
    else { Set-ItemProperty -Path $llaveGpu -Name $chrome -Value $gpuAntes }
}
$fin = Condiciones

function Mediana($xs) {
    $v = @($xs | Where-Object { $null -ne $_ } | Sort-Object)
    if ($v.Count -eq 0) { return $null }
    $m = [math]::Floor($v.Count / 2)
    if ($v.Count % 2) { return $v[$m] } else { return ($v[$m - 1] + $v[$m]) / 2 }
}
$corridas = @(Get-ChildItem $mediciones -Filter "e6web-*.json" | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json })
$resumen = [ordered]@{}
foreach ($nivel in $Niveles) {
    $porCaso = [ordered]@{}
    foreach ($caso in $casos) {
        $rs = @($corridas | Where-Object { $_.caso -eq $caso -and $_.nivel -eq $nivel })
        $prom = Mediana ($rs | ForEach-Object { $_.fps_promedio })
        $porCaso[$caso] = [ordered]@{
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
    metodo      = "Build web del visor Unity en Google Chrome (medir-e6.html del sitio $Sitio); 1920x1080 en pantalla completa; un proceso de Chrome por medición; $Repeticiones repeticiones en orden alterno; cámara cinematográfica en bucle; 3 s de calentamiento y $Segundos s de tiempos de cuadro (requestAnimationFrame); nivel fijo; sin vsync (--disable-gpu-vsync --disable-frame-rate-limit); Chrome con la tarjeta de alto rendimiento. Mediana del promedio de fps."
    meta        = "PLAN §7.8: ≥ 60 fps en alta o ultra en todas las escenas canónicas, en la computadora de demo (aquí, dentro del navegador)."
    build       = $man.huella
    maquina     = [ordered]@{
        gpus   = $gpus
        cpu    = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
        ram_gb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
        so     = (Get-CimInstance Win32_OperatingSystem).Caption
        chrome = (Get-Item $chrome).VersionInfo.ProductVersion
    }
    condiciones = [ordered]@{ plan_antes = $planAntes; plan_cambiado = $cambioPlan; inicio = $inicio; fin = $fin }
    resumen     = $resumen
    corridas    = $corridas
}
$archivo = Join-Path $aqui "e6_unity_web_demo.json"
$doc | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $archivo
Write-Host "Listo: $archivo. Devuélvelo para guardarlo en eval/results/."
