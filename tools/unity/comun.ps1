# Lo que comparten los builds del visor: encuentra el editor y corre Unity en modo batch.
$ErrorActionPreference = "Stop"

$script:Raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$script:Proyecto = Join-Path $script:Raiz "apps\visor-unity"

function Get-EditorUnity {
    if ($env:UNITY_EDITOR) { return $env:UNITY_EDITOR }
    $linea = Select-String -Path (Join-Path $script:Proyecto "ProjectSettings\ProjectVersion.txt") -Pattern "^m_EditorVersion: (.+)$"
    $version = $linea.Matches[0].Groups[1].Value
    foreach ($base in @("D:\Unity\Editor", "C:\Program Files\Unity\Hub\Editor")) {
        $exe = Join-Path $base "$version\Editor\Unity.exe"
        if (Test-Path $exe) { return $exe }
    }
    throw "No encontré Unity $version. Instálalo con Unity Hub o define UNITY_EDITOR."
}

function Invoke-Unity {
    param([string]$Objetivo, [string]$Metodo, [string]$Log)
    $editor = Get-EditorUnity
    New-Item -ItemType Directory -Force (Split-Path $Log) | Out-Null
    $inicio = Get-Date
    $p = Start-Process -FilePath $editor -Wait -PassThru -NoNewWindow -ArgumentList @(
        "-batchmode", "-quit", "-nographics",
        "-projectPath", "`"$script:Proyecto`"",
        "-buildTarget", $Objetivo,
        "-executeMethod", $Metodo,
        "-logFile", "`"$Log`""
    )
    $min = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1)
    if ($p.ExitCode -ne 0) {
        Get-Content $Log -Tail 40
        throw "Unity terminó con código $($p.ExitCode) en $min min. Bitácora: $Log"
    }
    Write-Output "Listo en $min min. Bitácora: $Log"
}
