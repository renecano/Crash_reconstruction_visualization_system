# Qué tarjeta de video usa Chrome de verdad mientras corre una prueba (René, 2026-11-26).
#
# El nombre que reporta WebGL (UNMASKED_RENDERER_WEBGL) no basta: en una laptop híbrida Chrome puede
# reportar la NVIDIA y dibujar en la Intel. Aquí se mide con los contadores de Windows del motor 3D
# de cada proceso de Chrome y Edge (`\GPU Engine(*engtype_3D)\Utilization Percentage`). Cada
# contador lleva el LUID del adaptador, y el registro de DirectX dice qué tarjeta es cada LUID.
#
#   powershell -File tools/demo-local/gpu-uso.ps1 -Salida eval/results/t11/gpu-ejemplos.json -Detener <archivo>
#
# Muestrea cada 2 s hasta que aparece el archivo -Detener (o pasan -Segundos) y escribe, por tarjeta,
# el uso 3D promedio y máximo de los procesos del navegador, y cuál dibujó.
param(
  [Parameter(Mandatory = $true)][string]$Salida,
  [string]$Detener = "",
  [int]$Segundos = 7200
)
$ErrorActionPreference = "SilentlyContinue"

# LUID → nombre de la tarjeta, del registro de DirectX.
$nombres = @{}
foreach ($k in Get-ChildItem "HKLM:\SOFTWARE\Microsoft\DirectX" -ErrorAction SilentlyContinue) {
  $p = Get-ItemProperty $k.PSPath
  if ($null -ne $p.AdapterLuid -and $p.Description) {
    $luid = [UInt64]$p.AdapterLuid
    $alto = [UInt32]($luid -shr 32)
    $bajo = [UInt32]($luid -band 0xFFFFFFFF)
    $nombres[("0x{0:X8}_0x{1:X8}" -f $alto, $bajo).ToLower()] = $p.Description
  }
}

$suma = @{}; $max = @{}; $muestras = 0
$fin = (Get-Date).AddSeconds($Segundos)
while ((Get-Date) -lt $fin -and -not ($Detener -and (Test-Path $Detener))) {
  $pids = @(Get-Process chrome, msedge -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $c = Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -ErrorAction SilentlyContinue
  if ($c -and $pids.Count) {
    $porLuid = @{}
    foreach ($s in $c.CounterSamples) {
      if ($s.InstanceName -match 'pid_(\d+)_luid_(0x[0-9a-f]+_0x[0-9a-f]+)_') {
        if ($pids -contains [int]$Matches[1]) {
          $l = $Matches[2].ToLower()
          $porLuid[$l] = ($porLuid[$l] + $s.CookedValue)
        }
      }
    }
    foreach ($l in $porLuid.Keys) {
      $suma[$l] = $suma[$l] + $porLuid[$l]
      if ($porLuid[$l] -gt $max[$l]) { $max[$l] = $porLuid[$l] }
    }
    $muestras++
  }
  Start-Sleep -Seconds 2
}

$tarjetas = @(foreach ($l in $suma.Keys) {
    [ordered]@{
      tarjeta       = $(if ($nombres[$l]) { $nombres[$l] } else { "desconocida ($l)" })
      luid          = $l
      uso_3d_medio  = [math]::Round($suma[$l] / [math]::Max(1, $muestras), 1)
      uso_3d_maximo = [math]::Round($max[$l], 1)
    }
  })
$tarjetas = @($tarjetas | Sort-Object { - $_.uso_3d_medio })
$out = [ordered]@{
  descripcion = "Uso del motor 3D de la GPU por los procesos de Chrome y Edge, por tarjeta (contadores de Windows). La que más usa es la que dibujó."
  fecha       = (Get-Date).ToString("s")
  muestras    = $muestras
  dibujo_en   = $(if ($tarjetas.Count -and $tarjetas[0].uso_3d_maximo -gt 0) { $tarjetas[0].tarjeta } else { $null })
  tarjetas    = [object[]]$tarjetas
  todas       = @($nombres.Values | Sort-Object -Unique)
}
New-Item -ItemType Directory -Force (Split-Path -Parent $Salida) | Out-Null
$out | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $Salida
