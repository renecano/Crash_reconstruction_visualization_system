# Bitácora de Croquis

Este archivo permite que cualquier sesión retome el trabajo sin contexto previo.
Reglas de trabajo: `CLAUDE.md`. Especificación: `PLAN.md`.

## Estado actual

- **Fase actual:** F1 — Contrato y croquis (en curso, rama `feat/f1-contrato`).
- **Hecho en F1:** `escena.schema.json` v1 (48 definiciones), generadores Zod (propio) y Pydantic (datamodel-code-generator) con verificación en CI, 10 escenas canónicas con relato y evidencias verificadas, validador semántico con paridad TS ↔ Python (18 casos compartidos), editor 2D en SVG (`@croquis/croquis-2d`) con ediciones puras y prueba de propiedad de ida y vuelta, página `/croquis` con JSON bidireccional y revisión de la escena.
- **Siguiente paso concreto:** cerrar F1: (1) tabla de rangos por clase de vehículo con fuentes (`data/vehicles/models_raw.json` → `packages/scene-schema/vehicle_classes.json`) y conectarla al validador por defecto; (2) módulo de migraciones v1→vN con pruebas; (3) correr e2e de `/croquis`, PR, CI verde y merge; (4) actualizar README/ADR 0004.
- **F0 cerrado** el 2026-10-10 (PR #1).

### Bloqueado — necesita a René

| Qué                                                                                                                                                                                                                                 | Para qué                                                                                  | Estado              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------- |
| `ANTHROPIC_API_KEY`                                                                                                                                                                                                                 | F6 (extracción con Claude) y E1. CI usa respuestas grabadas, así que no bloquea hasta F6. | Pendiente           |
| Credenciales AWS (cuenta/rol para CDK) y proyecto Vercel                                                                                                                                                                            | F11 despliegue dev/prod. Mientras tanto todo corre local.                                 | Pendiente           |
| Licencia académica BeamNG.tech                                                                                                                                                                                                      | F10 y E5                                                                                  | Pendiente           |
| Confirmar licencia MIT del código y el nombre _Croquis_                                                                                                                                                                             | Se usan los valores por defecto de PLAN §16 (ADR 0002)                                    | Usando default      |
| Pruebas con ≥ 5 personas reales (E9)                                                                                                                                                                                                | F11                                                                                       | Pendiente           |
| Confirmar que el repositorio remoto correcto es `renecano/Crash_reconstruction_visualization_system` (público, lo creó René vacío el 2026-10-10). Se eligió por nombre y fecha; se puede cambiar con `git remote set-url origin …`. | Push y CI                                                                                 | Asumido y ya en uso |

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
- Chromium de Playwright (1248) descargado a `D:\dev-cache\ms-playwright`.
- Cachés movidos a D: para no llenar C: — `pnpm config set store-dir D:\dev-cache\pnpm-store --global`, `npm config set cache D:\dev-cache\npm-cache`, variables de usuario `UV_CACHE_DIR=D:\dev-cache\uv-cache` y `PLAYWRIGHT_BROWSERS_PATH=D:\dev-cache\ms-playwright`. **Las terminales abiertas antes de este cambio no ven las variables**; abre una nueva o expórtalas a mano.

## F0 — Fundaciones

### Plan

Archivos: monorepo pnpm (`apps/web` Next.js 16, `packages/{scene-schema,solver-ts,viewer,croquis-2d}`), espacio de trabajo uv (`solver`, `services/api`, `extraction`, `data`, `eval`), CI en GitHub Actions (web, e2e, python en Ubuntu y Windows), ADRs, esqueleto de docs, licencias, scripts de descarga y resumen de INEGI ATUS.

Pruebas: Vitest en cada paquete TS (incluye `fast-check`), Playwright e2e de la portada, pytest + Hypothesis en cada paquete Python, ruff y pyright estricto, ESLint con reglas tipadas, Prettier.

Riesgos: (1) TypeScript 7 rompe typescript-eslint → se usa TS 6.0.3 (ADR 0003). (2) Los archivos anuales de ATUS no están en la URL histórica; la pestaña "Datos abiertos" del INEGI se renderiza con JavaScript → se localizaron con Chromium headless y la API de descarga masiva. (3) RAM: no correr `next dev` y pytest con Hypothesis pesado a la vez.

### Hecho

- Esqueleto completo del monorepo (PLAN §3.2) con primeros módulos reales y sus pruebas:
  - `packages/solver-ts/src/units.ts` ↔ `solver/croquis_solver/units.py` (primer par de paridad).
  - `packages/viewer/src/quality.ts` (niveles de calidad con histéresis, PLAN §7.8).
  - `packages/croquis-2d/src/geometry.ts` (vectores 2D y caja orientada).
  - `apps/web/src/components/legend.tsx` (leyenda obligatoria de PLAN §10) con prueba unitaria y e2e.
  - `services/api` con `/health` y configuración por entorno (tope de gasto y límite de peticiones, PLAN §16.4).
  - `extraction/croquis_extraction/hashing.py` (hash estable del relato para la leyenda).
  - `eval/croquis_eval/results.py` (escritura uniforme de resultados con commit, fecha y semilla).
- **Ingesta de INEGI ATUS 1997–2025** (`data/croquis_data/atus.py`): descarga con verificación de tamaño y SHA-256, agregación anual con polars en streaming (un año a la vez), exclusión de "Certificado cero", compatibilidad con nombres de columna antiguos. Salidas: `data/processed/atus/*.csv` (12 tablas, ≈125 KB) y `eval/results/atus_summary.json`.
- `.github/workflows/ci.yml` con tres trabajos: web (format, lint, tipos, pruebas, build), e2e (Playwright) y python (ruff, pyright, pytest) en Ubuntu y Windows. Dependabot semanal (npm, uv) y mensual (actions).
- ADR 0001 (stack con versiones), 0002 (decisiones abiertas §16), 0003 (TypeScript 6 vs 7).
- README con la sección "Problema" alimentada por `eval/results/atus_summary.json`; `data/SOURCES.md` con la fila de ATUS.

### Evidencia (local, Windows, 2026-10-10)

| Comando                                               | Resultado                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                           | 5 paquetes sin errores (ESLint 10 + typescript-eslint tipado; eslint-config-next)                     |
| `pnpm typecheck`                                      | `next typegen && tsc --noEmit` en web y `tsc` en 4 paquetes: 0 errores                                |
| `pnpm test`                                           | Vitest: web 3, croquis-2d 2, scene-schema 3, solver-ts 3 (fast-check), viewer 4 → 15 pruebas en verde |
| `pnpm --filter @croquis/web build`                    | Next.js 16.4 (Turbopack) compila; 2 rutas estáticas                                                   |
| `pnpm --filter @croquis/web test:e2e`                 | Playwright 1 prueba en verde contra `next build && next start`                                        |
| `uv run ruff check . && uv run ruff format --check .` | All checks passed; 32 archivos formateados                                                            |
| `uv run pyright`                                      | 0 errors (modo strict)                                                                                |
| `uv run pytest`                                       | 16 pruebas en verde (Hypothesis incluida)                                                             |
| `uv run croquis-data atus process`                    | 29 años en 2 min 54 s; p. ej. `2025: 380391 accidentes, 4571 muertos`                                 |

Cifras medidas (de `eval/results/atus_summary.json`): 2025 = 380,391 accidentes, 4,571 fallecidos en el lugar, 86,956 heridos; 2024 = 374,949 / 4,656 / 85,980. Estado de México primer lugar en fallecidos (460). Colisiones con motocicleta +10.73 % y volcaduras +15.26 % respecto a 2024. Peatones fallecidos **bajaron** 13.87 % (901 → 776) y pasajeros subieron 3.29 % (972 → 1,004): el PLAN §1 decía que ambos subieron; el README reporta lo que dice el archivo. 2021 = 340,415, idéntico a la cifra del plan.

### Pendientes registrados

- Instalar Blender y FFmpeg cuando empiece F3 (pipeline de assets) y F9 (video).
- `turbo` no se adoptó en F0 (pnpm `-r` basta); reconsiderar si el CI pasa de ~10 min.
- La advertencia de peers de pnpm (eslint-plugin-import/jsx-a11y/react declaran eslint ≤ 9 aunque funcionan con 10) se vigila; si rompe, bajar `apps/web` a ESLint 9 con nota en ADR 0001.
- Prettier reformateó `CLAUDE.md` y `PLAN.md` una vez (solo espacios y alineación de tablas); ambos quedaron en `.prettierignore` para no volver a tocarlos.

### Decisiones

- Repositorio remoto: `renecano/Crash_reconstruction_visualization_system`. `main` nace con un commit raíz vacío para que la primera fase también entre por PR con CI.
- Cache Components de Next.js desactivado al crear la app (`--no-cache-components`): el producto es mayormente cliente (visor 3D); se puede activar después sin cambiar la estructura.
- Python 3.14 (y no 3.12 como decía PLAN §3.1): versión estable vigente con ruedas `cp314` para numpy, scipy, pydantic-core, pyarrow, pandas y polars en Windows (verificado en PyPI el 2026-10-10).
- `pytest --import-mode=importlib` y carpetas `tests/` sin `__init__.py` para que cinco paquetes convivan en un solo `pytest`.
- Las dimensiones `SEXO`, `ALIENTO`, `CINTURON` y `CAUSAACCI` de ATUS no se agregan (describen al "presunto responsable"; PLAN §10).

### Resumen para René (F0)

- **Qué quedó:** el repo completo con CI, los primeros módulos con pruebas y la ingesta real de ATUS con cifras verificables.
- **Cómo probarlo:** `pnpm install && uv sync --all-packages --all-groups`, luego `pnpm dev` (web), `uv run pytest`, `pnpm test`. Para regenerar las cifras: `uv run croquis-data atus download`, `uv run croquis-data atus process`, `uv run croquis-eval atus-summary`.
- **Qué necesito de ti:** nada para seguir a F1–F5. Para F6 la `ANTHROPIC_API_KEY`; para F10 la licencia de BeamNG.tech; para F11 credenciales de AWS/Vercel y las 5 personas de E9. Y confirmar el remoto de GitHub si no es el que asumí.
