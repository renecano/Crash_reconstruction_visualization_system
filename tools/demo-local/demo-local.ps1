<#
  Croquis en esta computadora, sin Vercel ni Vercel Blob: el respaldo de la demo (René, 2026-11-17).
  Lo abre CORRER-DEMO-LOCAL.bat; instrucciones en LEEME-DEMO-LOCAL.md.

    1. Herramientas: Node y pnpm (si falta alguno, lo dice y se detiene).
    2. Dependencias (pnpm install). Necesita internet la primera vez; después ya no.
    3. El visor de Unity y los modelos de los vehículos, servidos desde esta máquina
       (tools/unity/visor-local.mjs preparar: de la copia en .cache o del release de GitHub, nunca de
       Blob).
    4. Compila la app en modo local (CROQUIS_VISOR=local). Solo si cambió algo desde la última vez:
       el día de la demo arranca sin compilar ni pedir red.
    5. La llave de Claude, solo del .env.local de esta computadora. Nunca se pide en pantalla ni se
       escribe en otro archivo. Si no está, lo dice y sigue: todo funciona salvo la lectura con IA.
    6. La sirve en http://localhost:3000 y abre el navegador. Ctrl+C la cierra.

  Opciones (para el paquete de la RTX y para probar; René no necesita ninguna):
    -SoloPreparar          pasos 1 a 4, sin servir
    -Despues comprobar     sirve, corre la prueba sin internet (e2e/demo-local.spec.ts) y apaga
    -Despues fps-web       sirve, mide los fps del visor en el navegador (tools/unity/medir-web.ps1)
                           contra el sitio local y apaga
    -Despues arranque-3d   sirve, mide el arranque del 3D de Unity en el Chrome instalado
                           (e2e/medir-unity-arranque.spec.ts) contra el sitio local y apaga
    -Despues narraciones   sirve, corre las seis narraciones y el caso encimado (t5) en Chrome y apaga
    -Despues tollocan      sirve, corre el caso de Tollocan de René de punta a punta (t5) en Chrome y apaga
    -Despues tres          sirve, corre las tres narraciones de René (t9) con su 3D en Chrome y apaga
    -Despues nuevas        sirve, corre la muestra de 10 narraciones de la revisión de la cadena (t9) y apaga
    -Despues humo          sirve, lleva AXA y Tollocan de La escena nueva al 3D de Unity (humo de la tanda) y apaga
    -Despues ejemplos      sirve, corre los cinco ejemplos con el 3D (t5) en Chrome y apaga; con -Casos,
                           guarda ahí el .croquis de cada uno (t6)
    -Despues recorrido     sirve, toma las fotos del recorrido de la app (t6: juegos «publico» y
                           «solo-cesvi», 2560×1440, Unity en calidad alta) en -Salida y apaga
    -Despues video-3d      sirve, graba «Descargar video» del 3D de AXA con el Unity real en Chrome y
                           en Edge (e2e/video-3d-real.spec.ts; los MP4 al Escritorio) y apaga
    -Despues final         sirve, la tanda final con el Unity real: ¿Y si…? en 3D, daños, entorno,
                           satélite y Presentar, solo ejemplos públicos (e2e/final-unity.spec.ts) y apaga
    -Despues ensayo        sirve, corre el ensayo automático de la demo (e2e/ensayo-automatico.spec.ts:
                           AXA de punta a punta y los ejemplos hasta su cifra) en Chrome y apaga; las
                           capturas llevan AXA y se quedan fuera del repo; con -Salida copia ahí ensayo.json
    -Gpu integrada         con -Despues video-3d: Chrome y Edge en la tarjeta integrada (el arreglo de
                           «Descargar video» en tarjeta integrada, #364); al final, como estaban
    -Salida RUTA           a dónde escribe su resultado la comprobación o la medición
    -Capturas RUTA         dónde van las capturas de los ejemplos (por omisión, las de la t5)
    -Casos RUTA            dónde van los .croquis de los ejemplos
#>
param(
  [switch]$SoloPreparar,
  [ValidateSet("", "comprobar", "fps-web", "arranque-3d", "video-3d", "narraciones", "tollocan", "tres", "nuevas", "ejemplos", "humo", "recorrido", "final", "ensayo")][string]$Despues = "",
  [ValidateSet("", "integrada")][string]$Gpu = "",
  [string]$Salida = "",
  [string]$Capturas = "",
  [string]$Casos = "",
  # Con -Despues recorrido: solo las pruebas cuyo nombre lo lleva («publico», «SOLO-CESVI»).
  [string]$Filtro = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Web = Join-Path $Repo "apps\web"
# Una ruta de salida relativa es desde la raíz del repo (la prueba corre en apps/web; René, 2026-11-17).
if ($Salida -and -not [System.IO.Path]::IsPathRooted($Salida)) { $Salida = Join-Path $Repo $Salida }
$Puerto = 3000
$Url = "http://localhost:$Puerto"
Set-Location $Repo

function Escribir([string]$texto, [string]$color = "Gray") { Write-Host $texto -ForegroundColor $color }
function Paso([string]$texto) { Escribir ""; Escribir "== $texto" "White" }
function Fallar([string]$texto) { Escribir ""; Escribir $texto "Red"; exit 1 }

function HayInternet {
  try {
    $r = Invoke-WebRequest "https://github.com" -Method Head -TimeoutSec 5 -UseBasicParsing
    return $r.StatusCode -lt 500
  } catch { return $false }
}

function ApagarPuerto {
  $conexiones = @(Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue)
  foreach ($c in $conexiones) {
    try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch { }
  }
}

# --- 1. Herramientas -----------------------------------------------------------------------------
Paso "1. Herramientas"
foreach ($h in @("node", "pnpm")) {
  if (-not (Get-Command $h -ErrorAction SilentlyContinue)) {
    Fallar "Falta $h. Instálalo una vez con internet (Node LTS de https://nodejs.org y luego: corepack enable) y vuelve a correr esto."
  }
}
Escribir "Node $(node --version) y pnpm $(pnpm --version)."
$red = HayInternet
Escribir $(if ($red) { "Hay internet." } else { "Sin internet: se usa lo que ya está en esta computadora." }) $(if ($red) { "Gray" } else { "Yellow" })

# --- 2. Dependencias -------------------------------------------------------------------------------
Paso "2. Dependencias"
if (Test-Path (Join-Path $Repo "node_modules\.pnpm")) {
  if ($red) { & pnpm install --frozen-lockfile; if ($LASTEXITCODE) { Fallar "pnpm install falló." } }
  else { Escribir "Ya están instaladas (sin internet no se revisan)." }
} else {
  if (-not $red) { Fallar "Faltan las dependencias y no hay internet. Corre esto una vez con internet (el día anterior)." }
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE) { Fallar "pnpm install falló." }
}

# --- 3. El visor de Unity y los modelos, desde esta máquina ------------------------------------------
Paso "3. El visor de Unity, desde esta computadora"
& node (Join-Path $Repo "tools\unity\visor-local.mjs") preparar
if ($LASTEXITCODE) { Fallar "No se pudo preparar el visor. Con internet, vuelve a intentarlo: baja la copia del release de GitHub." }

# --- 4. Compilar en modo local (solo si cambió algo) -------------------------------------------------
Paso "4. La app en modo local"
$marca = Join-Path $Web ".next\croquis-visor-local"
$commit = (& git -C $Repo rev-parse HEAD).Trim()
# Compilada para esta versión y en modo local: el build trae la reescritura al manifiesto local (si
# después alguien compiló en modo normal, la marca puede seguir ahí, pero la reescritura no).
$rutas = Join-Path (Join-Path $Web ".next") "routes-manifest.json"
$modoLocal = (Test-Path $rutas) -and ((Get-Content $rutas -Raw) -match "visor-unity/local/manifest\.json")
$compilada = $modoLocal -and (Test-Path $marca) -and ((Get-Content $marca -Raw).Trim() -eq $commit) -and (Test-Path (Join-Path $Web ".next\BUILD_ID"))
if ($compilada) {
  Escribir "Ya está compilada para esta versión ($($commit.Substring(0, 8)))."
} else {
  if (-not $red) { Fallar "Hay que compilar y no hay internet (la compilación baja las tipografías). Corre esto una vez con internet." }
  Escribir "Compilando (unos minutos)..."
  $env:CROQUIS_VISOR = "local"
  & pnpm --filter "@croquis/web" build
  $codigo = $LASTEXITCODE
  if ($codigo) {
    # Next.js se detiene la primera vez para recomendar una actualización de seguridad y sigue al
    # volver a correr el mismo comando (pendiente: subir Next.js, docs/PROGRESS.md).
    Escribir "Segundo intento de la compilación (Next.js se detiene una vez con un aviso de seguridad)..." "Yellow"
    & pnpm --filter "@croquis/web" build
    $codigo = $LASTEXITCODE
  }
  Remove-Item Env:\CROQUIS_VISOR -ErrorAction SilentlyContinue
  if ($codigo) { Fallar "La compilación falló." }
  Set-Content -Path $marca -Value $commit -Encoding ASCII
}
if ($SoloPreparar) { Escribir ""; Escribir "Listo: la demo local está preparada." "Green"; exit 0 }

# --- 5. La llave de Claude, solo de .env.local --------------------------------------------------------
Paso "5. La lectura con IA"
$llave = $null
foreach ($archivo in @((Join-Path $Repo ".env.local"), (Join-Path $Web ".env.local"))) {
  if (-not (Test-Path $archivo)) { continue }
  foreach ($linea in Get-Content $archivo -Encoding UTF8) {
    if ($linea -match '^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\s]+)"?\s*$') { $llave = $Matches[1] }
  }
}
if ($llave) {
  # Solo en el entorno del servidor de esta ventana: no se imprime ni se escribe en ningún archivo.
  $env:ANTHROPIC_API_KEY = $llave
  $llave = $null
  Escribir "Lista: la llave está en el .env.local de esta computadora. La lectura con IA necesita internet."
} else {
  Escribir "No hay llave de Claude en .env.local: la lectura con IA no estará. Todo lo demás funciona (AXA, los casos de ejemplo con su lectura guardada, la reconstrucción, el 3D y el dictamen)." "Yellow"
}

# --- 6. Servir ---------------------------------------------------------------------------------------
Paso "6. Croquis en $Url"
Escribir "Necesitan internet: la lectura con IA de una narración nueva, los mosaicos del mapa (sin red, el mapa sale en blanco pero se puede colocar la escena) y buscar un lugar por nombre." "Yellow"
Escribir "Sin internet funcionan completos: el caso de AXA y los cinco casos de ejemplo, la reconstrucción, el 3D de Unity y el dictamen."
ApagarPuerto

if (-not $Despues) {
  Start-Job -ScriptBlock { param($u) Start-Sleep -Seconds 8; Start-Process "$u/cesvi" } -ArgumentList $Url | Out-Null
  Escribir ""
  Escribir "Abriendo el navegador en unos segundos. Para cerrar Croquis: Ctrl+C en esta ventana." "Green"
  & pnpm --filter "@croquis/web" exec next start -p $Puerto
  exit $LASTEXITCODE
}

# Para la RTX: el sitio de fondo, la comprobación o la medición, y se apaga.
$registro = Join-Path $env:TEMP "croquis-demo-local-servidor.log"
$servidor = Start-Process -FilePath "cmd.exe" -ArgumentList "/c pnpm --filter @croquis/web exec next start -p $Puerto > `"$registro`" 2>&1" -WindowStyle Hidden -PassThru
try {
  $listo = $false
  for ($i = 0; $i -lt 60; $i++) {
    try { if ((Invoke-WebRequest "$Url/visor-unity/manifest.json" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) { $listo = $true; break } } catch { }
    Start-Sleep -Seconds 2
  }
  if (-not $listo) { Fallar "El servidor local no respondió en 2 minutos (registro: $registro)." }
  # René, 2026-11-26: qué tarjeta usa Chrome de verdad (el nombre de WebGL no basta en una laptop
  # híbrida). Mide el uso 3D por tarjeta mientras corre la prueba y lo deja en <salida>.gpu.json.
  $gpuSalida = $null; $gpuDetener = $null; $gpuTrabajo = $null
  if ($Despues) {
    $gpuSalida = if ($Salida) { "$Salida.gpu.json" } else { Join-Path $Repo "eval\results\gpu-$Despues.json" }
    $gpuDetener = Join-Path $env:TEMP "croquis-gpu-detener-$PID"
    Remove-Item $gpuDetener -ErrorAction SilentlyContinue
    $gpuTrabajo = Start-Job -ScriptBlock {
      param($script, $salida, $detener)
      & powershell -NoProfile -ExecutionPolicy Bypass -File $script -Salida $salida -Detener $detener
    } -ArgumentList (Join-Path $Repo "tools\demo-local\gpu-uso.ps1"), $gpuSalida, $gpuDetener
  }
  # t4c (René, 2026-11-18): las pruebas, en el Chrome instalado (el navegador de la demo y el de
  # fps-web); en la RTX, el Chromium de Playwright no compiló el WebAssembly de Unity.
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($Despues -eq "comprobar") {
    & pnpm --filter "@croquis/web" exec playwright install chromium
    if ($Salida) { $env:CROQUIS_SALIDA = $Salida }
    if ($chrome) { $env:CROQUIS_CANAL = "chrome"; Escribir "La comprobación, en Chrome ($chrome)." }
    else { Escribir "No encontré Google Chrome: la comprobación va en el Chromium de Playwright." "Yellow" }
    & pnpm --filter "@croquis/web" exec playwright test e2e/demo-local.spec.ts --project=chromium --headed
    $codigo = $LASTEXITCODE
  } elseif ($Despues -eq "arranque-3d") {
    if (-not $chrome) { Fallar "No encontré Google Chrome: la medición del arranque se hace en Chrome, como fps-web." }
    # Chrome con la tarjeta de alto rendimiento mientras mide (como fps-web); al final, como estaba.
    $llaveGpu = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
    if (-not (Test-Path $llaveGpu)) { New-Item -Path $llaveGpu -Force | Out-Null }
    $gpuAntes = (Get-ItemProperty -Path $llaveGpu -Name $chrome -ErrorAction SilentlyContinue).$chrome
    Set-ItemProperty -Path $llaveGpu -Name $chrome -Value "GpuPreference=2;"
    try {
      $env:CROQUIS_URL = $Url
      $env:CROQUIS_CHROME = $chrome
      if ($Salida) { $env:CROQUIS_ARRANQUE_SALIDA = $Salida }
      & pnpm --filter "@croquis/web" exec playwright test -c playwright.produccion.config.ts e2e/medir-unity-arranque.spec.ts
      $codigo = $LASTEXITCODE
    } finally {
      if ($null -eq $gpuAntes) { Remove-ItemProperty -Path $llaveGpu -Name $chrome -ErrorAction SilentlyContinue }
      else { Set-ItemProperty -Path $llaveGpu -Name $chrome -Value $gpuAntes }
    }
  } elseif ($Despues -in @("narraciones", "tollocan", "tres", "nuevas", "ejemplos", "humo", "recorrido", "final", "ensayo")) {
    # t5-verificacion (René, 2026-11-19), en el Chrome instalado contra la demo local:
    #   narraciones  las seis narraciones nuevas y el caso encimado, con capturas del 3D;
    #   tollocan     el caso de René de punta a punta;
    #   tres         las tres narraciones que René probó en producción (2026-11-24), con su 3D;
    #   ejemplos     los cinco ejemplos (el «después»; el «antes» es el de producción).
    if (-not $chrome) { Fallar "No encontré Google Chrome: la tanda t5 corre en Chrome." }
    # Chrome con la tarjeta de alto rendimiento (René, 2026-11-20: la t5 corrió en la integrada),
    # como en arranque-3d; al final, como estaba.
    $llaveGpu = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
    if (-not (Test-Path $llaveGpu)) { New-Item -Path $llaveGpu -Force | Out-Null }
    $gpuAntes = (Get-ItemProperty -Path $llaveGpu -Name $chrome -ErrorAction SilentlyContinue).$chrome
    Set-ItemProperty -Path $llaveGpu -Name $chrome -Value "GpuPreference=2;"
    try {
      $env:CROQUIS_URL = $Url
      $env:CROQUIS_CANAL = "chrome"
      if ($Salida) { $env:CROQUIS_SALIDA = $Salida }
      if ($Despues -eq "humo") {
        & pnpm --filter "@croquis/web" exec playwright test -c playwright.produccion.config.ts e2e/humo-3d.spec.ts
      } elseif ($Despues -eq "recorrido") {
        # t6 (René, 2026-11-21): las fotos del recorrido, 2560×1440 con deviceScaleFactor 2.
        if ($Salida) { $env:CROQUIS_RECORRIDO = $Salida }
        $grep = if ($Filtro) { @("--grep", $Filtro) } else { @() }
        & pnpm --filter "@croquis/web" exec playwright test -c playwright.recorrido.config.ts @grep
      } elseif ($Despues -eq "final") {
        # La tanda final (René, 2026-11-26): ¿Y si…? en 3D, daños, entorno, satélite y Presentar con el
        # Unity real, solo con ejemplos públicos.
        if ($Salida) { $env:CROQUIS_SALIDA = $Salida }
        if ($Capturas) { $env:CROQUIS_CAPTURAS = $Capturas }
        & pnpm --filter "@croquis/web" exec playwright test -c playwright.produccion.config.ts e2e/final-unity.spec.ts
      } elseif ($Despues -eq "ensayo") {
        # El ensayo de Alberto (#366, René 2026-11-26): las capturas llevan AXA y se quedan en esta
        # computadora, fuera del repo; al repo solo va ensayo.json (cifras y tiempos).
        $carpetaEnsayo = Join-Path $env:LOCALAPPDATA ("croquis-demo-local\ensayo-" + (Get-Date -Format "yyyyMMdd-HHmm"))
        $env:CROQUIS_ENSAYO = $carpetaEnsayo
        & pnpm --filter "@croquis/web" exec playwright test -c playwright.produccion.config.ts e2e/ensayo-automatico.spec.ts --headed
        $codigoEnsayo = $LASTEXITCODE
        $json = Join-Path $carpetaEnsayo "ensayo.json"
        if ($Salida -and (Test-Path $json)) {
          New-Item -ItemType Directory -Force (Split-Path $Salida) | Out-Null
          Copy-Item $json $Salida -Force
        }
        Escribir "Ensayo (capturas con AXA, fuera del repo): $carpetaEnsayo" "Cyan"
        $global:LASTEXITCODE = $codigoEnsayo
      } elseif ($Despues -eq "ejemplos") {
        $env:CROQUIS_UNITY = "1"
        $env:CROQUIS_CAPTURAS = if ($Capturas) { $Capturas } else { "docs/cesvi/ronda-4/evidencia/t5-ejemplos" }
        if ($Casos) { $env:CROQUIS_CASOS = $Casos }
        & pnpm --filter "@croquis/web" exec playwright test -c playwright.produccion.config.ts e2e/ejemplos-ronda2.spec.ts
      } else {
        $filtro = if ($Despues -eq "tollocan") { "Tollocan" } elseif ($Despues -eq "tres") { "tres narraciones de René" } elseif ($Despues -eq "nuevas") { "narraciones nuevas" } else { "narración|encimado" }
        & pnpm --filter "@croquis/web" exec playwright test -c playwright.produccion.config.ts e2e/narraciones-fisica.spec.ts -g $filtro
      }
      $codigo = $LASTEXITCODE
    } finally {
      if ($null -eq $gpuAntes) { Remove-ItemProperty -Path $llaveGpu -Name $chrome -ErrorAction SilentlyContinue }
      else { Set-ItemProperty -Path $llaveGpu -Name $chrome -Value $gpuAntes }
    }
  } elseif ($Despues -eq "video-3d") {
    # B7 (René, 2026-11-18): el video del 3D con el Unity real, en los navegadores instalados.
    if ($Salida) { $env:CROQUIS_SALIDA = $Salida }
    $codigo = 0
    # -Gpu integrada (#364): los dos navegadores en la tarjeta integrada; al final, como estaban.
    $llaveGpu = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
    $preferencias = @{}
    if ($Gpu -eq "integrada") {
      if (-not (Test-Path $llaveGpu)) { New-Item -Path $llaveGpu -Force | Out-Null }
      $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
      foreach ($exe in @($chrome, $edge) | Where-Object { $_ }) {
        $preferencias[$exe] = (Get-ItemProperty -Path $llaveGpu -Name $exe -ErrorAction SilentlyContinue).$exe
        Set-ItemProperty -Path $llaveGpu -Name $exe -Value "GpuPreference=1;"
      }
      Escribir "Video del 3D con Chrome y Edge en la tarjeta integrada." "Cyan"
    }
    try {
      foreach ($canal in @("chrome", "msedge")) {
        Escribir "Video del 3D en $canal..."
        $env:CROQUIS_CANAL = $canal
        & pnpm --filter "@croquis/web" exec playwright test e2e/video-3d-real.spec.ts --project=chromium --headed
        if ($LASTEXITCODE) { $codigo = $LASTEXITCODE; Escribir "El video en $canal falló (código $LASTEXITCODE)." "Yellow" }
      }
    } finally {
      foreach ($exe in $preferencias.Keys) {
        if ($null -eq $preferencias[$exe]) { Remove-ItemProperty -Path $llaveGpu -Name $exe -ErrorAction SilentlyContinue }
        else { Set-ItemProperty -Path $llaveGpu -Name $exe -Value $preferencias[$exe] }
      }
    }
  } else {
    $trabajo = Join-Path $env:LOCALAPPDATA "croquis-demo-local\fps-web"
    New-Item -ItemType Directory -Force $trabajo | Out-Null
    Copy-Item (Join-Path $Repo "tools\unity\medir-web.ps1") $trabajo -Force
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $trabajo "medir-web.ps1") -Sitio $Url -Niveles "baja,media,alta,ultra"
    $codigo = $LASTEXITCODE
    if ($Salida -and (Test-Path (Join-Path $trabajo "e6_unity_web_demo.json"))) {
      New-Item -ItemType Directory -Force (Split-Path $Salida) | Out-Null
      Copy-Item (Join-Path $trabajo "e6_unity_web_demo.json") $Salida -Force
    }
  }
} finally {
  if ($gpuTrabajo) {
    New-Item -ItemType File -Force $gpuDetener | Out-Null
    Wait-Job $gpuTrabajo -Timeout 30 | Out-Null
    Remove-Job $gpuTrabajo -Force -ErrorAction SilentlyContinue
    Remove-Item $gpuDetener -ErrorAction SilentlyContinue
    if ($gpuSalida -and (Test-Path $gpuSalida)) { Escribir "Tarjeta que usó Chrome: $gpuSalida" "Cyan" }
  }
  ApagarPuerto
  if (-not $servidor.HasExited) { try { Stop-Process -Id $servidor.Id -Force } catch { } }
}
exit $codigo
