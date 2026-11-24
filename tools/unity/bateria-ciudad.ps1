<#
  La batería de ciudad del visor 3D en Unity (René, 2026-11-20): cada paquete de
  packages/scene-schema/fixtures/caso3d-ciudad/ entra por el puente, como en el navegador, hasta
  «cargado». PlayMode en el Editor, en modo batch, sin navegador ni Next, sin red.

    powershell -File tools/unity/bateria-ciudad.ps1 -Etiqueta rama
    powershell -File tools/unity/bateria-ciudad.ps1 -Etiqueta produccion-130 -Paquetes D:\ruta\a\otros

  Deja eval/results/unity_bateria_ciudad/<etiqueta>.jsonl (una fila por caso, con la pila de cada
  excepción), el XML de las pruebas y la bitácora de Unity. Antes revisa que no haya Unity vivo.
#>
param(
  [string]$Etiqueta = "rama",
  [string]$Paquetes = "",
  [string]$Filtro = "Croquis.TestsCiudad"
)
. (Join-Path $PSScriptRoot "comun.ps1")

$vivos = @(Get-Process -Name "Unity", "Unity Hub" -ErrorAction SilentlyContinue)
if ($vivos.Count -gt 0) { throw "Hay un Unity vivo ($($vivos.Count)): ciérralo antes de la batería." }

$salidaDir = Join-Path $script:Raiz "eval\results\unity_bateria_ciudad"
New-Item -ItemType Directory -Force $salidaDir | Out-Null
$filas = Join-Path $salidaDir "$Etiqueta.jsonl"
Remove-Item -Force $filas -ErrorAction SilentlyContinue
$env:CROQUIS_BATERIA_SALIDA = $filas
if ($Paquetes) { $env:CROQUIS_BATERIA_DIR = (Resolve-Path $Paquetes).Path } else { Remove-Item Env:\CROQUIS_BATERIA_DIR -ErrorAction SilentlyContinue }

$log = Join-Path $salidaDir "$Etiqueta.unity.log"
$xml = Join-Path $salidaDir "$Etiqueta.xml"
$editor = Get-EditorUnity
$inicio = Get-Date
$p = Start-Process -FilePath $editor -Wait -PassThru -NoNewWindow -ArgumentList @(
  "-batchmode",
  "-projectPath", "`"$script:Proyecto`"",
  "-runTests", "-testPlatform", "PlayMode",
  "-assemblyNames", $Filtro,
  "-testResults", "`"$xml`"",
  "-logFile", "`"$log`""
)
$min = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1)
$vivos = @(Get-Process -Name "Unity" -ErrorAction SilentlyContinue)
Write-Output "Unity terminó con código $($p.ExitCode) en $min min (2 = alguna prueba falló). Unity vivo después: $($vivos.Count)."
if (Test-Path $filas) {
  foreach ($l in Get-Content $filas -Encoding UTF8) {
    $f = $l | ConvertFrom-Json
    $r = if ($f.respuesta) { $f.respuesta.tipo } else { "sin respuesta" }
    Write-Output ("{0,-20} {1,-8} {2,7} ms  errores: {3}" -f $f.caso, $r, $f.ms, @($f.errores).Count)
  }
} else {
  Write-Output "No hubo filas: revisa $log"
}
