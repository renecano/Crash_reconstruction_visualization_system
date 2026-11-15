<#
  Lo pesado de una tanda de Croquis, en la computadora del colaborador (la abre
  CORRER-TANDA-EN-RTX.bat; instrucciones en LEEME-TANDA-RTX.md).

  Qué hace, sin preguntar nada:
    1. Revisa las herramientas (Git, Node, pnpm; avisa de las opcionales) y anota el equipo:
       tarjeta de video, memoria, núcleos y disco libre. No anota el nombre del equipo ni el usuario.
    2. Si el repositorio está en main y sin cambios, trae lo último (git pull --ff-only).
    3. Corre, en orden, los pasos de la tanda vigente (tools/colaborador/tandas.json). Cada paso
       escribe su salida en un archivo; si uno falla o se pasa de su tope de tiempo, lo dice y sigue
       con el siguiente.
    4. Al terminar cada paso sube lo que ya está a la rama resultados/<tanda>-<fecha> (nunca a main).
       La copia de trabajo y la rama del repositorio no cambian: el commit se arma aparte.
    5. Muestra el resumen: qué corrió, cuánto tardó y qué falló.

  No pide llaves ni contraseñas, y ningún paso las necesita: el push usa las credenciales que Git ya
  tenga en esta computadora.

  Opciones (el colaborador no necesita ninguna; son para René y para probar):
    -Tanda NOMBRE   corre esa tanda en vez de la vigente (por ejemplo: prueba, t3)
    -Prueba         lo mismo que -Tanda prueba: 2 minutos para comprobar que todo el mecanismo sirve
    -SinSubir       no hace commit ni push (los resultados quedan en la carpeta)
    -Lista          solo dice qué tandas hay y qué pasos tienen
#>
param(
  [string]$Tanda = "",
  [switch]$Prueba,
  [switch]$SinSubir,
  [switch]$Lista
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Config = Get-Content (Join-Path $PSScriptRoot "tandas.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Prueba) { $Tanda = "prueba" }
if (-not $Tanda) { $Tanda = $Config.vigente }

function Escribir([string]$texto, [string]$color = "Gray") { Write-Host $texto -ForegroundColor $color }

if ($Lista) {
  Escribir "Tanda vigente: $($Config.vigente)" "White"
  foreach ($t in $Config.tandas.PSObject.Properties) {
    Escribir ""
    Escribir "$($t.Name): $($t.Value.titulo)" "White"
    if (@($t.Value.pasos).Count -eq 0) { Escribir "  (sin pasos pesados)" }
    foreach ($p in @($t.Value.pasos)) { Escribir "  - $($p.nombre) (~$($p.minutos) min): $($p.comando)" }
  }
  exit 0
}

$Definicion = $Config.tandas.$Tanda
if (-not $Definicion) {
  Escribir "No existe la tanda «$Tanda». Las que hay: $(($Config.tandas.PSObject.Properties.Name) -join ', ')." "Red"
  exit 2
}
if ($Tanda -notmatch '^[a-z0-9-]+$') {
  Escribir "El nombre de la tanda solo lleva minúsculas, números y guiones." "Red"
  exit 2
}

$Fecha = Get-Date -Format "yyyy-MM-dd"
$Rama = "resultados/$Tanda-$Fecha"
$Relativa = "resultados/$Tanda/$Fecha"
$Salida = Join-Path $Repo $Relativa
New-Item -ItemType Directory -Force $Salida | Out-Null
$Inicio = Get-Date
$Pasos = New-Object System.Collections.ArrayList

# --- Utilidades --------------------------------------------------------------------------------------
function EscribirJson([string]$ruta, $objeto) {
  $json = $objeto | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($ruta, $json + "`n", (New-Object Text.UTF8Encoding($false)))
}

# Corre un programa y devuelve su salida (o $null si no existe o falla). No lanza errores.
function SalidaDe([string]$programa, [string[]]$argumentos) {
  if (-not (Get-Command $programa -ErrorAction SilentlyContinue)) { return $null }
  $previo = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $salida = & $programa @argumentos 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return (($salida | Out-String).Trim())
  } catch { return $null } finally { $ErrorActionPreference = $previo }
}

# Corre un programa y devuelve su código de salida, sin mostrar nada.
function Nativo([string]$programa, [string[]]$argumentos) {
  $previo = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $programa @argumentos 2>$null | Out-Null
    return $LASTEXITCODE
  } catch { return 1 } finally { $ErrorActionPreference = $previo }
}

function Minutos([TimeSpan]$t) { return [math]::Round($t.TotalMinutes, 1) }

# --- El equipo ---------------------------------------------------------------------------------------
function DatosDelEquipo {
  $so = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $unidad = (Get-Item $Repo).PSDrive.Name
  $disco = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($unidad):'"
  $unity = @()
  # Las carpetas donde Unity Hub instala los editores: la de siempre y la que el usuario haya elegido.
  $carpetasUnity = @((Join-Path $env:ProgramFiles "Unity\Hub\Editor"))
  $secundaria = Join-Path $env:APPDATA "UnityHub\secondaryInstallPath.json"
  if (Test-Path $secundaria) {
    try {
      $ruta = Get-Content $secundaria -Raw | ConvertFrom-Json
      if ($ruta -is [string] -and $ruta) { $carpetasUnity += $ruta }
    } catch { }
  }
  foreach ($c in $carpetasUnity) {
    if (Test-Path $c) { $unity += @(Get-ChildItem $c -Directory | ForEach-Object { $_.Name }) }
  }
  $unityDelProyecto = $null
  $versionUnity = Join-Path $Repo "apps\visor-unity\ProjectSettings\ProjectVersion.txt"
  if (Test-Path $versionUnity) {
    $linea = Get-Content $versionUnity | Where-Object { $_ -match '^m_EditorVersion:' } | Select-Object -First 1
    if ($linea) { $unityDelProyecto = ($linea -replace '^m_EditorVersion:\s*', '').Trim() }
  }
  return [ordered]@{
    tarjetas_de_video    = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
    memoria_gb           = [math]::Round($so.TotalVisibleMemorySize / 1MB, 1)
    procesador           = $cpu.Name.Trim()
    nucleos_logicos      = [int]$cpu.NumberOfLogicalProcessors
    disco_libre_gb       = [math]::Round($disco.FreeSpace / 1GB, 1)
    windows              = $so.Caption.Trim()
    git                  = SalidaDe "git" @("--version")
    node                 = SalidaDe "node" @("--version")
    pnpm                 = SalidaDe "pnpm" @("--version")
    uv                   = SalidaDe "uv" @("--version")
    python               = SalidaDe "python" @("--version")
    dotnet               = SalidaDe "dotnet" @("--version")
    unity_instalados     = $unity
    unity_del_proyecto   = $unityDelProyecto
    unity_coincide       = [bool]($unityDelProyecto -and ($unity -contains $unityDelProyecto))
  }
}

function DatosDeLaCorrida {
  return [ordered]@{
    tanda                    = $Tanda
    titulo                   = $Definicion.titulo
    fecha                    = $Fecha
    commit                   = SalidaDe "git" @("-C", $Repo, "rev-parse", "HEAD")
    rama_del_repositorio     = SalidaDe "git" @("-C", $Repo, "rev-parse", "--abbrev-ref", "HEAD")
    archivos_con_cambios     = @((SalidaDe "git" @("-C", $Repo, "status", "--porcelain", "--untracked-files=no")) -split "`n" | Where-Object { $_ }).Count
    duracion_min             = Minutos ((Get-Date) - $Inicio)
    equipo                   = $Equipo
    pasos                    = $Pasos
  }
}

# --- Subir lo que ya está (después de cada paso) -----------------------------------------------------
# El commit se arma con un índice temporal sobre el último commit de la rama de resultados (si ya se
# subió algo hoy) o sobre el commit actual, y se sube directo a esa rama: la copia de trabajo y la
# rama en la que está el repositorio no cambian.
function Subir([string]$motivo, [string[]]$salidas) {
  EscribirJson (Join-Path $Salida "corrida.json") (DatosDeLaCorrida)
  if ($SinSubir) { return }
  if ($Rama -eq "main" -or $Rama -notmatch '^resultados/') { throw "La rama de resultados no puede ser main." }
  try {
    $remota = SalidaDe "git" @("-C", $Repo, "ls-remote", "origin", "refs/heads/$Rama")
    $padre = $null
    if ($remota) {
      $padre = ($remota -split "\s+")[0]
      if ((Nativo "git" @("-C", $Repo, "cat-file", "-e", "$padre^{commit}")) -ne 0) {
        if ((Nativo "git" @("-C", $Repo, "fetch", "origin", "refs/heads/$Rama")) -ne 0) { throw "No se pudo traer la rama $Rama." }
      }
    } else {
      $padre = SalidaDe "git" @("-C", $Repo, "rev-parse", "HEAD")
    }
    $quien = @()
    if (-not (SalidaDe "git" @("-C", $Repo, "config", "user.name"))) { $quien += @("-c", "user.name=Computadora del colaborador") }
    if (-not (SalidaDe "git" @("-C", $Repo, "config", "user.email"))) { $quien += @("-c", "user.email=colaborador@croquis.invalid") }
    $indice = Join-Path $env:TEMP "croquis-indice-$Tanda-$Fecha"
    $env:GIT_INDEX_FILE = $indice
    try {
      if ((Nativo "git" @("-C", $Repo, "read-tree", $padre)) -ne 0) { throw "No se pudo leer el commit $padre." }
      $rutas = @($Relativa) + @($salidas | Where-Object { $_ -and (Test-Path (Join-Path $Repo $_)) })
      foreach ($r in $rutas) {
        if ((Nativo "git" @("-C", $Repo, "add", "-f", "--", $r)) -ne 0) { throw "No se pudo agregar $r." }
      }
      $arbol = SalidaDe "git" @("-C", $Repo, "write-tree")
      $arbolPadre = SalidaDe "git" @("-C", $Repo, "rev-parse", "$padre^{tree}")
      if ($arbol -eq $arbolPadre) { Escribir "   Nada nuevo que subir ($motivo)."; return }
      $commit = SalidaDe "git" (@("-C", $Repo) + $quien + @("commit-tree", $arbol, "-p", $padre, "-m", "results: $Tanda $Fecha ($motivo)"))
      if (-not $commit) { throw "No se pudo hacer el commit." }
      if ((Nativo "git" @("-C", $Repo, "push", "origin", "$($commit):refs/heads/$Rama")) -ne 0) {
        throw "No se pudo hacer push (¿hay acceso al repositorio?)."
      }
    } finally {
      Remove-Item Env:\GIT_INDEX_FILE -ErrorAction SilentlyContinue
      Remove-Item -Force $indice -ErrorAction SilentlyContinue
    }
    Escribir "   Subido a la rama $Rama ($motivo)." "Green"
  } catch {
    # Que no se pueda subir no detiene la corrida: lo que está queda en la carpeta.
    Escribir "   No se subió ($motivo): $($_.Exception.Message) Queda en $Salida." "Yellow"
  }
}

# --- Un paso -----------------------------------------------------------------------------------------
# Corre el comando en la raíz del repositorio con la salida a un archivo. Avisa cada 30 s cuánto
# lleva. Si pasa de su tope (4 veces lo estimado, y al menos 10 minutos) lo detiene y sigue.
function CorrerPaso([int]$numero, $paso) {
  $nombre = [string]$paso.nombre
  $registro = Join-Path $Salida ("{0:D2}-{1}.log" -f $numero, $nombre)
  $estimado = [double]$paso.minutos
  $tope = [math]::Max(10, 4 * $estimado)
  Escribir ""
  Escribir "[$numero/$Total] $nombre (unos $estimado min; tope $tope min)" "White"
  $argumentos = '/d /s /c "' + [string]$paso.comando + ' > "' + $registro + '" 2>&1"'
  $t0 = Get-Date
  $estado = "ok"
  $codigo = $null
  try {
    $proceso = Start-Process -FilePath $env:ComSpec -ArgumentList $argumentos -WorkingDirectory $Repo -NoNewWindow -PassThru
    # Sin esto, PowerShell 5.1 no siempre guarda el código de salida de Start-Process.
    $null = $proceso.Handle
    while (-not $proceso.WaitForExit(30000)) {
      $lleva = (Get-Date) - $t0
      if ($lleva.TotalMinutes -gt $tope) {
        & taskkill.exe /PID $proceso.Id /T /F 2>$null | Out-Null
        $estado = "detenido por pasar de $tope min"
        break
      }
      Escribir ("   lleva {0} min de unos {1}" -f (Minutos $lleva), $estimado)
    }
    if ($estado -eq "ok") {
      $proceso.WaitForExit()
      $codigo = $proceso.ExitCode
      if ($codigo -ne 0) { $estado = "falló (código $codigo)" }
    }
  } catch {
    $estado = "no arrancó: $($_.Exception.Message)"
  }
  $duracion = Minutos ((Get-Date) - $t0)
  $color = "Green"
  if ($estado -ne "ok") { $color = "Yellow" }
  Escribir "   $estado, en $duracion min. Salida: $Relativa/$(Split-Path $registro -Leaf)" $color
  [void]$Pasos.Add([ordered]@{ paso = $nombre; estado = $estado; minutos = $duracion; codigo = $codigo })
  Subir $nombre @($paso.salidas)
}

# --- La corrida --------------------------------------------------------------------------------------
Escribir ""
Escribir "Croquis · $($Definicion.titulo) — $Fecha ($(Get-Date -Format 'HH:mm'))" "White"
Escribir "Resultados en: $Salida"
Escribir "No cierres esta ventana. No pide llaves ni contraseñas."

$Equipo = DatosDelEquipo
$faltan = @()
foreach ($h in @("git", "node", "pnpm")) { if (-not $Equipo[$h]) { $faltan += $h } }
if ($faltan.Count -gt 0) {
  Escribir ""
  Escribir "Faltan herramientas: $($faltan -join ', ')." "Red"
  Escribir "  Git: https://git-scm.com   Node $(Get-Content (Join-Path $Repo '.node-version')): https://nodejs.org   pnpm: npm install -g pnpm" "Red"
  Escribir "Instálalas y vuelve a abrir CORRER-TANDA-EN-RTX.bat." "Red"
  EscribirJson (Join-Path $Salida "corrida.json") (DatosDeLaCorrida)
  exit 1
}
Escribir "Equipo: $($Equipo.tarjetas_de_video -join ' + '); $($Equipo.memoria_gb) GB; $($Equipo.nucleos_logicos) núcleos; $($Equipo.disco_libre_gb) GB libres."
foreach ($h in @("uv", "dotnet")) { if (-not $Equipo[$h]) { Escribir "  (no está $($h): solo hace falta si un paso lo usa)" } }
if (-not $Equipo.unity_coincide) { Escribir "  (no está Unity $($Equipo.unity_del_proyecto): solo hace falta para los pasos del visor)" }

# Lo último de main, solo si no estorba: en main y sin cambios.
$ramaActual = SalidaDe "git" @("-C", $Repo, "rev-parse", "--abbrev-ref", "HEAD")
$sucio = SalidaDe "git" @("-C", $Repo, "status", "--porcelain", "--untracked-files=no")
if ($ramaActual -eq "main" -and -not $sucio) {
  if ((Nativo "git" @("-C", $Repo, "pull", "--ff-only", "origin", "main")) -eq 0) { Escribir "Repositorio al día con main." }
  else { Escribir "No se pudo traer lo último de main; sigue con lo que hay." "Yellow" }
} else {
  Escribir "El repositorio no está en main limpio (rama $ramaActual): corre con lo que hay." "Yellow"
}

$ListaPasos = @($Definicion.pasos)
$Total = $ListaPasos.Count
if ($Total -eq 0) {
  Escribir ""
  Escribir "Esta tanda no tiene pasos pesados. $($Definicion.nota)" "White"
}
$n = 0
foreach ($p in $ListaPasos) {
  $n++
  CorrerPaso $n $p
}
Subir "resumen" @()

Escribir ""
Escribir "Resumen ($(Minutos ((Get-Date) - $Inicio)) min):" "White"
foreach ($p in $Pasos) {
  $color = "Green"
  if ($p.estado -ne "ok") { $color = "Yellow" }
  Escribir ("  {0,-28} {1}  ({2} min)" -f $p.paso, $p.estado, $p.minutos) $color
}
$fallas = @($Pasos | Where-Object { $_.estado -ne "ok" }).Count
if ($SinSubir) { Escribir "No se subió nada (-SinSubir): los resultados están en $Salida." }
else { Escribir "Los resultados están en la rama $Rama. Avísale a René que ya terminó." "White" }
if ($fallas -gt 0) {
  Escribir "$fallas paso(s) no terminaron bien: su salida está en la misma rama." "Yellow"
  exit 1
}
exit 0
