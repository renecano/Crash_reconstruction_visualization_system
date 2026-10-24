<#
  Croquis en la computadora de la demo (lo abre EJECUTAR-EN-COMPUTADORA-DEMO.bat).

  Hace, en orden, y si un paso falla lo dice y sigue con los demás:
    1. Revisa que haya Git y Chrome.
    2. Descarga Blender portátil oficial de blender.org (una sola vez), verifica su SHA-256 y lo
       reutiliza en las siguientes corridas.
    3. Renderiza en calidad completa dos escenas versionadas en el repositorio (el caso de AXA y una
       carambola), con la tarjeta de video si la hay (R11).
    4. Abre Chrome en /medicion de producción en modo automático: mide alta y ultra y descarga el
       resultado (E6). El script espera el archivo.
    5. Guarda todo en resultados/computadora-demo/<fecha>/ con los datos de la máquina, lo sube a una
       rama nueva resultados/computadora-demo-<fecha> (nunca a main) y hace push.
    6. Muestra qué hizo, cuánto tardó y si algo falló.

  Todo lo que descarga o crea fuera del repositorio queda en su carpeta (por omisión,
  %LOCALAPPDATA%\CroquisDemo). No pide contraseñas: el push usa las credenciales que Git ya tenga.

  Opciones (para probarlo; el colaborador no necesita ninguna):
    -Prueba       lo más liviano (render corto a 320×180 en CPU, medición de 2 s en baja) y rama
                  resultados/prueba-<fecha>: prueba el mecanismo, no la calidad
    -SinSubir     no hace commit ni push
    -Carpeta RUTA la carpeta de trabajo fuera del repositorio
    -Url URL      el sitio donde medir (por omisión, producción)
    -LimiteRam N  detiene el paso en curso si la RAM usada pasa de N % (por omisión, 95)
#>
param(
  [switch]$Prueba,
  [switch]$SinSubir,
  [string]$Carpeta = (Join-Path $env:LOCALAPPDATA "CroquisDemo"),
  [string]$Url = "https://croquis-sage.vercel.app",
  [int]$LimiteRam = 95
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

# --- Lo fijo ---------------------------------------------------------------------------------------
$BlenderVersion = "5.2.3"
$BlenderZip = "blender-$BlenderVersion-windows-x64.zip"
$BlenderUrl = "https://download.blender.org/release/Blender5.2/$BlenderZip"
# SHA-256 publicado por blender.org (blender-5.2.3.sha256), verificado el 2026-10-23.
$BlenderSha256 = "723f08a4401502561eb763cdeacf8745b31e5f3f154d287d3830d97cf75dc2fb"
$UrlMedicion = "$($Url.TrimEnd('/'))/medicion?auto=1"

$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Fecha = Get-Date -Format "yyyy-MM-dd_HHmm"
$Tipo = if ($Prueba) { "prueba" } else { "computadora-demo" }
$Salida = Join-Path $Repo "resultados\$Tipo\$Fecha"
$Rama = "resultados/$Tipo-$Fecha"
$Inicio = Get-Date
$Pasos = New-Object System.Collections.Generic.List[object]
$Datos = [ordered]@{}

New-Item -ItemType Directory -Force -Path $Carpeta, $Salida | Out-Null
$Bitacora = Join-Path $Salida "bitacora.txt"

function Escribir([string]$texto, [string]$color = "Gray") {
  Write-Host $texto -ForegroundColor $color
  Add-Content -Path $Bitacora -Value $texto -Encoding UTF8
}

# RAM usada del equipo (%), y la máxima de cada paso y de toda la corrida.
function RamUsada {
  $os = Get-CimInstance Win32_OperatingSystem
  return [int][math]::Round(100 * (1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize))
}
$script:RamPaso = 0
$script:RamMax = RamUsada
$RamInicial = $script:RamMax

function AnotarRam {
  $r = RamUsada
  if ($r -gt $script:RamPaso) { $script:RamPaso = $r }
  if ($r -gt $script:RamMax) { $script:RamMax = $r }
  return $r
}

# Espera a que termine un proceso midiendo la RAM cada 2 s. Si pasa del límite, lo detiene (con
# sus procesos hijos) y el paso falla con la causa; los demás pasos siguen.
function Vigilar([System.Diagnostics.Process]$proceso, [int]$limiteSegundos = 0) {
  $t0 = Get-Date
  while (-not $proceso.HasExited) {
    Start-Sleep -Seconds 2
    $r = AnotarRam
    if ($r -gt $LimiteRam) {
      Nativo "taskkill.exe" @("/PID", "$($proceso.Id)", "/T", "/F") | Out-Null
      throw "Se detuvo: la RAM llegó a $r % (límite $LimiteRam %)."
    }
    if ($limiteSegundos -gt 0 -and ((Get-Date) - $t0).TotalSeconds -gt $limiteSegundos) {
      Nativo "taskkill.exe" @("/PID", "$($proceso.Id)", "/T", "/F") | Out-Null
      throw "Se detuvo: pasaron más de $limiteSegundos s."
    }
  }
}

function Paso([string]$nombre, [scriptblock]$accion) {
  Escribir ""
  Escribir "== $nombre" "Cyan"
  $script:RamPaso = 0
  [void](AnotarRam)
  $t0 = Get-Date
  $bien = $true
  $nota = ""
  try {
    $r = & $accion
    if ($r) { $nota = [string]$r }
  } catch {
    $bien = $false
    $nota = $_.Exception.Message
    Escribir "   No se pudo: $nota" "Red"
  }
  [void](AnotarRam)
  $seg = [int]((Get-Date) - $t0).TotalSeconds
  $Pasos.Add([pscustomobject]@{
      Paso = $nombre; Bien = $bien; Segundos = $seg; RamMaxima = $script:RamPaso; Nota = $nota
    })
  if ($bien) { Escribir "   Listo ($seg s, RAM máxima $($script:RamPaso) %). $nota" "Green" }
}

# Un programa externo (Blender, Git): su salida va a la bitácora o a un archivo y se decide por su
# código de salida. En Windows PowerShell 5.1, con ErrorActionPreference = Stop, redirigir lo que un
# programa escribe en stderr (Git escribe ahí sus avisos normales) aborta el script.
function Nativo([string]$exe, [string[]]$argumentos, [string]$log = "") {
  $anterior = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $lineas = & $exe @argumentos 2>&1 | ForEach-Object { "$_" }
    $codigo = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $anterior
  }
  if ($log) {
    [IO.File]::WriteAllLines($log, [string[]]$lineas, (New-Object Text.UTF8Encoding($false)))
  } else {
    foreach ($l in $lineas) { Add-Content -Path $Bitacora -Value "   $l" -Encoding UTF8 }
  }
  return $codigo
}

function EscribirJson([string]$ruta, $objeto) {
  $json = $objeto | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($ruta, $json + "`n", (New-Object Text.UTF8Encoding($false)))
}

function BuscarChrome {
  $claves = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
  )
  foreach ($c in $claves) {
    try {
      $v = (Get-ItemProperty -Path $c -ErrorAction Stop).'(default)'
      if ($v -and (Test-Path $v)) { return $v }
    } catch { }
  }
  $rutas = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  )
  foreach ($r in $rutas) { if ($r -and (Test-Path $r)) { return $r } }
  return $null
}

function TieneTarjetaDeVideo {
  $gpus = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name
  return [bool]($gpus | Where-Object { $_ -match "NVIDIA|GeForce|RTX|Quadro|Radeon RX|Radeon Pro|Arc A" })
}

Escribir "Croquis en la computadora de la demo — $Fecha" "White"
Escribir "Resultados en: $Salida"

# --- 1. Git y Chrome -------------------------------------------------------------------------------
$Git = $null
$Chrome = $null
Paso "Revisar Git y Chrome" {
  $g = Get-Command git -ErrorAction SilentlyContinue
  if ($g) { $script:Git = $g.Source }
  $script:Chrome = BuscarChrome
  $faltan = @()
  if (-not $script:Git) { $faltan += "Git (https://git-scm.com/download/win)" }
  if (-not $script:Chrome) { $faltan += "Google Chrome (https://www.google.com/chrome/)" }
  if ($faltan.Count -gt 0) { throw "Falta instalar: $($faltan -join '; ')." }
  "Git y Chrome encontrados."
}

# --- 2. Blender portátil ---------------------------------------------------------------------------
$BlenderExe = Join-Path $Carpeta "blender\blender-$BlenderVersion-windows-x64\blender.exe"
Paso "Blender $BlenderVersion (portátil, de blender.org)" {
  if (Test-Path $BlenderExe) { return "Ya estaba en $Carpeta; se reutiliza." }
  $zip = Join-Path $Carpeta $BlenderZip
  if (-not (Test-Path $zip)) {
    Escribir "   Descargando $BlenderUrl (unos 400 MB)…"
    Invoke-WebRequest -UseBasicParsing -Uri $BlenderUrl -OutFile $zip
  }
  $sha = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLowerInvariant()
  if ($sha -ne $BlenderSha256) {
    Remove-Item -Force $zip
    throw "El SHA-256 de la descarga no coincide con el publicado por blender.org; se borró y no se usa."
  }
  Escribir "   SHA-256 verificado. Descomprimiendo…"
  # tar.exe (de Windows 10 y 11) descomprime mientras lee; Expand-Archive de PowerShell 5.1 es lento
  # y pide mucha memoria con 400 MB. Se descomprime aparte y se renombra al final, para que una
  # descompresión interrumpida no pase por completa en la siguiente corrida.
  $final = Join-Path $Carpeta "blender"
  $temporal = Join-Path $Carpeta "blender-descomprimiendo"
  if (Test-Path $temporal) { Remove-Item -Recurse -Force $temporal }
  if (Test-Path $final) { Remove-Item -Recurse -Force $final }
  New-Item -ItemType Directory -Force -Path $temporal | Out-Null
  if ((Nativo "tar.exe" @("-xf", $zip, "-C", $temporal)) -ne 0) { throw "No se pudo descomprimir Blender." }
  Rename-Item -Path $temporal -NewName "blender"
  Remove-Item -Force $zip
  if (-not (Test-Path $BlenderExe)) { throw "No quedó blender.exe donde se esperaba." }
  "Blender listo en $Carpeta."
}

# --- 3. Videos de R11 ------------------------------------------------------------------------------
$ScriptBlender = Join-Path $Repo "tools\blender\croquis_render.py"
$ConGpu = TieneTarjetaDeVideo
foreach ($escena in @("axa", "carambola")) {
  Paso "Video de la escena «$escena»" {
    if (-not (Test-Path $BlenderExe)) { throw "No hay Blender (falló el paso anterior)." }
    $glb = Join-Path $Repo "demo\escenas-r11\$escena.glb"
    if (-not (Test-Path $glb)) { throw "No está la escena $glb (¿se hizo git pull?)." }
    $video = Join-Path $Salida "video-$escena.mp4"
    if ($Prueba) {
      # Cycles en CPU pide menos memoria que EEVEE en una tarjeta integrada (que la toma de la RAM).
      $opciones = @("--motor", "cycles", "--resolucion", "320x180", "--muestras", "4", "--desde", "0", "--hasta", "0.5")
    } elseif ($ConGpu) {
      $opciones = @("--motor", "cycles", "--gpu", "--resolucion", "1920x1080", "--muestras", "128")
    } else {
      $opciones = @("--motor", "eevee", "--resolucion", "1920x1080", "--muestras", "64")
    }
    $log = Join-Path $Salida "blender-$escena.log"
    $argumentos = @("-b", "--factory-startup", "-P", $ScriptBlender, "--", $glb, "--salida", $video) + $opciones
    # Cada argumento entre comillas: Start-Process los une con espacios y una ruta puede tenerlos.
    $citados = $argumentos | ForEach-Object { '"' + $_ + '"' }
    $p = Start-Process -FilePath $BlenderExe -ArgumentList $citados -NoNewWindow -PassThru `
      -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    $null = $p.Handle  # sin esto, PowerShell 5.1 pierde el código de salida
    try {
      Vigilar $p
      $p.WaitForExit()
      if ($p.ExitCode -ne 0 -or -not (Test-Path $video)) { throw "Blender terminó con error (ver $log)." }
    } catch {
      Remove-Item -Force $video -ErrorAction SilentlyContinue  # un video a medias no se sube
      throw
    }
    "$([math]::Round((Get-Item $video).Length / 1MB, 1)) MB, $($opciones -join ' ')"
  }
}

# --- 4. Medición E6 en Chrome ----------------------------------------------------------------------
Paso "Medición del visor en Chrome (E6: alta y ultra)" {
  if (-not $Chrome) { throw "No hay Chrome." }
  $perfil = Join-Path $Carpeta "chrome-perfil"
  $descargas = Join-Path $Carpeta "descargas-$Fecha"
  New-Item -ItemType Directory -Force -Path (Join-Path $perfil "Default"), $descargas | Out-Null
  # Un perfil propio de Chrome (no toca el del usuario) que guarda las descargas en su carpeta.
  EscribirJson (Join-Path $perfil "Default\Preferences") @{
    download = @{ default_directory = $descargas; prompt_for_download = $false; directory_upgrade = $true }
    profile = @{ default_content_setting_values = @{ automatic_downloads = 1 } }
  }
  $url = $UrlMedicion
  if ($Prueba) { $url += "&escenas=alcance&calidades=baja&renderers=webgl&repeticiones=1&calentamiento=0&segundos=2&pausa=0" }
  $argsChrome = @(
    "--user-data-dir=$perfil", "--no-first-run", "--no-default-browser-check",
    "--start-fullscreen", "--disable-gpu-vsync", "--disable-frame-rate-limit", $url
  )
  Escribir "   Chrome abre la medición a pantalla completa. No uses el equipo mientras mide."
  $p = Start-Process -FilePath $Chrome -ArgumentList $argsChrome -PassThru
  $limite = (Get-Date).AddMinutes(150)
  $archivo = $null
  while ((Get-Date) -lt $limite -and -not $archivo) {
    Start-Sleep -Seconds 5
    $r = AnotarRam
    if ($r -gt $LimiteRam) {
      Nativo "taskkill.exe" @("/PID", "$($p.Id)", "/T", "/F") | Out-Null
      throw "Se detuvo: la RAM llegó a $r % (límite $LimiteRam %)."
    }
    $archivo = Get-ChildItem -Path $descargas -Filter "e6-navegador-*.json" -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  Start-Sleep -Seconds 3
  Nativo "taskkill.exe" @("/PID", "$($p.Id)", "/T", "/F") | Out-Null
  if (-not $archivo) { throw "No llegó el resultado de la medición en 150 minutos." }
  Copy-Item $archivo.FullName (Join-Path $Salida "e6-navegador.json")
  Remove-Item -Recurse -Force $descargas
  "Resultado guardado (e6-navegador.json)."
}

# --- 5. Datos de la máquina, commit y push ---------------------------------------------------------
Paso "Datos de la máquina" {
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $Datos.fecha = $Fecha
  $Datos.prueba = [bool]$Prueba
  $Datos.equipo = $env:COMPUTERNAME
  $Datos.windows = "$($os.Caption) $($os.Version)"
  $Datos.cpu = @{ nombre = $cpu.Name.Trim(); nucleos = $cpu.NumberOfCores; hilos = $cpu.NumberOfLogicalProcessors }
  $Datos.ram_gb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
  $Datos.gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object {
      @{ nombre = $_.Name; controlador = $_.DriverVersion }
    })
  $Datos.chrome = if ($Chrome) { (Get-Item $Chrome).VersionInfo.ProductVersion } else { $null }
  $Datos.blender = $BlenderVersion
  $Datos.git = if ($Git) { (& git --version) } else { $null }
  $Datos.plan_de_energia = (& powercfg /getactivescheme) -join " "
  $Datos.commit_del_repositorio = if ($Git) { (& git -C $Repo rev-parse HEAD) } else { $null }
  "CPU $($Datos.cpu.nombre), $($Datos.ram_gb) GB de RAM."
}

$Total = [int]((Get-Date) - $Inicio).TotalSeconds
$Datos.duracion_total_s = $Total
$Datos.ram_usada_al_empezar_pct = $RamInicial
$Datos.ram_usada_maxima_pct = $script:RamMax
$Datos.limite_ram_pct = $LimiteRam
$Datos.pasos = $Pasos
EscribirJson (Join-Path $Salida "maquina.json") $Datos

if (-not $SinSubir) {
  Paso "Subir los resultados a la rama $Rama" {
    if (-not $Git) { throw "No hay Git." }
    if ($Rama -eq "main") { throw "La rama no puede ser main." }
    # Los videos de más de 95 MB no caben en GitHub: se quedan en la carpeta y se anota.
    $grandes = Get-ChildItem $Salida -Filter *.mp4 | Where-Object { $_.Length -gt 95MB }
    foreach ($g in $grandes) { Add-Content (Join-Path $Salida "no-subidos.txt") "$($g.Name): $([math]::Round($g.Length / 1MB)) MB" }
    $nombre = (& git -C $Repo config user.name)
    $correo = (& git -C $Repo config user.email)
    $quien = @()
    if (-not $nombre) { $quien += @("-c", "user.name=Computadora de la demo") }
    if (-not $correo) { $quien += @("-c", "user.email=computadora-demo@croquis.invalid") }
    # El commit se arma con un índice temporal, a partir del commit actual más los resultados, y
    # se sube directo a la rama nueva: la copia de trabajo y la rama en la que está el repositorio
    # no cambian, pase lo que pase.
    $indice = Join-Path $Carpeta "indice-$Fecha"
    $env:GIT_INDEX_FILE = $indice
    try {
      if ((Nativo "git" @("-C", $Repo, "read-tree", "HEAD")) -ne 0) { throw "No se pudo leer el commit actual." }
      $relativa = "resultados/$Tipo/$Fecha"
      foreach ($f in Get-ChildItem $Salida -File) {
        if ($grandes.Name -contains $f.Name) { continue }
        if ((Nativo "git" @("-C", $Repo, "add", "-f", "--", "$relativa/$($f.Name)")) -ne 0) {
          throw "No se pudo agregar $($f.Name)."
        }
      }
      $arbol = (& git -C $Repo write-tree).Trim()
      $padre = (& git -C $Repo rev-parse HEAD).Trim()
      $commit = (& git -C $Repo @quien commit-tree $arbol -p $padre -m "results: demo computer $Fecha").Trim()
      if (-not $commit) { throw "No se pudo hacer el commit." }
      if ((Nativo "git" @("-C", $Repo, "push", "origin", "$($commit):refs/heads/$Rama")) -ne 0) {
        throw "No se pudo hacer push (¿hay acceso al repositorio?)."
      }
    } finally {
      Remove-Item Env:\GIT_INDEX_FILE -ErrorAction SilentlyContinue
      Remove-Item -Force $indice -ErrorAction SilentlyContinue
    }
    "Rama $Rama en GitHub."
  }
}

# --- 6. Resumen ------------------------------------------------------------------------------------
$Total = [int]((Get-Date) - $Inicio).TotalSeconds
Escribir ""
Escribir "================ Resumen ================" "White"
foreach ($p in $Pasos) {
  $marca = if ($p.Bien) { "[ok]  " } else { "[FALLÓ]" }
  $color = if ($p.Bien) { "Green" } else { "Red" }
  Escribir ("{0} {1} — {2} s, RAM máxima {3} % {4}" -f $marca, $p.Paso, $p.Segundos, $p.RamMaxima, $p.Nota) $color
}
$fallos = @($Pasos | Where-Object { -not $_.Bien }).Count
Escribir ("Tiempo total: {0} min {1} s. RAM usada: {2} % al empezar, {3} % como máximo." -f [int][math]::Floor($Total / 60), ($Total % 60), $RamInicial, $script:RamMax) "White"
if ($fallos -eq 0) {
  Escribir "Todo salió bien. Los resultados están en $Salida y en la rama $Rama de GitHub." "Green"
} else {
  Escribir "Fallaron $fallos paso(s). Lo que sí se hizo está en $Salida. Avísale a René con una foto de esta ventana." "Yellow"
}
