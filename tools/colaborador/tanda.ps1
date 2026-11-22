<#
  Lo pesado de una tanda de Croquis, en la computadora del colaborador (la abre
  CORRER-TANDA-EN-RTX.bat; instrucciones en LEEME-TANDA-RTX.md).

  Una sola corrida, sin preguntas:
    1. Herramientas. Si falta Git, Node o pnpm, los instala solo (avisa antes qué va a instalar):
       Git y Node LTS con winget; pnpm, en la versión que fija el repositorio, con corepack (o con
       npm si ese Node ya no trae corepack). Refresca el PATH en la misma ventana. Si winget no
       existe o una instalación falla, lo dice con el enlace de descarga y se detiene.
    2. La rama. Si la tanda vigente vive en una rama que todavía no está en main, se cambia a ella
       (solo con la copia de trabajo limpia) y al terminar vuelve a la que estaba.
    3. Comprobación del mecanismo (unos 2 minutos): dependencias, un cálculo corto y la primera
       subida. Si algo falla, se detiene y lo dice: lo pesado no corre.
    4. Lo pesado de la tanda (tools/colaborador/tandas.json), paso por paso. Cada paso escribe su
       salida en un archivo; si uno falla o se pasa de su tope, lo dice y sigue con el siguiente.
    5. Sube lo que ya está al terminar cada paso, a la rama resultados/<tanda>-<fecha> (nunca a
       main). El commit se arma aparte: la copia de trabajo no cambia.
    6. Resumen: qué corrió, cuánto tardó y qué falló.

  No pide ni guarda llaves, tokens o contraseñas. Para subir usa el inicio de sesión normal de
  GitHub: si hace falta, Git abre el navegador (Git Credential Manager).

  Opciones (el colaborador no necesita ninguna; son para René y para probar):
    -Tanda NOMBRE        corre esa tanda en vez de la vigente
    -Prueba              solo la comprobación del mecanismo
    -SinSubir            no hace commit ni push (los resultados quedan en la carpeta)

  Lo privado (René, 2026-11-21: el repositorio es público): nada cuya ruta nombre a AXA o al juego
  «solo-cesvi» se sube, aunque esté en las salidas de un paso. Las carpetas `privadas` de un paso se
  comprimen en un zip en la carpeta de resultados y se quedan en esta computadora; al final, la
  ventana dice dónde está para mandárselo a René por WhatsApp o Drive.
    -Lista               solo dice qué tandas hay y qué pasos tienen
    -Solo LISTA          de lo pesado, solo esos pasos (nombres con comas), para probar
    -SimularFalta LISTA  hace como si faltaran esas herramientas (git, node, pnpm; con comas), para
                         probar la instalación. Git y Node no se instalan de verdad en la simulación:
                         solo se muestra lo que haría
#>
param(
  [string]$Tanda = "",
  [switch]$Prueba,
  [switch]$SinSubir,
  [switch]$Lista,
  [string]$SimularFalta = "",
  [string]$Solo = "",
  [switch]$EnSuRama,
  # Lo pone el propio script al volver a lanzarse después de traer lo último de main.
  [switch]$YaAlDia
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

# La copia de main que se relanza al cambiar al commit de la tanda (abajo) corre desde una carpeta
# temporal: el repositorio se lo dice quien la lanza.
$Repo = if ($env:CROQUIS_TANDA_REPO) { $env:CROQUIS_TANDA_REPO } else { (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
function Escribir([string]$texto, [string]$color = "Gray") { Write-Host $texto -ForegroundColor $color }

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

# Corre un programa mostrando su salida (una instalación) y devuelve su código.
function AlaVista([string]$programa, [string[]]$argumentos) {
  $previo = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $programa @argumentos | Out-Host
    return $LASTEXITCODE
  } catch {
    Escribir "   $($_.Exception.Message)" "Yellow"
    return 1
  } finally { $ErrorActionPreference = $previo }
}

function Minutos([TimeSpan]$t) { return [math]::Round($t.TotalMinutes, 1) }

# --- Primero: en main y al día (René, 2026-11-20) ----------------------------------------------------
# Antes de leer tandas.json. Una tanda cortada (Ctrl+C, la ventana cerrada) pudo dejar la copia en la
# rama o el commit de esa tanda, y leer su tandas.json vuelve a correr la tanda vieja. Así que: si la
# copia no está en main, lo dice y regresa; después trae lo último de main (pull --ff-only). Los
# resultados que dejó una corrida anterior (ya subidos) se guardan en un stash, no se borran
# (`git stash list` los muestra). Si cambió la versión del script, se vuelve a lanzar con la nueva.
$Avisos = New-Object System.Collections.ArrayList
$ConfigLocal = $null
try { $ConfigLocal = Get-Content (Join-Path $PSScriptRoot "tandas.json") -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }

# Lo que no sale de esta computadora (René, 2026-11-21: el repositorio es público).
$PatronPrivado = '(?i)(axa|a2010930|solo-cesvi)'
$ZipsPrivados = New-Object System.Collections.ArrayList

function EsResultado([string]$ruta) {
  $ruta = $ruta.Trim('"').Replace("\", "/")
  if ($ruta.StartsWith("eval/results/") -or $ruta.StartsWith("resultados/")) { return $true }
  foreach ($t in $ConfigLocal.tandas.PSObject.Properties) {
    foreach ($p in @($t.Value.pasos)) {
      foreach ($s in (@($p.salidas) + @($p.privadas))) {
        if ($s -and ($ruta -eq [string]$s -or $ruta.StartsWith(([string]$s).TrimEnd("/") + "/"))) { return $true }
      }
    }
  }
  return $false
}

function ResultadosEnStash([string]$porQue) {
  $estado = SalidaDe "git" @("-C", $Repo, "status", "--porcelain", "--untracked-files=all")
  $cambios = @()
  if ($estado) { $cambios = @($estado -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_ -replace '^\s*\S{1,2}\s+', '' }) }
  if ($cambios.Count -eq 0) { return $true }
  $ajenos = @($cambios | Where-Object { -not (EsResultado $_) })
  if ($ajenos.Count -gt 0) {
    [void]$Avisos.Add("Hay cambios en la carpeta que no son resultados de una tanda ($($ajenos[0])...): no la muevo ($porQue).")
    return $false
  }
  $mensaje = "Croquis: resultados de una corrida anterior, ya subidos ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
  if ((Nativo "git" @("-C", $Repo, "stash", "push", "--include-untracked", "-m", $mensaje)) -ne 0) {
    [void]$Avisos.Add("No pude guardar los resultados de la corrida anterior: no muevo la carpeta ($porQue).")
    return $false
  }
  [void]$Avisos.Add("Guardé en un stash los $($cambios.Count) archivos de resultados que dejó una corrida anterior (ya están en GitHub).")
  return $true
}

if (-not $EnSuRama -and -not $YaAlDia -and (Get-Command git -ErrorAction SilentlyContinue)) {
  $antes = SalidaDe "git" @("-C", $Repo, "rev-parse", "HEAD")
  $ramaAlArrancar = SalidaDe "git" @("-C", $Repo, "rev-parse", "--abbrev-ref", "HEAD")
  if ($ramaAlArrancar -and $ramaAlArrancar -ne "main") {
    Escribir "La copia no está en main sino en «$ramaAlArrancar» (una tanda anterior se cortó a la mitad): regreso a main." "Yellow"
    if (-not (ResultadosEnStash "para regresar a main")) {
      foreach ($a in $Avisos) { Escribir $a "Yellow" }
      Escribir "No puedo regresar a main solo. Escribe en esta carpeta: git checkout main" "Red"
      exit 1
    }
    if ((Nativo "git" @("-C", $Repo, "checkout", "main")) -ne 0) {
      foreach ($a in $Avisos) { Escribir $a "Yellow" }
      Escribir "No pude regresar a main. Escribe en esta carpeta: git checkout main" "Red"
      exit 1
    }
    [void]$Avisos.Add("La copia estaba en «$ramaAlArrancar»: regresé a main.")
  }
  if (ResultadosEnStash "para traer lo último de main") {
    if ((Nativo "git" @("-C", $Repo, "pull", "--ff-only", "origin", "main")) -eq 0) {
      [void]$Avisos.Add("Repositorio al día con main.")
    } else {
      [void]$Avisos.Add("No pude traer lo último de main (¿hay internet?): sigo con la versión que hay.")
    }
  }
  $despues = SalidaDe "git" @("-C", $Repo, "rev-parse", "HEAD")
  if ($despues -ne $antes) {
    # Llegó otra versión: se corre esa, no la que ya estaba cargada en memoria.
    $env:CROQUIS_TANDA_AVISOS = ($Avisos -join "`n")
    $argumentos = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-YaAlDia")
    if ($Tanda) { $argumentos += @("-Tanda", $Tanda) }
    if ($Prueba) { $argumentos += "-Prueba" }
    if ($SinSubir) { $argumentos += "-SinSubir" }
    if ($Lista) { $argumentos += "-Lista" }
    if ($Solo) { $argumentos += @("-Solo", $Solo) }
    if ($SimularFalta) { $argumentos += @("-SimularFalta", $SimularFalta) }
    & powershell.exe @argumentos
    exit $LASTEXITCODE
  }
}
if ($env:CROQUIS_TANDA_AVISOS) {
  foreach ($a in ($env:CROQUIS_TANDA_AVISOS -split "`n")) { if ($a) { [void]$Avisos.Add($a) } }
  Remove-Item Env:\CROQUIS_TANDA_AVISOS -ErrorAction SilentlyContinue
}

$Config = Get-Content (Join-Path $PSScriptRoot "tandas.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Tanda) { $Tanda = $Config.vigente }


if ($Lista) {
  Escribir "Tanda vigente: $($Config.vigente)" "White"
  Escribir ""
  Escribir "Comprobación del mecanismo (siempre va primero):" "White"
  foreach ($p in @($Config.comprobacion.pasos)) { Escribir "  - $($p.nombre) (~$($p.minutos) min): $($p.comando)" }
  foreach ($t in $Config.tandas.PSObject.Properties) {
    Escribir ""
    Escribir "$($t.Name): $($t.Value.titulo)" "White"
    if ($t.Value.rama) { Escribir "  (en la rama $($t.Value.rama))" }
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


# --- El letrero: qué tanda y qué commit corren (René, 2026-11-20) -------------------------------------
if (-not $EnSuRama) {
  $commitLetrero = [string]$Definicion.commit
  $deDonde = "fijada"
  if (-not $commitLetrero -and $Definicion.rama) { $commitLetrero = "la punta de $($Definicion.rama)"; $deDonde = "" }
  if (-not $commitLetrero) {
    $commitLetrero = [string](SalidaDe "git" @("-C", $Repo, "rev-parse", "HEAD"))
    $deDonde = "main"
  }
  if ($commitLetrero -match '^[0-9a-f]{40}$') { $commitLetrero = $commitLetrero.Substring(0, 8) }
  $lineasLetrero = @(
    "  TANDA   $Tanda",
    "  COMMIT  $commitLetrero$(if ($deDonde) { "  ($deDonde)" })"
  )
  if ($Prueba) { $lineasLetrero += "  (solo la comprobación del mecanismo)" }
  $ancho = [math]::Max(64, (($lineasLetrero | ForEach-Object { $_.Length }) | Measure-Object -Maximum).Maximum + 4)
  try { Clear-Host } catch { }
  Write-Host (" " * $ancho) -BackgroundColor DarkBlue
  foreach ($l in $lineasLetrero) { Write-Host ($l.PadRight($ancho)) -ForegroundColor White -BackgroundColor DarkBlue }
  Write-Host (" " * $ancho) -BackgroundColor DarkBlue
  try { $Host.UI.RawUI.WindowTitle = "Croquis · tanda $Tanda · $commitLetrero" } catch { }
  foreach ($a in $Avisos) { Escribir $a }
}


# --- Herramientas: lo que falte se instala solo -------------------------------------------------------
$Simuladas = New-Object System.Collections.Generic.HashSet[string]
foreach ($s in ($SimularFalta -split ",")) { if ($s.Trim()) { [void]$Simuladas.Add($s.Trim().ToLower()) } }
$ENLACES = @{
  git  = "https://git-scm.com/download/win"
  node = "https://nodejs.org/es/download"
  pnpm = "https://pnpm.io/es/installation"
}

# El PATH de Windows (máquina y usuario), más lo que esta ventana ya tenía: así lo recién instalado
# se encuentra sin cerrar y volver a abrir.
function RefrescarPath {
  $partes = @(
    [Environment]::GetEnvironmentVariable("Path", "Machine"),
    [Environment]::GetEnvironmentVariable("Path", "User"),
    $env:Path
  ) | Where-Object { $_ }
  $vistas = New-Object System.Collections.Generic.HashSet[string]
  $orden = New-Object System.Collections.ArrayList
  foreach ($d in (($partes -join ";") -split ";")) {
    $x = $d.Trim()
    if ($x -and $vistas.Add($x.ToLower().TrimEnd("\"))) { [void]$orden.Add($x) }
  }
  $env:Path = $orden -join ";"
}

function Tiene([string]$nombre) {
  if ($Simuladas.Contains($nombre)) { return $false }
  return [bool](Get-Command $nombre -ErrorAction SilentlyContinue)
}

function Detenerse([string]$que, [string]$porQue) {
  Escribir ""
  Escribir "No se pudo instalar $que. $porQue" "Red"
  Escribir "Instálalo a mano desde: $($ENLACES[$que.ToLower().Split(' ')[0]])" "Red"
  Escribir "Después vuelve a hacer doble clic en CORRER-TANDA-EN-RTX.bat." "Red"
  exit 1
}

# La versión de pnpm que fija el repositorio («packageManager» de package.json).
function VersionDePnpm {
  $pm = (Get-Content (Join-Path $Repo "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json).packageManager
  if ($pm -match '^pnpm@([0-9][0-9A-Za-z.\-]*)') { return $Matches[1] }
  throw "package.json no fija la versión de pnpm."
}

function InstalarConWinget([string]$nombre, [string]$id, [string]$comando) {
  if ($Simuladas.Contains($comando)) {
    Escribir "   (simulación: aquí correría «winget install --id $id -e --silent»; no se instala de verdad)" "Yellow"
    [void]$Simuladas.Remove($comando)
    return
  }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Detenerse $comando "Esta computadora no tiene winget (el instalador de Windows)."
  }
  Escribir "   Instalando $nombre con winget…" "White"
  $codigo = AlaVista "winget" @("install", "--id", $id, "-e", "--accept-source-agreements", "--accept-package-agreements", "--silent")
  RefrescarPath
  if (-not (Get-Command $comando -ErrorAction SilentlyContinue)) {
    Detenerse $comando "winget terminó con el código $codigo y «$comando» sigue sin encontrarse."
  }
  Escribir "   $nombre quedó instalado." "Green"
}

function InstalarPnpm {
  $version = VersionDePnpm
  # En la simulación la instalación sí corre de verdad (es la que René pidió probar), pero en una
  # carpeta aparte para no tocar el pnpm que ya tenga la computadora.
  [void]$Simuladas.Remove("pnpm")
  $carpeta = Join-Path $env:LOCALAPPDATA "Croquis\bin"
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    Escribir "   Instalando pnpm $version con corepack (en $carpeta)…" "White"
    New-Item -ItemType Directory -Force $carpeta | Out-Null
    $c1 = AlaVista "corepack" @("enable", "--install-directory", $carpeta, "pnpm")
    $c2 = AlaVista "corepack" @("prepare", "pnpm@$version", "--activate")
    if ($c1 -eq 0 -and $c2 -eq 0) {
      $env:Path = "$carpeta;$env:Path"
      $instalada = SalidaDe (Join-Path $carpeta "pnpm.cmd") @("--version")
      if ($instalada) {
        Escribir "   pnpm $instalada quedó instalado con corepack." "Green"
        return
      }
    }
    Escribir "   corepack no lo logró (códigos $c1 y $c2); se intenta con npm." "Yellow"
  } else {
    Escribir "   Este Node no trae corepack: pnpm $version se instala con npm." "White"
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Detenerse "pnpm" "No está npm (viene con Node)." }
  $codigo = AlaVista "npm" @("install", "--global", "pnpm@$version")
  RefrescarPath
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Detenerse "pnpm" "npm terminó con el código $codigo y «pnpm» sigue sin encontrarse."
  }
  Escribir "   pnpm $(SalidaDe 'pnpm' @('--version')) quedó instalado con npm." "Green"
}

function AsegurarHerramientas {
  RefrescarPath
  $faltan = @(@("git", "node", "pnpm") | Where-Object { -not (Tiene $_) })
  if ($faltan.Count -eq 0) { return @() }
  $nombres = @{ git = "Git"; node = "Node.js LTS"; pnpm = "pnpm $(VersionDePnpm)" }
  Escribir ""
  Escribir "Faltan herramientas: $(($faltan | ForEach-Object { $nombres[$_] }) -join ', ')." "Yellow"
  Escribir "Se van a instalar solas, ahora. No hay que hacer nada, salvo esto:" "White"
  Escribir "  - Puede aparecer la ventana de permiso de Windows («¿Quieres permitir que esta aplicación" "White"
  Escribir "    haga cambios en el dispositivo?»): dale «Sí»." "White"
  Escribir "  - No pide contraseñas ni llaves." "White"
  Escribir ""
  if ($faltan -contains "git") { InstalarConWinget "Git" "Git.Git" "git" }
  if ($faltan -contains "node") { InstalarConWinget "Node.js LTS" "OpenJS.NodeJS.LTS" "node" }
  if ($faltan -contains "pnpm") { InstalarPnpm }
  return $faltan
}

$Instaladas = @(AsegurarHerramientas)

# Mientras corre la tanda en su rama o commit: Ctrl+C detiene el paso (el proceso hijo), no a este, y
# al cerrar la ventana se regresa a la rama de antes en los segundos que da Windows.
function GuardiaDeLaTanda([string]$repo, [string]$rama) {
  if (-not ("Croquis.Guardia" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
namespace Croquis {
  public static class Guardia {
    private delegate bool Manejador(int evento);
    [DllImport("kernel32.dll")] private static extern bool SetConsoleCtrlHandler(Manejador m, bool agregar);
    private static Manejador manejador;
    private static string repo;
    private static string rama;
    public static void Poner(string r, string b) {
      repo = r; rama = b;
      if (manejador == null) { manejador = Atender; SetConsoleCtrlHandler(manejador, true); }
    }
    public static void Quitar() {
      if (manejador != null) { SetConsoleCtrlHandler(manejador, false); manejador = null; }
    }
    // 0 Ctrl+C, 1 Ctrl+Break: los atiende el paso; este proceso sigue para regresar a la rama.
    // 2 la ventana se cierra: se regresa ya (Windows da unos 5 s).
    private static bool Atender(int evento) {
      if (evento == 2) Volver(1);
      return true;
    }
    public static bool Volver(int intentos) {
      for (int i = 0; i < intentos; i++) {
        try {
          var psi = new ProcessStartInfo("git", "-C \"" + repo + "\" checkout -q " + rama);
          psi.UseShellExecute = false; psi.CreateNoWindow = true;
          psi.RedirectStandardOutput = true; psi.RedirectStandardError = true;
          using (var p = Process.Start(psi)) {
            p.WaitForExit(4000);
            if (p.HasExited && p.ExitCode == 0) return true;
          }
        } catch { }
        System.Threading.Thread.Sleep(2000);
      }
      return false;
    }
  }
}
"@
  }
  [Croquis.Guardia]::Poner($repo, $rama)
}

# --- La rama de la tanda ------------------------------------------------------------------------------
# Una tanda que todavía no está en main vive en su rama: se cambia a ella y esta misma corrida sigue
# desde ahí (con el guion y los pasos de esa rama). Al terminar vuelve a la rama en la que estaba.
$ramaActual = SalidaDe "git" @("-C", $Repo, "rev-parse", "--abbrev-ref", "HEAD")
if (-not $ramaActual) {
  Escribir ""
  Escribir "Esta carpeta no es un repositorio de Git: hay que clonarla, no descargarla como .zip." "Red"
  Escribir "  git clone https://github.com/renecano/Crash_reconstruction_visualization_system.git" "Red"
  exit 1
}
$ramaDeLaTanda = [string]$Definicion.rama
if ($ramaDeLaTanda -and -not $EnSuRama -and $ramaActual -ne $ramaDeLaTanda) {
  $sucio = SalidaDe "git" @("-C", $Repo, "status", "--porcelain", "--untracked-files=no")
  if ($sucio) {
    Escribir ""
    Escribir "Hay cambios sin guardar en esta carpeta, así que no puedo cambiar a la rama $ramaDeLaTanda." "Red"
    Escribir "Guárdalos o descártalos (git stash) y vuelve a hacer doble clic." "Red"
    exit 1
  }
  Escribir "La tanda «$Tanda» está en la rama $ramaDeLaTanda. Cambio a ella; al terminar vuelvo a $ramaActual."
  # Pase lo que pase (un error, Ctrl+C, la ventana cerrada), se regresa a la rama de antes (René,
  # 2026-11-20). Con Ctrl+C, PowerShell deja de correr comandos en el `finally` (la prueba lo mostró:
  # la copia se quedaba en el commit de la tanda), así que mientras corre la tanda este proceso atiende
  # él mismo Ctrl+C y el cierre de la ventana (`GuardiaDeLaTanda`): el paso que corre se detiene como
  # siempre, y aquí se regresa a la rama con git directo (.NET, no la tubería de PowerShell). Si aun
  # así no alcanza, el .bat y la siguiente corrida lo notan al arrancar y regresan a main.
  $codigo = 1
  GuardiaDeLaTanda $Repo $ramaActual
  try {
  if ((Nativo "git" @("-C", $Repo, "fetch", "origin", $ramaDeLaTanda)) -ne 0) {
    Escribir "No se pudo traer la rama $ramaDeLaTanda de GitHub (¿hay internet?)." "Red"
    exit 1
  }
  # Fijada a un commit (René, 2026-11-19): se prueba ese SHA exacto, aunque la rama avance mientras corre.
  $destino = "FETCH_HEAD"
  $commitDeLaTanda = [string]$Definicion.commit
  if ($commitDeLaTanda) {
    if ((Nativo "git" @("-C", $Repo, "cat-file", "-e", "$commitDeLaTanda^{commit}")) -ne 0) {
      [void](Nativo "git" @("-C", $Repo, "fetch", "origin", $commitDeLaTanda))
    }
    if ((Nativo "git" @("-C", $Repo, "cat-file", "-e", "$commitDeLaTanda^{commit}")) -ne 0) {
      Escribir "No encontré el commit $commitDeLaTanda de la tanda en GitHub." "Red"
      exit 1
    }
    $destino = $commitDeLaTanda
    Escribir "La tanda está fijada al commit $commitDeLaTanda."
  }
  # La definición de la tanda y este script se toman de main, antes de cambiar de commit (René,
  # 2026-11-22: el commit fijado no trae la t6 en su tandas.json, ni el filtro de lo privado).
  $deMain = Join-Path ([IO.Path]::GetTempPath()) "croquis-tanda-main"
  New-Item -ItemType Directory -Force $deMain | Out-Null
  Copy-Item -Force $PSCommandPath (Join-Path $deMain "tanda.ps1")
  Copy-Item -Force (Join-Path $PSScriptRoot "tandas.json") (Join-Path $deMain "tandas.json")
  if ((Nativo "git" @("-C", $Repo, "checkout", "-B", $ramaDeLaTanda, $destino)) -ne 0) {
    Escribir "No se pudo cambiar a la rama $ramaDeLaTanda." "Red"
    exit 1
  }
  $env:CROQUIS_TANDA_REPO = $Repo
  $argumentos = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $deMain "tanda.ps1"), "-Tanda", $Tanda, "-EnSuRama")
  if ($Prueba) { $argumentos += "-Prueba" }
  if ($SinSubir) { $argumentos += "-SinSubir" }
  & powershell.exe @argumentos
  $codigo = $LASTEXITCODE
  Remove-Item Env:\CROQUIS_TANDA_REPO -ErrorAction SilentlyContinue
  } finally {
    # Los procesos del paso cortado pueden tardar unos segundos en soltar los archivos.
    $volvio = [Croquis.Guardia]::Volver(5)
    [Croquis.Guardia]::Quitar()
    try {
      if ($volvio) { Escribir "De vuelta en $ramaActual." }
      else { Escribir "No se pudo volver a la rama $($ramaActual): la carpeta quedó en $ramaDeLaTanda. La siguiente corrida regresa sola." "Yellow" }
    } catch { }
  }
  exit $codigo
}
$Fecha = Get-Date -Format "yyyy-MM-dd"
$Etiqueta = $Tanda
if ($Prueba) { $Etiqueta = "prueba" }
$Rama = "resultados/$Etiqueta-$Fecha"
$Relativa = "resultados/$Etiqueta/$Fecha"
$Salida = Join-Path $Repo $Relativa
New-Item -ItemType Directory -Force $Salida | Out-Null
$Inicio = Get-Date
$Pasos = New-Object System.Collections.ArrayList

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
    instalado_en_esta_corrida = $Instaladas
  }
}

function DatosDeLaCorrida {
  return [ordered]@{
    tanda                    = $Etiqueta
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
# rama en la que está el repositorio no cambian. Devuelve $true si quedó subido (o no había nada).
function Subir([string]$motivo, [string[]]$salidas) {
  EscribirJson (Join-Path $Salida "corrida.json") (DatosDeLaCorrida)
  if ($SinSubir) { return $true }
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
    $indice = Join-Path $env:TEMP "croquis-indice-$Etiqueta-$Fecha"
    $env:GIT_INDEX_FILE = $indice
    try {
      if ((Nativo "git" @("-C", $Repo, "read-tree", $padre)) -ne 0) { throw "No se pudo leer el commit $padre." }
      $rutas = @($Relativa) + @($salidas | Where-Object { $_ -and (Test-Path (Join-Path $Repo $_)) })
      # GitHub rechaza el push entero si un archivo pasa de 100 MB (René, 2026-11-20: el humo de la
      # t5b no subió nada, ni su consola). Los de más de 90 MB se quedan aquí, en la lista
      # no-subidos.txt, y todo lo demás sube.
      $grandes = @()
      foreach ($r in $rutas) {
        $ruta = Join-Path $Repo $r
        if (Test-Path $ruta -PathType Container) {
          $grandes += @(Get-ChildItem -LiteralPath $ruta -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 90MB })
        } elseif ((Get-Item -LiteralPath $ruta).Length -gt 90MB) {
          $grandes += @(Get-Item -LiteralPath $ruta)
        }
      }
      if ($grandes.Count -gt 0) {
        $lista = @($grandes | ForEach-Object { "{0} ({1} MB): no se sube, GitHub no acepta archivos de más de 100 MB" -f $_.FullName.Substring($Repo.Length + 1), [math]::Round($_.Length / 1MB) })
        AgregarAlRegistro (Join-Path $Salida "no-subidos.txt") $lista
      }
      foreach ($r in $rutas) {
        if ((Nativo "git" @("-C", $Repo, "add", "-f", "--", $r)) -ne 0) { throw "No se pudo agregar $r." }
      }
      foreach ($g in $grandes) {
        [void](Nativo "git" @("-C", $Repo, "rm", "--cached", "-q", "--", $g.FullName.Substring($Repo.Length + 1)))
      }
      # Lo privado (AXA, «solo-cesvi» y sus zips) se saca del commit: se queda en esta computadora.
      $privados = @()
      foreach ($r in $rutas) {
        $ruta = Join-Path $Repo $r
        $archivos = @()
        if (Test-Path $ruta -PathType Container) { $archivos = @(Get-ChildItem -LiteralPath $ruta -Recurse -File -ErrorAction SilentlyContinue) }
        elseif (Test-Path $ruta) { $archivos = @(Get-Item -LiteralPath $ruta) }
        $privados += @($archivos | Where-Object {
            $_.FullName.Substring($Repo.Length + 1).Replace("\", "/") -match $PatronPrivado -or $ZipsPrivados.Contains($_.FullName)
          })
      }
      foreach ($x in $privados) {
        [void](Nativo "git" @("-C", $Repo, "rm", "--cached", "-q", "--ignore-unmatch", "--", $x.FullName.Substring($Repo.Length + 1)))
      }
      if ($privados.Count -gt 0) {
        AgregarAlRegistro (Join-Path $Salida "subida.log") @("$(Get-Date -Format 'HH:mm:ss') · $motivo · $($privados.Count) archivo(s) privado(s) (AXA o solo-cesvi): se quedaron en esta computadora, sin subir")
      }
      $arbol = SalidaDe "git" @("-C", $Repo, "write-tree")
      $arbolPadre = SalidaDe "git" @("-C", $Repo, "rev-parse", "$padre^{tree}")
      if ($arbol -eq $arbolPadre) { Escribir "   Nada nuevo que subir ($motivo)."; return $true }
      $commit = SalidaDe "git" (@("-C", $Repo) + $quien + @("commit-tree", $arbol, "-p", $padre, "-m", "results: $Etiqueta $Fecha ($motivo)"))
      if (-not $commit) { throw "No se pudo hacer el commit." }
      # Aquí Git puede abrir el navegador para iniciar sesión en GitHub (Git Credential Manager).
      $previo = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      try { & git -C $Repo push origin "$($commit):refs/heads/$Rama" 2>&1 | Out-Null; $codigo = $LASTEXITCODE } finally { $ErrorActionPreference = $previo }
      if ($codigo -ne 0) { throw "No se pudo subir a GitHub (¿iniciaste sesión cuando se abrió el navegador? ¿tienes permiso de escritura en el repositorio?)." }
    } finally {
      Remove-Item Env:\GIT_INDEX_FILE -ErrorAction SilentlyContinue
      Remove-Item -Force $indice -ErrorAction SilentlyContinue
    }
    Escribir "   Subido a la rama $Rama ($motivo)." "Green"
    return $true
  } catch {
    Escribir "   No se subió ($motivo): $($_.Exception.Message) Queda en $Salida." "Yellow"
    # Por qué no subió, en un archivo que sí viaja con el resumen.
    try { AgregarAlRegistro (Join-Path $Salida "subida.log") @("$(Get-Date -Format 'HH:mm:ss') · $motivo · $($_.Exception.Message)") } catch { }
    return $false
  }
}

# --- Un paso -----------------------------------------------------------------------------------------
# El registro de cada paso existe antes de arrancarlo (con el comando, la carpeta y la hora): si el paso
# no arranca o falla al instante, ahí queda por qué. El comando corre desde un .cmd temporal, con la
# carpeta del repositorio entre comillas, así que funciona en rutas con espacios y en PowerShell 5.1.
# Cada 30 s la ventana dice cuánto lleva y la última línea que escribió. Si pasa de su tope (4 veces
# lo estimado, y al menos 10 minutos) lo detiene. Un paso que necesita datos que no van en git (por
# ejemplo, los reportes crudos de CESVI) se omite y lo dice: se corre en la laptop de René.

$Utf8SinBom = New-Object Text.UTF8Encoding $false
$CarpetaCmd = Join-Path ([IO.Path]::GetTempPath()) "croquis-tanda"

function AgregarAlRegistro([string]$registro, [string[]]$lineas) {
  # Un proceso del paso que todavía no termina de cerrarse (node, Chrome) puede tener el registro
  # abierto («está siendo utilizado en otro proceso», t5 2026-11-20): se reintenta unos segundos y,
  # si sigue ocupado, la nota va a un archivo aparte, sin tirar la tanda.
  $texto = ($lineas -join "`r`n") + "`r`n"
  for ($i = 0; $i -lt 10; $i++) {
    try {
      [IO.File]::AppendAllText($registro, $texto, $Utf8SinBom)
      return
    } catch {
      Start-Sleep -Milliseconds 1000
    }
  }
  try { [IO.File]::AppendAllText("$registro.nota.txt", $texto, $Utf8SinBom) } catch { }
}

# La última línea con texto de un registro que otro proceso sigue escribiendo.
function UltimaLinea([string]$registro) {
  try {
    $f = [IO.File]::Open($registro, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
      $largo = [Math]::Min(8192, $f.Length)
      if ($largo -le 0) { return "" }
      [void]$f.Seek(-$largo, [IO.SeekOrigin]::End)
      $buffer = New-Object byte[] $largo
      [void]$f.Read($buffer, 0, $largo)
    } finally { $f.Dispose() }
    $texto = $Utf8SinBom.GetString($buffer) -replace "`e\[[0-9;]*[A-Za-z]", ""
    $lineas = @($texto -split "[`r`n]+" | Where-Object { $_.Trim() -ne "" })
    if ($lineas.Count -eq 0) { return "" }
    $ultima = $lineas[$lineas.Count - 1].Trim()
    if ($ultima.Length -gt 110) { $ultima = $ultima.Substring(0, 107) + "..." }
    return $ultima
  } catch { return "" }
}

function CorrerPaso([string]$grupo, [int]$numero, [int]$total, $paso) {
  $nombre = [string]$paso.nombre
  $comando = [string]$paso.comando
  $registro = Join-Path $Salida ("{0}-{1:D2}-{2}.log" -f $grupo, $numero, $nombre)
  $estimado = [double]$paso.minutos
  # El tope: el del paso si lo trae (`tope_min`, René 2026-11-19: 15 min y se salta, sin reintentar);
  # si no, 4 veces lo estimado y al menos 10 min.
  $tope = if ($paso.tope_min) { [double]$paso.tope_min } else { [math]::Max(10, 4 * $estimado) }
  Escribir ""
  Escribir "[$grupo $numero/$total] $nombre (unos $estimado min; tope $tope min)" "White"
  [IO.File]::WriteAllText($registro, (@(
        "# Paso: $nombre",
        "# Comando: $comando",
        "# Carpeta: $Repo",
        "# Inicio: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        ""
      ) -join "`r`n") + "`r`n", $Utf8SinBom)
  $t0 = Get-Date
  $estado = "ok"
  $codigo = $null

  # Lo que el paso escribe desde cero (una carpeta de resultados que se reanuda): se vacía antes.
  foreach ($l in @($paso.limpiar)) {
    if (-not $l) { continue }
    $relativa = ([string]$l).Replace("\", "/")
    if (-not $relativa.StartsWith("eval/results/")) { continue }
    $ruta = Join-Path $Repo $relativa
    if (Test-Path -LiteralPath $ruta) {
      Remove-Item -LiteralPath $ruta -Recurse -Force
      AgregarAlRegistro $registro @("# Vacié $relativa para empezar de cero.")
    }
  }

  # Datos que no van en git: sin ellos el paso no se intenta.
  $faltan = @()
  foreach ($r in @($paso.requiere)) {
    if ($r -and -not (Test-Path -LiteralPath (Join-Path $Repo $r))) { $faltan += [string]$r }
  }
  if ($faltan.Count -gt 0) {
    $estado = "omitido: falta $($faltan -join ', ') (no va en git; se corre en la laptop de René)"
    AgregarAlRegistro $registro @("# $estado")
  } else {
    try {
      New-Item -ItemType Directory -Force $CarpetaCmd | Out-Null
      $archivoCmd = Join-Path $CarpetaCmd ("{0}-{1:D2}-{2}.cmd" -f $grupo, $numero, $nombre)
      # chcp primero: el resto del .cmd (rutas con acentos) se lee como UTF-8.
      [IO.File]::WriteAllText($archivoCmd, (@(
            "@echo off",
            "chcp 65001 >nul",
            "cd /d `"$Repo`"",
            "$comando >> `"$registro`" 2>&1",
            "exit /b %ERRORLEVEL%"
          ) -join "`r`n") + "`r`n", $Utf8SinBom)
      $psi = New-Object Diagnostics.ProcessStartInfo
      $psi.FileName = $env:ComSpec
      # /s con comillas dobles alrededor: cmd quita las de afuera y deja la ruta entre comillas.
      $psi.Arguments = "/d /s /c `"`"$archivoCmd`"`""
      $psi.WorkingDirectory = $Repo
      $psi.UseShellExecute = $false
      $proceso = [Diagnostics.Process]::Start($psi)
      while (-not $proceso.WaitForExit(30000)) {
        $lleva = (Get-Date) - $t0
        if ($lleva.TotalMinutes -gt $tope) {
          & taskkill.exe /PID $proceso.Id /T /F 2>$null | Out-Null
          # Primero que se cierre todo el árbol del paso; después se escribe la nota.
          try { [void]$proceso.WaitForExit(15000) } catch { }
          $estado = "detenido por pasar de $tope min"
          AgregarAlRegistro $registro @("", "# $estado")
          break
        }
        $ultima = UltimaLinea $registro
        if ($ultima -and -not $ultima.StartsWith("# ")) {
          Escribir ("   lleva {0} min de unos {1} · {2}" -f (Minutos $lleva), $estimado, $ultima)
        } else {
          Escribir ("   lleva {0} min de unos {1}" -f (Minutos $lleva), $estimado)
        }
      }
      if ($estado -eq "ok") {
        $proceso.WaitForExit()
        $codigo = $proceso.ExitCode
        if ($codigo -ne 0) { $estado = "falló (código $codigo)" }
      }
      Remove-Item -LiteralPath $archivoCmd -Force -ErrorAction SilentlyContinue
    } catch {
      $estado = "no arrancó: $($_.Exception.Message)"
      AgregarAlRegistro $registro @("", "# $estado")
    }
  }
  $duracion = Minutos ((Get-Date) - $t0)
  AgregarAlRegistro $registro @("", "# Fin: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · $estado · $duracion min")
  $color = "Green"
  if ($estado.StartsWith("omitido")) { $color = "Cyan" }
  elseif ($estado -ne "ok") { $color = "Yellow" }
  Escribir "   $estado, en $duracion min. Salida: $Relativa/$(Split-Path $registro -Leaf)" $color
  if ($estado -ne "ok" -and -not $estado.StartsWith("omitido")) {
    # Lo último que dijo el paso, para que la foto de la ventana ya traiga la pista.
    try {
      $cola = @(Get-Content -LiteralPath $registro -Encoding UTF8 -Tail 6 | Where-Object { $_.Trim() -ne "" -and -not $_.StartsWith("# Fin:") })
      foreach ($l in $cola) { Escribir "     | $l" "Yellow" }
    } catch { }
  }
  [void]$Pasos.Add([ordered]@{ grupo = $grupo; paso = $nombre; estado = $estado; minutos = $duracion; codigo = $codigo })
  return $estado
}

# Una carpeta privada de un paso (`privadas`, René 2026-11-21): se comprime en un zip dentro de la
# carpeta de resultados. El zip no se sube (Subir lo saca del commit) y al final se dice dónde quedó.
function GuardarPrivado([string]$ruta) {
  $origen = Join-Path $Repo $ruta
  if (-not (Test-Path $origen)) { return }
  if (-not (Test-Path $Salida)) { New-Item -ItemType Directory -Force $Salida | Out-Null }
  $zip = Join-Path $Salida ((($ruta.Trim("/", "\")) -replace '[\\/]+', '-') + ".zip")
  try {
    Compress-Archive -Path (Join-Path $origen "*") -DestinationPath $zip -Force -ErrorAction Stop
    if (-not $ZipsPrivados.Contains($zip)) { [void]$ZipsPrivados.Add($zip) }
    Escribir "   Lo privado de $ruta quedó en $zip (no se sube)." "Cyan"
  } catch {
    Escribir "   No se pudo comprimir ${ruta}: $($_.Exception.Message). Quedó en $origen (no se sube)." "Yellow"
    if (-not $ZipsPrivados.Contains($origen)) { [void]$ZipsPrivados.Add($origen) }
  }
}

# --- La corrida --------------------------------------------------------------------------------------
$Comprobacion = @($Config.comprobacion.pasos)
$Pesados = @($Definicion.pasos)
if ($Solo) {
  $pedidos = @($Solo -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $Pesados = @($Pesados | Where-Object { $pedidos -contains [string]$_.nombre })
}
if ($Prueba) { $Pesados = @() }
$estimadoTotal = 0
foreach ($p in ($Comprobacion + $Pesados)) { $estimadoTotal += [double]$p.minutos }

Escribir ""
Escribir "Croquis · $($Definicion.titulo) — $Fecha ($(Get-Date -Format 'HH:mm'))" "White"
Escribir "Una sola corrida: la comprobación del mecanismo y, si pasa, lo pesado. Unos $estimadoTotal minutos en total."
Escribir "Resultados en: $Salida"
Escribir "No cierres esta ventana. No pide llaves ni contraseñas; si Git abre el navegador, inicia sesión en GitHub."

$Equipo = DatosDelEquipo
Escribir "Equipo: $($Equipo.tarjetas_de_video -join ' + '); $($Equipo.memoria_gb) GB; $($Equipo.nucleos_logicos) núcleos; $($Equipo.disco_libre_gb) GB libres."
Escribir "Herramientas: $($Equipo.git); Node $($Equipo.node); pnpm $($Equipo.pnpm)."

# 1. La comprobación: si algo falla, lo pesado no corre.
Escribir ""
Escribir "Comprobación del mecanismo" "White"
$n = 0
foreach ($p in $Comprobacion) {
  $n++
  $estado = CorrerPaso "comprobacion" $n $Comprobacion.Count $p
  if ($estado -ne "ok") {
    [void](Subir "comprobacion: $($p.nombre)" @())
    Escribir ""
    Escribir "LA COMPROBACIÓN FALLÓ en «$($p.nombre)»: $estado." "Red"
    Escribir "Lo pesado no se corrió. La salida de ese paso está en:" "Red"
    Escribir "  $Salida" "Red"
    Escribir "Mándale a René una foto de esta ventana." "Red"
    exit 1
  }
}
if (-not (Subir "comprobacion" @())) {
  Escribir ""
  Escribir "LA COMPROBACIÓN FALLÓ en la subida a GitHub." "Red"
  Escribir "Lo pesado no se corrió: sin poder subir, los resultados no le llegarían a René." "Red"
  Escribir "Revisa que hayas iniciado sesión en GitHub cuando se abrió el navegador y que tengas" "Red"
  Escribir "permiso de escritura en el repositorio, y vuelve a hacer doble clic." "Red"
  exit 1
}
Escribir ""
Escribir "La comprobación pasó." "Green"

# 2. Lo pesado.
if ($Pesados.Count -eq 0) {
  if (-not $Prueba) { Escribir "Esta tanda no tiene pasos pesados. $($Definicion.nota)" "White" }
} else {
  Escribir ""
  Escribir "Lo pesado de la tanda ($($Pesados.Count) pasos)" "White"
  $n = 0
  foreach ($p in $Pesados) {
    $n++
    $resultado = [string](@(CorrerPaso "tanda" $n $Pesados.Count $p)[-1])
    foreach ($priv in @($p.privadas)) { if ($priv) { GuardarPrivado ([string]$priv) } }
    [void](Subir ([string]$p.nombre) @($p.salidas))
    # Un paso de humo (`detiene_si_falla`, René 2026-11-20): si no sale, no se gastan las 2 horas.
    if ($p.detiene_si_falla -and $resultado -ne "ok") {
      Escribir ""
      Escribir "El paso «$($p.nombre)» no salió ($resultado): la tanda se detiene aquí y ya subió lo que tenía." "Red"
      break
    }
  }
  [void](Subir "resumen" @())
}

Escribir ""
Escribir "Resumen ($(Minutos ((Get-Date) - $Inicio)) min):" "White"
foreach ($p in $Pasos) {
  $color = "Green"
  if (([string]$p.estado).StartsWith("omitido")) { $color = "Cyan" }
  elseif ($p.estado -ne "ok") { $color = "Yellow" }
  Escribir ("  {0,-13} {1,-26} {2}  ({3} min)" -f $p.grupo, $p.paso, $p.estado, $p.minutos) $color
}
$fallas = @($Pasos | Where-Object { $_.estado -ne "ok" -and -not ([string]$_.estado).StartsWith("omitido") }).Count
$omitidos = @($Pasos | Where-Object { ([string]$_.estado).StartsWith("omitido") }).Count
if ($omitidos -gt 0) { Escribir "$omitidos paso(s) se omitieron porque necesitan datos que no van en git: no es una falla." "Cyan" }
if ($SinSubir) { Escribir "No se subió nada (-SinSubir): los resultados están en $Salida." }
else { Escribir "Los resultados están en la rama $Rama. Avísale a René que ya terminó." "White" }
if ($ZipsPrivados.Count -gt 0) {
  Escribir ""
  Escribir "IMPORTANTE: esto lleva datos de CESVI y NO se subió a GitHub (el repositorio es público):" "Yellow"
  foreach ($z in $ZipsPrivados) { Escribir "  $z" "Yellow" }
  Escribir "Mándaselo a René por WhatsApp o Drive. No lo subas a ningún sitio público." "Yellow"
}
if ($fallas -gt 0) {
  Escribir "$fallas paso(s) no terminaron bien: su salida está en la misma rama." "Yellow"
  exit 1
}
exit 0
