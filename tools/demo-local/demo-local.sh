#!/bin/bash
# Croquis en esta Mac, sin Vercel ni Vercel Blob: el respaldo de la demo (René, 2026-11-17).
# Lo abre CORRER-DEMO-LOCAL.command (doble clic en Finder); instrucciones en LEEME-DEMO-LOCAL.md.
# Es la versión para macOS (Apple Silicon) de tools/demo-local/demo-local.ps1: hace lo mismo.
#
#   1. Herramientas: Node y pnpm. Si falta Node, dice cómo instalarlo (con Homebrew o del sitio de
#      Node) y se detiene. Si falta pnpm, lo activa con corepack.
#   2. Dependencias (pnpm install). Necesita internet la primera vez; después ya no.
#   3. El visor de Unity y los modelos, servidos desde esta máquina (tools/unity/visor-local.mjs
#      preparar: de la copia en .cache o del release de GitHub, nunca de Blob).
#   4. Compila la app en modo local (CROQUIS_VISOR=local), solo si cambió algo.
#   5. La llave de Claude, solo del .env.local de esta computadora. Nunca se pide en pantalla ni se
#      escribe en otro archivo. Si no está, lo dice y sigue: todo funciona salvo la lectura con IA.
#   6. La sirve en http://localhost:3000 y abre Chrome en /cesvi. Ctrl+C la cierra.
#
# Opciones (para el CI y para probar; René no necesita ninguna):
#   --solo-preparar   pasos 1 a 4, sin servir
#   --humo            sirve de fondo, comprueba con curl que el sitio da el manifiesto local, el visor y
#                     los modelos desde la máquina, y lo apaga (lo usa el CI en una Mac)
set -u

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
WEB="$RAIZ/apps/web"
PUERTO=3000
URL="http://localhost:$PUERTO"
SOLO_PREPARAR=0
HUMO=0
for a in "$@"; do
  case "$a" in
    --solo-preparar) SOLO_PREPARAR=1 ;;
    --humo) HUMO=1 ;;
    *) echo "Opción desconocida: $a" >&2; exit 2 ;;
  esac
done
cd "$RAIZ" || exit 1

amarillo() { printf '\033[33m%s\033[0m\n' "$1"; }
verde() { printf '\033[32m%s\033[0m\n' "$1"; }
paso() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fallar() { printf '\n\033[31m%s\033[0m\n' "$1"; exit 1; }

hay_internet() { curl -sSfI --max-time 5 https://github.com >/dev/null 2>&1; }

apagar_puerto() {
  local pids
  pids=$(lsof -nP -iTCP:"$PUERTO" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

# --- 1. Herramientas -----------------------------------------------------------------------------
paso "1. Herramientas"
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    fallar "Falta Node. Instálalo una vez con internet, en la Terminal: brew install node@22 && brew link --overwrite node@22 . Después vuelve a abrir este archivo."
  fi
  fallar "Falta Node (y Homebrew). Instala Node LTS una vez con internet desde https://nodejs.org (el instalador para macOS, Apple Silicon) y vuelve a abrir este archivo. Si prefieres Homebrew: https://brew.sh y luego brew install node@22."
fi
if ! command -v pnpm >/dev/null 2>&1; then
  amarillo "Falta pnpm: se activa con corepack (viene con Node)."
  corepack enable >/dev/null 2>&1 || npm install -g pnpm >/dev/null 2>&1 || fallar "No se pudo instalar pnpm. En la Terminal: npm install -g pnpm"
  command -v pnpm >/dev/null 2>&1 || fallar "pnpm sigue sin aparecer. Cierra y vuelve a abrir este archivo."
fi
echo "Node $(node --version) y pnpm $(pnpm --version)."
if hay_internet; then RED=1; echo "Hay internet."; else RED=0; amarillo "Sin internet: se usa lo que ya está en esta computadora."; fi

# --- 2. Dependencias -------------------------------------------------------------------------------
paso "2. Dependencias"
if [ -d "$RAIZ/node_modules/.pnpm" ]; then
  if [ "$RED" = 1 ]; then pnpm install --frozen-lockfile || fallar "pnpm install falló."
  else echo "Ya están instaladas (sin internet no se revisan)."; fi
else
  [ "$RED" = 1 ] || fallar "Faltan las dependencias y no hay internet. Abre este archivo una vez con internet (el día anterior)."
  pnpm install --frozen-lockfile || fallar "pnpm install falló."
fi

# --- 3. El visor de Unity y los modelos, desde esta máquina ------------------------------------------
paso "3. El visor de Unity, desde esta computadora"
node "$RAIZ/tools/unity/visor-local.mjs" preparar || fallar "No se pudo preparar el visor. Con internet, vuelve a intentarlo: baja la copia del release de GitHub."

# --- 4. Compilar en modo local (solo si cambió algo) -------------------------------------------------
paso "4. La app en modo local"
MARCA="$WEB/.next/croquis-visor-local"
COMMIT=$(git -C "$RAIZ" rev-parse HEAD 2>/dev/null || echo "sin-git")
COMPILADA=0
# Compilada para esta versión y en modo local: el build trae la reescritura al manifiesto local.
if [ -f "$WEB/.next/BUILD_ID" ] && [ -f "$MARCA" ] && [ "$(cat "$MARCA")" = "$COMMIT" ] \
  && grep -q "visor-unity/local/manifest\.json" "$WEB/.next/routes-manifest.json" 2>/dev/null; then
  COMPILADA=1
fi
if [ "$COMPILADA" = 1 ]; then
  echo "Ya está compilada para esta versión (${COMMIT:0:8})."
else
  [ "$RED" = 1 ] || fallar "Hay que compilar y no hay internet (la compilación baja las tipografías). Abre este archivo una vez con internet."
  echo "Compilando (unos minutos)..."
  if ! CROQUIS_VISOR=local pnpm --filter "@croquis/web" build; then
    # Next.js se detiene la primera vez para recomendar una actualización de seguridad y sigue al
    # volver a correr el mismo comando.
    amarillo "Segundo intento de la compilación (Next.js se detiene una vez con un aviso de seguridad)..."
    CROQUIS_VISOR=local pnpm --filter "@croquis/web" build || fallar "La compilación falló."
  fi
  printf '%s\n' "$COMMIT" > "$MARCA"
fi
if [ "$SOLO_PREPARAR" = 1 ]; then echo; verde "Listo: la demo local está preparada."; exit 0; fi

# --- 5. La llave de Claude, solo de .env.local --------------------------------------------------------
paso "5. La lectura con IA"
LLAVE=""
for f in "$RAIZ/.env.local" "$WEB/.env.local"; do
  [ -f "$f" ] || continue
  linea=$(grep -E '^[[:space:]]*ANTHROPIC_API_KEY[[:space:]]*=' "$f" | tail -n 1 || true)
  if [ -n "$linea" ]; then
    valor=${linea#*=}
    valor=$(printf '%s' "$valor" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')
    [ -n "$valor" ] && LLAVE=$valor
  fi
done
if [ -n "$LLAVE" ]; then
  # Solo en el entorno del servidor de esta ventana: no se imprime ni se escribe en ningún archivo.
  export ANTHROPIC_API_KEY="$LLAVE"
  LLAVE=""
  echo "Lista: la llave está en el .env.local de esta computadora. La lectura con IA necesita internet."
else
  amarillo "No hay llave de Claude en .env.local: la lectura con IA no estará. Todo lo demás funciona (AXA, los casos de ejemplo con su lectura guardada, la reconstrucción, el 3D y el dictamen)."
fi

# --- 6. Servir ---------------------------------------------------------------------------------------
paso "6. Croquis en $URL"
amarillo "Necesitan internet: la lectura con IA de una narración nueva, los mosaicos del mapa (sin red, el mapa sale en blanco pero se puede colocar la escena) y buscar un lugar por nombre."
echo "Sin internet funcionan completos: el caso de AXA y los cinco casos de ejemplo, la reconstrucción, el 3D de Unity y el dictamen."
apagar_puerto

if [ "$HUMO" = 1 ]; then
  # Para el CI: el sitio de fondo, unas comprobaciones con curl, y se apaga.
  REGISTRO="${TMPDIR:-/tmp}/croquis-demo-local-servidor.log"
  pnpm --filter "@croquis/web" exec next start -p "$PUERTO" >"$REGISTRO" 2>&1 &
  SERVIDOR=$!
  trap 'kill "$SERVIDOR" 2>/dev/null; apagar_puerto' EXIT
  for _ in $(seq 1 60); do
    curl -sf "$URL/visor-unity/manifest.json" >/dev/null 2>&1 && break
    sleep 2
  done
  MANIFIESTO=$(curl -sf "$URL/visor-unity/manifest.json") || fallar "El servidor local no respondió (registro: $REGISTRO)."
  printf '%s' "$MANIFIESTO" | grep -q '"base": "/"' || fallar "El manifiesto no es el local: el visor saldría de Blob."
  printf '%s' "$MANIFIESTO" | grep -q '"modelos": "/modelos/vehiculos/"' || fallar "El manifiesto no trae los modelos locales."
  PREFIJO=$(printf '%s' "$MANIFIESTO" | sed -n 's/.*"prefijo": "\([^"]*\)".*/\1/p')
  CODIGO=$(printf '%s' "$MANIFIESTO" | sed -n 's/.*"code": "\([^"]*\)".*/\1/p')
  curl -sf -o /dev/null "$URL/${PREFIJO}Build/$CODIGO" || fallar "El sitio no sirve el visor de Unity desde la máquina."
  curl -sf -o /dev/null "$URL/modelos/vehiculos/vehiculos.json" || fallar "El sitio no sirve los modelos de los vehículos."
  curl -sf -o /dev/null "$URL/cesvi/casos/a2010930" || fallar "No abre el caso de AXA."
  verde "Humo: el sitio local sirve el manifiesto local, el visor de Unity, los modelos y el caso de AXA."
  exit 0
fi

# Abre Chrome cuando el sitio ya responde (si no está, el navegador de siempre).
(
  for _ in $(seq 1 60); do
    curl -sf "$URL/visor-unity/manifest.json" >/dev/null 2>&1 && break
    sleep 1
  done
  open -a "Google Chrome" "$URL/cesvi" 2>/dev/null || open "$URL/cesvi"
) &
echo
verde "Abriendo Chrome en unos segundos. Para cerrar Croquis: Ctrl+C en esta ventana."
exec pnpm --filter "@croquis/web" exec next start -p "$PUERTO"
