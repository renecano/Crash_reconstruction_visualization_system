# Corre un comando largo (un build de Unity, por ejemplo) como una tarea de Windows, fuera de la
# sesión de Claude Code: si a la sesión le falta memoria y corta sus procesos, la tarea sigue. Mientras
# corre, la laptop no se suspende; al terminar, Windows vuelve solo a su configuración.
#
#   powershell -ExecutionPolicy Bypass -File tools/unity/en-tarea.ps1 -Nombre build-web -Comando "powershell -NoProfile -ExecutionPolicy Bypass -File tools\unity\build-web.ps1"
#   powershell -ExecutionPolicy Bypass -File tools/unity/en-tarea.ps1 -Nombre build-web -Estado
#
# El registro queda en apps/visor-unity/Logs/tarea-<Nombre>.log; la última línea dice el código de
# salida. Las variables CROQUIS_* de la terminal pasan a la tarea.
param(
    [Parameter(Mandatory = $true)] [string] $Nombre,
    [string] $Comando,
    [switch] $Estado,
    # Lo que ejecuta la tarea; no se llama a mano.
    [switch] $Correr
)
$ErrorActionPreference = "Stop"
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$registros = Join-Path $raiz "apps\visor-unity\Logs"
$registro = Join-Path $registros "tarea-$Nombre.log"
$entorno = Join-Path $registros "tarea-$Nombre.entorno.txt"
$tarea = "Croquis-$Nombre"
New-Item -ItemType Directory -Force $registros | Out-Null

if ($Correr) {
    # El PATH y las variables CROQUIS_* con que se lanzó: una tarea no hereda los de la terminal.
    foreach ($l in Get-Content $entorno) {
        $i = $l.IndexOf("=")
        if ($i -gt 0) { [Environment]::SetEnvironmentVariable($l.Substring(0, $i), $l.Substring($i + 1), "Process") }
    }
    $firma = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
    $energia = Add-Type -MemberDefinition $firma -Name DespiertaTarea -Namespace Croquis -PassThru
    [void]$energia::SetThreadExecutionState([uint32]"0x80000001")
    Set-Location $raiz
    "[{0}] Inicia: {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Comando | Add-Content -Encoding utf8 $registro
    try {
        cmd /c "$Comando >> `"$registro`" 2>&1"
        $codigo = $LASTEXITCODE
    } finally {
        [void]$energia::SetThreadExecutionState([uint32]"0x80000000")
    }
    "[{0}] Terminó con código {1}." -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $codigo | Add-Content -Encoding utf8 $registro
    Unregister-ScheduledTask -TaskName $tarea -Confirm:$false -ErrorAction SilentlyContinue
    exit $codigo
}

if ($Estado) {
    $info = Get-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue
    Write-Host ("Tarea «$tarea»: " + $(if ($info) { $info.State } else { "no registrada (terminó o no se lanzó)" }))
    if (Test-Path $registro) { Get-Content $registro -Tail 5 }
    exit 0
}

if (-not $Comando) { throw "Falta -Comando." }
if (Get-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue) { throw "La tarea «$tarea» ya existe." }
$lineas = @("PATH=$env:PATH") + (Get-ChildItem Env: | Where-Object Name -like "CROQUIS_*" | ForEach-Object { "$($_.Name)=$($_.Value)" })
Set-Content -Encoding utf8 $entorno $lineas
Remove-Item $registro -ErrorAction SilentlyContinue
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Nombre $Nombre -Correr -Comando `"$($Comando.Replace('"', '\"'))`""
$accion = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $raiz -Argument $arg
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$quien = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $tarea -Action $accion -Settings $ajustes -Principal $quien -Force | Out-Null
Start-ScheduledTask -TaskName $tarea
Write-Host "Lanzada como la tarea de Windows «$tarea». Registro: $registro"
