# Bitácora de Croquis

Este archivo permite que cualquier sesión retome el trabajo sin contexto previo.
Reglas de trabajo: `CLAUDE.md`. Especificación: `PLAN.md`.

## Estado actual

- **Fase actual:** F0 — Fundaciones (en curso).
- **Siguiente paso concreto:** terminar la ingesta de INEGI ATUS (localizar los archivos de datos abiertos de 2024 y 2025, descargar, calcular cifras con script y escribir `data/SOURCES.md`), correr todo en verde localmente, primer push y CI verde.
- **Rama:** `main` todavía sin commits; el primer commit será el esqueleto de F0.

### Bloqueado — necesita a René

| Qué                                                                                                                                                                                                                             | Para qué                                                                                  | Estado         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------- |
| `ANTHROPIC_API_KEY`                                                                                                                                                                                                             | F6 (extracción con Claude) y E1. CI usa respuestas grabadas, así que no bloquea hasta F6. | Pendiente      |
| Credenciales AWS (cuenta/rol para CDK) y proyecto Vercel                                                                                                                                                                        | F11 despliegue dev/prod. Mientras tanto todo corre local.                                 | Pendiente      |
| Licencia académica BeamNG.tech                                                                                                                                                                                                  | F10 y E5                                                                                  | Pendiente      |
| Confirmar licencia MIT del código y el nombre _Croquis_                                                                                                                                                                         | Se usan los valores por defecto de PLAN §16 (ADR 0002)                                    | Usando default |
| Pruebas con ≥ 5 personas reales (E9)                                                                                                                                                                                            | F11                                                                                       | Pendiente      |
| Confirmar que el repositorio remoto correcto es `renecano/Crash_reconstruction_visualization_system` (público, creado el 2026-10-10 y vacío). Se eligió por nombre y fecha; se puede cambiar con `git remote set-url origin …`. | Push y CI                                                                                 | Asumido        |

## Entorno de desarrollo (verificado 2026-10-10)

| Recurso           | Valor                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| SO                | Windows 11 Home 10.0.26200                                                                                                                        |
| CPU / RAM         | Intel i5-10210U (8 hilos) / 7.83 GB; al inicio de la sesión solo 1.4 GB libres (Claude Code, Docker Desktop/WSL y VS Code consumen ~2.3 GB)       |
| GPU               | Intel UHD Graphics integrada (1 GB) → la laptop de referencia para E6                                                                             |
| Disco             | C: 8.9 GB libres (casi lleno); D: 209 GB libres. El repo vive en D:.                                                                              |
| Node / pnpm       | v24.12.0 / 12.11.2                                                                                                                                |
| Python / uv       | 3.14.0 (C:\Python314) / 0.13.0                                                                                                                    |
| git / gh          | 2.47.1 / 2.102.0 (sesión iniciada como `renecano`)                                                                                                |
| Docker            | 29.1.3 (corriendo; consume ~850 MB con WSL)                                                                                                       |
| No instalados aún | Blender (winget `BlenderFoundation.Blender` 5.2.2), FFmpeg (`Gyan.FFmpeg` 9.0.2), AWS CLI. Se instalarán en la fase que los necesite (F3/F9/F11). |

Recomendación para René: cerrar Docker Desktop mientras se trabaja en Croquis libera ~850 MB de RAM.

### Cambios hechos a la máquina en F0

- `npm install -g pnpm@latest` → pnpm 12.11.2.
- `uv self update` → uv 0.13.0.
- Cachés movidos a D: para no llenar C: — `pnpm config set store-dir D:\dev-cache\pnpm-store --global`, `npm config set cache D:\dev-cache\npm-cache`, variables de usuario `UV_CACHE_DIR=D:\dev-cache\uv-cache` y `PLAYWRIGHT_BROWSERS_PATH=D:\dev-cache\ms-playwright`. **Las terminales abiertas antes de este cambio no ven las variables**; abre una nueva o expórtalas a mano.

## F0 — Fundaciones

### Plan

Archivos: monorepo pnpm (`apps/web` Next.js 16, `packages/{scene-schema,solver-ts,viewer,croquis-2d}`), espacio de trabajo uv (`solver`, `services/api`, `extraction`, `data`, `eval`), CI en GitHub Actions (web, e2e, python en Ubuntu y Windows), ADRs, esqueleto de docs, licencias, scripts de descarga y resumen de INEGI ATUS.

Pruebas: Vitest en cada paquete TS (incluye `fast-check`), Playwright e2e de la portada, pytest + Hypothesis en cada paquete Python, ruff y pyright estricto, ESLint con reglas tipadas, Prettier.

Riesgos: (1) TypeScript 7 rompe typescript-eslint → se usa TS 6.0.3 (ADR 0003). (2) Los archivos anuales de ATUS 2024/2025 no están en la URL histórica; la pestaña "Datos abiertos" del INEGI se renderiza con JavaScript → se localizan con un navegador headless. (3) RAM: no correr `next dev` y pytest con Hypothesis pesado a la vez.

### Hecho

- Esqueleto completo del monorepo (ver estructura en PLAN §3.2) con primeros módulos reales y sus pruebas:
  - `packages/solver-ts/src/units.ts` ↔ `solver/croquis_solver/units.py` (primer par de paridad).
  - `packages/viewer/src/quality.ts` (niveles de calidad con histéresis, PLAN §7.8).
  - `packages/croquis-2d/src/geometry.ts` (vectores 2D y caja orientada).
  - `apps/web/src/components/legend.tsx` (leyenda obligatoria de PLAN §10) con prueba unitaria y e2e.
  - `services/api` con `/health` y configuración por entorno (tope de gasto y límite de peticiones, PLAN §16.4).
  - `extraction/croquis_extraction/hashing.py` (hash estable del relato para la leyenda).
  - `eval/croquis_eval/results.py` (escritura uniforme de resultados con commit, fecha y semilla).
- `.github/workflows/ci.yml` con tres trabajos: web (format, lint, tipos, pruebas, build), e2e (Playwright) y python (ruff, pyright, pytest) en Ubuntu y Windows.
- ADR 0001 (stack con versiones), 0002 (decisiones abiertas §16), 0003 (TypeScript 6 vs 7).

### En curso

- Ingesta ATUS: ver "Siguiente paso concreto".
- Instalación de dependencias y primera corrida local de todo.

### Evidencia

Se llena al cerrar la fase con los comandos y sus salidas.

### Pendientes registrados

- Instalar Blender y FFmpeg cuando empiece F3 (pipeline de assets) y F9 (video).
- `turbo` no se adoptó en F0 (pnpm `-r` basta); reconsiderar si el CI pasa de ~10 min.

### Decisiones

- Repositorio remoto: `renecano/Crash_reconstruction_visualization_system` (ver bloqueados).
- Cache Components de Next.js desactivado al crear la app (`--no-cache-components`): el producto es mayormente cliente (visor 3D) y así se evita fricción en F0; se puede activar después sin cambiar la estructura.
- Python 3.14 (y no 3.12 como decía PLAN §3.1): es la versión estable vigente, hay ruedas `cp314` para numpy, scipy, pydantic-core, pyarrow y pandas en Windows (verificado en PyPI el 2026-10-10).
