# La medición de la carga del 3D en producción, primera y segunda visita (eval/u6_carga_cadena.mjs),
# como una tarea de Windows, fuera de la sesión de Claude Code (U6). Es reanudable: lo medido queda
# en eval/results/u6_carga_estado.json y al relanzarla sigue con lo que falta.
#
#   powershell -ExecutionPolicy Bypass -File tools/unity/carga-cadena.ps1 -Lanzar    # empieza o reanuda
#   powershell -ExecutionPolicy Bypass -File tools/unity/carga-cadena.ps1 -Estado    # cómo va
#   powershell -ExecutionPolicy Bypass -File tools/unity/carga-cadena.ps1 -Detener   # la para (no borra lo medido)
#
# Mientras corre, la laptop no se suspende ni apaga la pantalla (una ventana tapada mide menos); al
# terminar, o si el proceso muere, Windows vuelve solo a su configuración. Cerrar la tapa sí la
# suspende: hay que dejarla abierta y conectada a la corriente.
param(
    [switch] $Lanzar,
    [switch] $Estado,
    [switch] $Detener,
    # Lo que ejecuta la tarea; no se llama a mano.
    [switch] $Correr
)
$ErrorActionPreference = "Stop"
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$registros = Join-Path $raiz "apps\visor-unity\Logs"
$registro = Join-Path $registros "carga-cadena.log"
$entorno = Join-Path $registros "carga-entorno.txt"
$candado = Join-Path $registros "carga-cadena.pid"
$tarea = "CroquisCarga"
New-Item -ItemType Directory -Force $registros | Out-Null

function Get-PidDeLaCadena {
    if (-not (Test-Path $candado)) { return $null }
    $id = [int](Get-Content $candado -Raw)
    if (Get-Process -Id $id -ErrorAction SilentlyContinue) { return $id }
    return $null
}

if ($Correr) {
    # El PATH con que se lanzó (node, git, pnpm): una tarea de Windows no hereda el de la terminal.
    if (Test-Path $entorno) { $env:PATH = (Get-Content $entorno -Raw).Trim() + ";" + $env:PATH }
    # Sin suspensión ni pantalla apagada mientras viva este proceso (ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    # | ES_DISPLAY_REQUIRED). Windows lo deshace solo cuando el proceso termina, aunque lo maten.
    $firma = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
    $energia = Add-Type -MemberDefinition $firma -Name Despierta -Namespace Croquis -PassThru
    [void]$energia::SetThreadExecutionState([uint32]"0x80000003")
    Set-Location $raiz
    "[{0}] Tarea iniciada (PID {1})." -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $PID | Add-Content -Encoding utf8 $registro
    try {
        # El registro lo escribe cmd, en UTF-8 tal como lo emite node.
        cmd /c "node eval\u6_carga_cadena.mjs >> `"$registro`" 2>&1"
        $codigo = $LASTEXITCODE
    } finally {
        [void]$energia::SetThreadExecutionState([uint32]"0x80000000")
    }
    "[{0}] Tarea terminada con código {1}." -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $codigo | Add-Content -Encoding utf8 $registro
    # Con todo medido, la tarea ya no hace falta: se quita sola. Si falta algo, se queda para relanzarla.
    if ($codigo -eq 0) { Unregister-ScheduledTask -TaskName $tarea -Confirm:$false -ErrorAction SilentlyContinue }
    exit $codigo
}

if ($Lanzar) {
    if (Get-PidDeLaCadena) { Write-Host "La cadena ya está corriendo (PID $(Get-PidDeLaCadena))."; exit 0 }
    Set-Content -Encoding utf8 $entorno $env:PATH
    $accion = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $raiz `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Correr"
    # Sin límite de tiempo, y sin detenerse si alguien desconecta la corriente un momento.
    $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    # Interactiva: en la sesión del usuario, con su escritorio (el navegador de la medición es visible).
    $quien = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
        -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $tarea -Action $accion -Settings $ajustes -Principal $quien -Force | Out-Null
    Start-ScheduledTask -TaskName $tarea
    Write-Host "Lanzada como la tarea de Windows «$tarea». Registro: $registro"
    Write-Host "Para ver cómo va: powershell -ExecutionPolicy Bypass -File tools/unity/carga-cadena.ps1 -Estado"
    exit 0
}

if ($Detener) {
    Stop-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue
    $id = Get-PidDeLaCadena
    if ($id) {
        # La cadena y lo que haya lanzado (el navegador o el build de Unity).
        taskkill /PID $id /T /F | Out-Null
    }
    Get-Process Unity -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "Detenida. Lo medido sigue en eval/results/u6_carga_estado.json; -Lanzar la reanuda."
    exit 0
}

# -Estado (o sin argumentos): qué hay medido y las últimas líneas del registro.
$viva = Get-PidDeLaCadena
$info = Get-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue
Write-Host ("Cadena: " + $(if ($viva) { "corriendo (PID $viva)" } else { "detenida" }) + $(if ($info) { " · tarea «$tarea»: $($info.State)" } else { " · sin tarea registrada" }))
Push-Location $raiz
try { node eval/u6_carga_cadena.mjs --estado } finally { Pop-Location }
if (Test-Path $registro) {
    Write-Host "--- Últimas líneas de $registro"
    Get-Content $registro -Tail 12 -Encoding utf8
}
