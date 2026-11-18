# Croquis sin Vercel: la demo local

El respaldo de la demo. Croquis corre en tu computadora, en `http://localhost:3000`. El 3D de Unity y los modelos de los vehículos salen de la propia máquina: no se usa Vercel ni Vercel Blob.

Funciona en Windows (`CORRER-DEMO-LOCAL.bat`) y en Mac con Apple Silicon, M1 o más nueva (`CORRER-DEMO-LOCAL.command`).

## Los 3 pasos en Windows

1. **El día anterior, con internet:** doble clic en `CORRER-DEMO-LOCAL.bat`.
   - Instala lo que falte, baja una vez el visor de Unity (del release de GitHub, no de Blob) y compila la app (unos minutos).
   - Cuando se abra el navegador con Croquis, ciérralo y cierra la ventana negra.
2. **El día de la demo:** doble clic en `CORRER-DEMO-LOCAL.bat`.
   - Como ya está compilado, arranca en segundos, aunque no haya internet.
   - Se abre el navegador en `http://localhost:3000/cesvi`.
3. **Al terminar:** `Ctrl+C` en la ventana negra, o ciérrala.

## Los 3 pasos en Mac (Apple Silicon)

Antes, una sola vez: Node LTS (de https://nodejs.org, el instalador para macOS, o con Homebrew: `brew install node@22`) y Google Chrome. Si falta Node, el script lo dice y se detiene; pnpm lo activa solo.

1. **El día anterior, con internet:** doble clic en `CORRER-DEMO-LOCAL.command` en Finder.
   - La primera vez, si la carpeta se bajó como .zip, macOS puede decir que no puede abrirlo porque es de un desarrollador no identificado. Haz **clic derecho → Abrir → Abrir**. En macOS 15 o más nuevo: **Ajustes del Sistema → Privacidad y seguridad → «Abrir de todos modos»**. Si se clonó con Git, no aparece el aviso.
   - Si Finder dice que no tiene permiso para abrirlo, en la Terminal, dentro de la carpeta: `chmod +x CORRER-DEMO-LOCAL.command` (o ábrelo con `bash CORRER-DEMO-LOCAL.command`).
   - Instala lo que falte, baja una vez el visor de Unity (del release de GitHub, no de Blob) y compila la app (unos minutos). Cuando se abra Chrome con Croquis, ciérralo y cierra la ventana de la Terminal.
2. **El día de la demo:** doble clic en `CORRER-DEMO-LOCAL.command`. Arranca en segundos, aunque no haya internet, y abre **Chrome** en `http://localhost:3000/cesvi`. Usa Chrome: el 3D de Unity está probado ahí.
3. **Al terminar:** `Ctrl+C` en la ventana de la Terminal, o ciérrala.

## Qué necesita internet y qué no

| Funciona sin internet                                                           | Necesita internet                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| El caso de AXA, ya cargado, con su reconstrucción, el análisis y Contra CESVI   | La lectura con IA de una narración nueva                                               |
| Los cinco casos de ejemplo, con su lectura guardada                             | Los mosaicos del mapa: sin red, el mapa sale en blanco, pero la escena se coloca igual |
| La reconstrucción, el 3D de Unity con los vehículos y el dictamen en PDF y Word | Buscar un lugar por su nombre                                                          |

## La llave de Claude

La toma solo del archivo `.env.local` de esta computadora (la línea `ANTHROPIC_API_KEY=...`). Nunca la pide en pantalla ni la escribe en otro archivo. Si no está, lo dice y sigue: todo funciona menos la lectura con IA.

## Si algo falla

- **«Faltan las dependencias y no hay internet»** o **«Hay que compilar y no hay internet»:** falta el paso 1. Conéctate a internet y vuelve a correrlo.
- **El puerto 3000 está ocupado:** el script cierra lo que lo esté usando antes de arrancar (en los dos sistemas).
- **Comprobarlo sin internet:** con la app corriendo en otra ventana, `pnpm --filter @croquis/web exec playwright test e2e/demo-local.spec.ts --headed`. Corta la red en el navegador y recorre AXA con su 3D y su dictamen, y un caso de ejemplo. El resultado queda en `eval/results/demo_local.json`.

Detalle técnico: ADR 0120.
