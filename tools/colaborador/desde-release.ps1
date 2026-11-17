# Croquis, tanda t4 (René, 2026-11-16): baja del release `rtx-t4` el paquete de escritorio o el de
# fotos, lo corre y deja su resultado chico en eval/results/rtx-t4 (lo que sube la tanda). El build y
# las fotos no van a git: las fotos quedan en un zip en el Escritorio para mandárselo a René.
#
#   powershell -ExecutionPolicy Bypass -File tools\colaborador\desde-release.ps1 -Paso escritorio
#   powershell -ExecutionPolicy Bypass -File tools\colaborador\desde-release.ps1 -Paso fotos
#   powershell -ExecutionPolicy Bypass -File tools\colaborador\desde-release.ps1 -Paso trailer
#   powershell -ExecutionPolicy Bypass -File tools\colaborador\desde-release.ps1 -Paso video
#
# «trailer» usa el mismo paquete de fotos, con el plan de tomas de tools\trailer\tomas-rtx.mjs.
#
# Tanda t4b (René, 2026-11-17): el paquete de fotos es `fotos-promo-t4b.zip` (build nuevo con la placa
# de las etiquetas, el relieve sobre la vía en curva y las cámaras corregidas). `-Solo` rehace solo
# esas fotos. Las tomas van por grupos cortos, una instancia del visor por grupo (6 del tráiler, 50
# cuadros del video): con muchas tomas a 4K en la misma instancia, el visor se iba frenando hasta
# trabarse. En la laptop de René (GPU integrada), la escena de noche con lluvia bajó de 6.2 a 0.2 fps
# hacia la octava toma; con una instancia nueva por grupo no llega a eso. Cada grupo anota en el
# registro sus fps. Si se corta, la siguiente corrida sigue desde la última toma terminada.
param(
  [Parameter(Mandatory = $true)][ValidateSet("escritorio", "fotos", "trailer", "video")][string] $Paso,
  [switch] $Corto,
  [int] $Ancho = 3840,
  [int] $Alto = 2160,
  [string] $Solo = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$base = "https://github.com/renecano/Crash_reconstruction_visualization_system/releases/download/rtx-t4"
$archivo = if ($Paso -eq "escritorio") { "visor-escritorio-t4.zip" } else { "fotos-promo-t4b.zip" }
$raiz = Join-Path $env:LOCALAPPDATA "croquis-rtx-t4"
# Las tomas del tráiler usan el mismo visor del paquete de fotos (el de t4b, en su propia carpeta).
$carpeta = if ($Paso -eq "escritorio") { "escritorio" } else { "fotos-t4b" }
# Para probar en otra máquina con un paquete ya descomprimido (la laptop de René): CROQUIS_PAQUETE_FOTOS.
if ($Paso -ne "escritorio" -and $env:CROQUIS_PAQUETE_FOTOS) { $raiz = Split-Path $env:CROQUIS_PAQUETE_FOTOS; $carpeta = Split-Path $env:CROQUIS_PAQUETE_FOTOS -Leaf }
$trabajo = Join-Path $raiz $carpeta
New-Item -ItemType Directory -Force $trabajo | Out-Null
$zip = Join-Path $raiz $archivo
if (-not (Test-Path (Join-Path $trabajo "VisorCroquis.exe")) -and -not (Test-Path $zip)) {
  Write-Host "Bajando $archivo del release rtx-t4..."
  Invoke-WebRequest "$base/$archivo" -OutFile "$zip.parcial" -UseBasicParsing
  Move-Item "$zip.parcial" $zip -Force
}
if (-not (Test-Path (Join-Path $trabajo "VisorCroquis.exe"))) {
  Write-Host "Descomprimiendo $archivo..."
  Expand-Archive $zip -DestinationPath $trabajo -Force
}
$destino = Join-Path $repo "eval\results\rtx-t4"
New-Item -ItemType Directory -Force $destino | Out-Null

# Toma un plan del modo foto por grupos, una instancia del visor por grupo, y retoma: lo que ya tiene
# su archivo no se vuelve a tomar. Devuelve las tomas que faltan (vacío si están todas) y deja el
# informe en -Informe.
function Tomar {
  param([string] $Plan, [string] $Salida, [string] $Extension, [int] $Grupo, [int] $TopeGrupoMin, [string] $Que, [string] $Informe)
  New-Item -ItemType Directory -Force $Salida | Out-Null
  $todas = @((Get-Content $Plan -Raw -Encoding UTF8 | ConvertFrom-Json).tomas | ForEach-Object { $_.id })
  $hecha = { param($id) Test-Path (Join-Path $Salida "$id.$Extension") }
  $faltan = @($todas | Where-Object { -not (& $hecha $_) })
  Write-Host "Tomando $($Que): $($faltan.Count) de $($todas.Count) por hacer, de $Grupo en $Grupo (no uses la computadora mientras tanto)..."
  $hechas = New-Object System.Collections.ArrayList
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  for ($i = 0; $i -lt $faltan.Count; $i += $Grupo) {
    $ids = @($faltan[$i..([math]::Min($i + $Grupo, $faltan.Count) - 1)])
    $informeGrupo = Join-Path $Salida "fotos.json"
    if (Test-Path $informeGrupo) { Remove-Item $informeGrupo -Force }
    $argumentos = @(
      "-screen-width", "1920", "-screen-height", "1080", "-screen-fullscreen", "0",
      "-fotos", $Plan, "-salida", $Salida, "-solo", ($ids -join ","),
      "-ancho", "$Ancho", "-alto", "$Alto", "-calidad", "ultra",
      "-logFile", (Join-Path $trabajo "tomas.log")
    )
    $inicioGrupo = $reloj.Elapsed.TotalSeconds
    $p = Start-Process -FilePath (Join-Path $trabajo "VisorCroquis.exe") -ArgumentList $argumentos -PassThru
    if (-not $p.WaitForExit($TopeGrupoMin * 60 * 1000)) {
      try { $p.Kill() } catch { }
      Write-Host "  El grupo $($ids[0])…$($ids[-1]) pasó de $TopeGrupoMin min: lo detengo y sigo con el siguiente." -ForegroundColor Yellow
    }
    if (Test-Path $informeGrupo) {
      foreach ($t in (Get-Content $informeGrupo -Raw -Encoding UTF8 | ConvertFrom-Json).tomas) { [void]$hechas.Add($t) }
    }
    $listas = @($todas | Where-Object { & $hecha $_ }).Count
    # Los fps del visor en este grupo (el visor los escribe cada segundo): si se traba, se ve aquí.
    $fps = @()
    $registro = Join-Path $trabajo "tomas.log"
    if (Test-Path $registro) {
      $fps = @(Select-String -Path $registro -Pattern '"p50":([0-9.]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -Last 4)
    }
    Write-Host ("  {0} de {1} listas ({2:N0} s este grupo; fps del visor al final: {3})" -f $listas, $todas.Count, ($reloj.Elapsed.TotalSeconds - $inicioGrupo), ($fps -join ", "))
  }
  $faltantes = @($todas | Where-Object { -not (& $hecha $_) })
  [ordered]@{
    tomas = $todas.Count
    hechas_en_esta_corrida = $hechas.Count
    faltan = $faltantes
    grupo = $Grupo
    resolucion = "$($Ancho)x$($Alto)"
    segundos = [math]::Round($reloj.Elapsed.TotalSeconds, 1)
    por_toma = $hechas
  } | ConvertTo-Json -Depth 5 | Set-Content -Path $Informe -Encoding UTF8
  return ,$faltantes
}

# Sin Vercel Blob (René, 2026-11-17): el visor pide los modelos de los vehículos a esta máquina. Se
# cambia la dirección en su resources.assets (mismo largo; tools/unity/visor-local.mjs escritorio) y
# se sirven los modelos del repositorio mientras corre el paso.
& node (Join-Path $repo "tools\unity\visor-local.mjs") escritorio (Join-Path $trabajo "VisorCroquis_Data")
if ($LASTEXITCODE) { throw "No se pudo cambiar la dirección de los modelos del visor de escritorio." }
$modelos = Start-Process -FilePath "node" -ArgumentList "`"$(Join-Path $repo 'tools\unity\visor-local.mjs')`" servir-modelos" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
try {

if ($Paso -eq "escritorio") {
  # Los cuatro niveles, en las escenas de referencia del paquete; tres repeticiones (el protocolo E6).
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $trabajo "medir-escritorio.ps1") -Niveles "baja,media,alta,ultra"
  if ($LASTEXITCODE) { throw "medir-escritorio terminó con el código $LASTEXITCODE" }
  Copy-Item (Join-Path $trabajo "e6_unity_escritorio.json") (Join-Path $destino "fps_escritorio.json") -Force
  Write-Host "Listo: eval\results\rtx-t4\fps_escritorio.json"
} elseif ($Paso -eq "trailer") {
  # Las tomas del 3D para el tráiler (René, 2026-11-16): secuencias a 3840x2160 en ultra de la
  # escena inventada de noche con lluvia. Quedan en trailer-salida\tomas del repositorio (que git
  # ignora completa) y en un zip en el Escritorio para mandárselo a René: no van a git.
  $plan = Join-Path $trabajo "tomas-trailer.json"
  & node (Join-Path $repo "tools\trailer\tomas-rtx.mjs") $plan
  if ($LASTEXITCODE) { throw "tomas-rtx.mjs terminó con el código $LASTEXITCODE" }
  $salida = Join-Path $repo "trailer-salida\tomas"
  New-Item -ItemType Directory -Force $salida | Out-Null
  $faltantes = Tomar -Plan $plan -Salida $salida -Extension "png" -Grupo 6 -TopeGrupoMin 10 -Que "tomas del tráiler" -Informe (Join-Path $destino "tomas_trailer.json")
  $informe = Join-Path $salida "fotos.json"
  Copy-Item (Join-Path $destino "tomas_trailer.json") $informe -Force
  if ($faltantes.Count) { throw "Faltan $($faltantes.Count) tomas ($($faltantes[0])…). Vuelve a correr la tanda: sigue desde la última terminada." }
  $escritorio = [Environment]::GetFolderPath("Desktop")
  $entrega = Join-Path $escritorio "croquis-tomas-trailer.zip"
  if (Test-Path $entrega) { Remove-Item $entrega -Force }
  Compress-Archive -Path (Join-Path $salida "*_*.png"), $informe -DestinationPath $entrega
  Write-Host ""
  Write-Host "Las tomas del tráiler quedaron en $entrega. Mándale ese archivo a René (por Drive o WeTransfer): no va a git."
} elseif ($Paso -eq "video") {
  # El video de Unity (René, 2026-11-17): AXA, el lateral en intersección y, para la versión pública,
  # el alcance inventado; cada caso con cuatro cámaras, cuadro por cuadro a 60 fps en ultra, montado
  # con ffmpeg (el de Remotion). Los cuadros van en la carpeta de trabajo, no en el repositorio; los
  # videos, en un zip en el Escritorio. Retoma: si se corta, sigue desde el último cuadro hecho.
  $planes = @("tools\unity\video-unity.mjs", $trabajo, "--ancho", "$Ancho", "--alto", "$Alto")
  if ($Corto) { $planes += "--corto" }
  & node (Join-Path $repo $planes[0]) $planes[1..($planes.Count - 1)]
  if ($LASTEXITCODE) { throw "video-unity.mjs terminó con el código $LASTEXITCODE" }
  $montaje = Get-Content (Join-Path $trabajo "video-montaje.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $cuadros = Join-Path $raiz "video-cuadros-$($Ancho)x$($Alto)"
  $faltan = 0
  foreach ($c in $montaje.casos) {
    $f = Tomar -Plan (Join-Path $trabajo $c.plan) -Salida $cuadros -Extension "jpg" -Grupo 50 -TopeGrupoMin 15 -Que "el video de $($c.nombre)" -Informe (Join-Path $trabajo "video-$($c.nombre)-informe.json")
    $faltan += $f.Count
  }
  if ($faltan) { throw "Faltan $faltan cuadros del video. Vuelve a correr la tanda: sigue desde el último terminado." }
  $videos = Join-Path $raiz "video-salida"
  if (Test-Path $videos) { Remove-Item -Recurse -Force $videos }
  Write-Host "Montando los videos (H.264, sin música)..."
  & node (Join-Path $repo "tools\unity\video-unity-montar.mjs") --paquete $trabajo --cuadros $cuadros --salida $videos
  if ($LASTEXITCODE) { throw "video-unity-montar.mjs terminó con el código $LASTEXITCODE" }
  Copy-Item (Join-Path $videos "video_unity.json") (Join-Path $destino "video_unity.json") -Force
  $escritorio = [Environment]::GetFolderPath("Desktop")
  $entrega = Join-Path $escritorio "croquis-video-unity.zip"
  if (Test-Path $entrega) { Remove-Item $entrega -Force }
  Compress-Archive -Path (Join-Path $videos "*.mp4"), (Join-Path $videos "LEEME.txt") -DestinationPath $entrega
  # Los cuadros pesan varios GB: se borran cuando los videos ya están en el zip.
  Remove-Item -Recurse -Force $cuadros
  Write-Host ""
  Write-Host "Los videos quedaron en $entrega. Mándale ese archivo a René (por Drive o WeTransfer): no va a git."
} else {
  if ($Solo) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $trabajo "generar-fotos.ps1") -Solo $Solo
  } else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $trabajo "generar-fotos.ps1")
  }
  if ($LASTEXITCODE) { throw "generar-fotos terminó con el código $LASTEXITCODE" }
  $fotos = Join-Path $trabajo "fotos"
  Copy-Item (Join-Path $fotos "fotos.json") (Join-Path $destino "fotos.json") -Force
  $escritorio = [Environment]::GetFolderPath("Desktop")
  $entrega = Join-Path $escritorio "croquis-fotos-promo-t4b.zip"
  if (Test-Path $entrega) { Remove-Item $entrega -Force }
  Compress-Archive -Path (Join-Path $fotos "*") -DestinationPath $entrega
  Write-Host ""
  Write-Host "Las fotos quedaron en $entrega. Mándale ese archivo a René (por Drive o WeTransfer): no va a git."
}
} finally {
  # Los modelos dejan de servirse al terminar el paso, salga bien o mal.
  if ($modelos -and -not $modelos.HasExited) { try { Stop-Process -Id $modelos.Id -Force } catch { } }
}
