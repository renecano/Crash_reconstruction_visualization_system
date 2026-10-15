# Bitácora de Croquis

Este archivo permite que cualquier sesión retome el trabajo sin contexto previo.
Reglas de trabajo: `CLAUDE.md`. Especificación: `PLAN.md`.

## Estado actual

- **Fase actual:** pendientes físicos de F7, antes de F8. El pendiente 1 de F7 (test CISS de Relatos-MX y prompt v2) quedó hecho el 2026-10-14 (PR #11, ADR 0012); v2 es el prompt de producción.
- **Rigidez lateral, hecha** (PR #12, ADR 0013). Sale de 1,265 pruebas de barrera móvil de NHTSA. En el test de E3, el error en costados baja de 11.04 a 8.51 km/h.
- **Siguiente paso concreto:** rigidez trasera desde los reportes PDF de FMVSS 301, en la rama `feat/f7-rigidez-trasera`. La API no trae masa ni perfil de esas pruebas; ver "F7 (continuación) — Rigidez lateral" → "Pendientes". Después, el pendiente 3 (inercia de guiñada medida) y luego F8. Los dos cambian resultados y capturas, así que van antes de las capturas de F8.
- **En paralelo** (rama `feat/f7-e1-v2-test`): grabaciones del prompt v2 en el primer test y repeticiones de v1 en dev, dentro del tope diario. Cuando terminen: `golden build`, `e1-extraction --split test --prompt extraccion_v2` y su PR.
- **F0** cerrado el 2026-10-10 (PR #1), **F1** el 2026-10-10 (PR #3), **F2** el 2026-10-13 (PR #4), **F3** el 2026-10-13 (PR #5), **F4** el 2026-10-13 (PR #6), **F5** el 2026-10-13 (PR #7), **F6** el 2026-10-14 (PR #8), **F7** el 2026-10-14 (PR #9; pendientes registrados); migración a Vercel el 2026-10-14 (PR #10); test CISS y prompt v2 el 2026-10-14 (PR #11).

### Bloqueado — necesita a René

| Qué                                                                                                                                                                                                                                 | Para qué                                                                                          | Estado                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `ANTHROPIC_API_KEY`                                                                                                                                                                                                                 | F6 (extracción con Claude) y E1. CI usa respuestas grabadas, así que no bloquea hasta F6.         | Recibida 2026-10-14 (`.env.local`) |
| Conectar el repo a Vercel, configurar las variables de entorno (`ANTHROPIC_API_KEY`, tope, Upstash) y elegir el plan                                                                                                                | Despliegue en Vercel (ADR 0011); sin Upstash, en producción solo responde la línea base de reglas | Pendiente                          |
| Licencia académica BeamNG.tech                                                                                                                                                                                                      | F10 y E5                                                                                          | Pendiente                          |
| Confirmar licencia MIT del código y el nombre _Croquis_                                                                                                                                                                             | Se usan los valores por defecto de PLAN §16 (ADR 0002)                                            | Usando default                     |
| Pruebas con ≥ 5 personas reales (E9)                                                                                                                                                                                                | F11                                                                                               | Pendiente                          |
| Confirmar que el repositorio remoto correcto es `renecano/Crash_reconstruction_visualization_system` (público, lo creó René vacío el 2026-10-10). Se eligió por nombre y fecha; se puede cambiar con `git remote set-url origin …`. | Push y CI                                                                                         | Asumido y ya en uso                |

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

## F1 — Contrato y croquis

### Plan

Archivos: `packages/scene-schema/escena.schema.json` + generadores (`scripts/generate.ts` → Zod; `croquis_scene_schema_codegen` → Pydantic), 10 fixtures con relato, validador semántico en TS y Python, módulo de migraciones, tabla de clases de vehículo con fuentes, `packages/croquis-2d` (layout, ediciones puras, componente SVG), página `/croquis` y e2e.

Pruebas: Ajv ↔ Zod bajo mutaciones (fast-check), casos inválidos compartidos, casos semánticos compartidos (paridad TS ↔ Python), propiedad "editar y volver al JSON no pierde datos", pruebas de componente con Testing Library, Playwright sobre `/croquis`, generadores y tabla verificados en CI.

Riesgos: (1) `json-schema-to-zod` no resuelve `$ref` → generador propio (ADR 0004). (2) Las fichas técnicas de fabricantes son irregulares (autobuses sin tara, tractocamiones sin dimensiones) → rangos de respaldo marcados `supuesto`. (3) jsdom no implementa `getScreenCTM` → el editor convierte coordenadas con `getBoundingClientRect` + viewBox para poder probarse.

### Hecho

- **Contrato v1** (`escena.schema.json`, draft 2020-12, 48 definiciones): meta (semilla, hash del relato), lugar (vía, carriles, superficie, fricción, dispositivos con fases de semáforo, ubicación real), entorno (clima, iluminación, objetos con diámetro de tronco), vehículos (clase, color, masa y dimensiones con rango, maniobra, velocidad, frenado, poses), personas (sin nombres; rol, asiento, cinturón, casco, postura), eventos (CDC SAE J224 y PDOF), daños declarados, evidencias físicas. Todo escalar envuelto con `fuente`/`confianza`/`evidencia`.
- **Generación**: Zod (`src/generated/escena.zod.ts`, 628 líneas) y Pydantic (`croquis_scene_schema/generated.py`, 1000 líneas); `generate:check` y `--check` en CI.
- **10 escenas canónicas** con relato sintético y 100 % de evidencias con offsets reales (`scripts/fix_offsets.py`); validan con Ajv, Zod, jsonschema y Pydantic; ida y vuelta sin pérdida en ambos lados.
- **Validador semántico** (`check.ts` / `check.py`): E001–E015 y W001–W003 (ids, referencias, evidencia, rangos declarados, masa/dimensiones por clase, velocidad implausible, superposición con SAT, roles/ocupantes, orden y actores de eventos); 18 casos compartidos de paridad; mensajes sin culpa.
- **Tabla de clases** `vehicle_classes.json` generada desde 47 fichas técnicas (`data/vehicles/models_raw.json`, 43 oficiales), con `origen` por campo y respaldos `supuesto` documentados; `croquis-data vehicles build --check` en CI.
- **Migraciones** (`migrate.ts` / `migrate.py`): motor encadenado con fixture 0.9.0 compartido; registro vacío mientras solo exista 1.0.0.
- **Croquis 2D** (`@croquis/croquis-2d`): plantillas de vía por `tipo_via` (recta, curva, X, T, glorieta, incorporación, retorno, estacionamiento, carretera, autopista), vehículos a escala real, personas, objetos, dispositivos, evidencias y puntos de impacto; arrastre y giro; cada edición marca `fuente: usuario`, `confianza: 1`.
- **Web** `/croquis`: selector de escena, editor, JSON bidireccional ("Aplicar JSON" valida contra el contrato), descarga, lista de problemas, leyenda ilustrativa con semilla.
- Docs: ADR 0004, `data/SOURCES.md` (fichas), `docs/data.md`, `docs/physics.md` (rangos de plausibilidad), README.

### Evidencia (local, Windows, 2026-10-10)

| Comando                                                                                                                                            | Resultado                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                                                                        | scene-schema 113, croquis-2d 34, web 3, solver-ts 3, viewer 4 → **157 pruebas** en verde                                     |
| `uv run pytest`                                                                                                                                    | **48 pruebas** en verde (incluye paridad semántica, codegen y tabla al día)                                                  |
| `pnpm lint` / `pnpm typecheck`                                                                                                                     | 5 paquetes sin errores                                                                                                       |
| `uv run ruff check . && uv run ruff format --check . && uv run pyright`                                                                            | limpio (pyright strict)                                                                                                      |
| `pnpm --filter @croquis/web test:e2e`                                                                                                              | 3 pruebas Playwright en verde (portada + 2 de `/croquis`: arrastre sin pérdida de datos; JSON a mano y errores del contrato) |
| `pnpm --filter @croquis/scene-schema generate:check`, `uv run croquis-scene-schema-generate --check`, `uv run croquis-data vehicles build --check` | al día                                                                                                                       |
| `pnpm --filter @croquis/web build`                                                                                                                 | rutas `/`, `/croquis` estáticas                                                                                              |

Criterio de aceptación F1 (PLAN §13): las 10 escenas validan en ambos lados ✔; editar en el croquis y volver al JSON no pierde datos ✔ (prueba de propiedad con 40 secuencias aleatorias por escena + e2e).

### Pendientes registrados

- Normalización completa de unidades a SI (`normalizar(spec)`) se implementa con el solver en F2 (hoy `check` convierte localmente).
- Snapshots visuales del croquis: se harán junto con los del visor 3D en F3 (misma infraestructura de Playwright).
- Exportar el croquis como SVG/PNG/PDF tipo parte de tránsito (PLAN §7.7) queda para F9 con el resto de exportaciones.
- Clases con rangos `supuesto` (autobús, tractocamión, bicicleta, scooter): buscar fichas con tara/dimensiones cuando aparezcan; el formato ya lo soporta.
- La tabla de clases usa márgenes fijos (masa ×0.75/×1.35 o PBV; dimensiones ×0.9/×1.1); revisar cuando E2/E3 den datos reales de masas de prueba.

### Decisiones

- Ver ADR 0004 (sin `allOf`, generador Zod propio, procedencia compartida en compuestos, tabla de clases generada, migraciones).
- `check` recibe la tabla por parámetro y usa `vehicle_classes.json` por defecto; `{}` la desactiva (pruebas de paridad usan una tabla pequeña explícita).
- Los campos `SEXO`, `ALIENTO`, `CINTURON` del "presunto responsable" de ATUS y cualquier noción de culpa quedan fuera del contrato y de los mensajes.

### Resumen para René (F1)

- **Qué quedó:** el contrato completo con tipos generados en los dos lenguajes, diez escenas listas para la demo, un validador que explica en lenguaje llano qué no cuadra, y el croquis editable en `/croquis` sincronizado con el JSON.
- **Cómo probarlo:** `pnpm dev` y abre http://localhost:3000/croquis; cambia de escena, arrastra el vehículo A y mira cómo cambia el JSON (y cómo la posición queda marcada como tuya); pega un JSON roto y verás los errores del contrato. Pruebas: `pnpm test`, `uv run pytest`, `pnpm --filter @croquis/web test:e2e`.
- **Qué necesito de ti:** nada para F2. Sigue pendiente lo de la lista de bloqueados (llave de API para F6, BeamNG para F10, AWS/Vercel y personas para F11).

## F2 — Solver de referencia

### Plan

Archivos: `solver/croquis_solver/{models,impact,crash3,friction,preimpact,postimpact,fixed_object,pedestrian,stiffness,reconstruct}.py`, `data/friction.json`, cliente de la Vehicle Crash Test Database de NHTSA (`data/croquis_data/nhtsa_ctd.py`), E2 (`eval/croquis_eval/e2_barrier.py`), `docs/physics.md`, ADR 0005.

Pruebas: propiedades con Hypothesis (conservación de momento lineal y angular, energía no creciente, simetría), casos con solución cerrada (choque central, barrera, derrape, CRASH3 uniforme, cotas de Searle), reconstrucción de las 10 escenas con determinismo bit a bit, E2 con CSV sintético y reproducción byte a byte de la tabla de rigidez.

Riesgos: (1) restitución de Newton + Coulomb puede ganar energía (paradoja de Kane) → candidatos que nunca la ganan. (2) La API de NHTSA es lenta y devuelve 404 con `sortBy` → descarga reanudable por prueba, sin ordenar. (3) Sin pruebas de barrera rígida para lateral y trasera → respaldo marcado `supuesto`.

### Hecho

- Módulos 6.1.1 (pre-impacto), 6.1.2 (impacto por impulso), 6.1.3 (CRASH3), 6.1.4 (objetos fijos), 6.1.5 (post-impacto 3 GDL) y 6.1.7 (Searle, Wood, zonas de contacto) con ecuaciones y referencias en `docs/physics.md`.
- Orquestador `reconstruct(spec)` → `Reconstruction` (trayectorias, ΔV, PDOF, perfiles de daño, proyección de peatón, eventos y banderas) para las 10 escenas canónicas.
- Descarga completa de las pruebas vehículo contra barrera de NHTSA (3388 pruebas, 0 fallidas) y E2 con dejar-uno-fuera por clase. La tabla `solver/croquis_solver/data/stiffness_classes.json` sale de E2.
- `data/SOURCES.md` (NHTSA y derivados), `docs/data.md` (filtros y límites de E2), README con resultados medidos, ADR 0005.

### Evidencia (local, Windows, 2026-10-13)

| Comando                                                                 | Resultado                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `uv run pytest`                                                         | **195 pruebas** en verde (solver 73, eval y data 17, resto de paquetes) |
| `uv run ruff check . && uv run ruff format --check . && uv run pyright` | limpio (pyright strict)                                                 |
| `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`         | limpio; 157 pruebas TS en verde                                         |
| `uv run croquis-data nhtsa download --workers 4`                        | `listadas 3388, nuevas 3388, en caché 0, fallidas 0`                    |
| `uv run croquis-eval e2-barrier`                                        | 1316 pruebas usadas de 3388; salida en `eval/results/e2_barrier.json`   |

E2 (de `eval/results/e2_barrier.json`), error absoluto medio dejando una prueba fuera:

| Clase           | Pruebas | A (kgf/cm) | B (kgf/cm²) | Error velocidad (km/h) | Recta global (km/h) |
| --------------- | ------: | ---------: | ----------: | ---------------------: | ------------------: |
| camion_unitario |       5 |      82.73 |       12.09 |                  10.55 |                9.22 |
| hatchback       |      93 |      75.66 |       12.33 |                   8.69 |                 9.9 |
| pickup          |     158 |      89.45 |       12.09 |                   8.76 |               10.14 |
| sedan_compacto  |     155 |      65.14 |        9.89 |                   7.94 |                8.28 |
| sedan_mediano   |     386 |      75.25 |       11.48 |                   7.77 |                8.51 |
| suv_compacta    |     248 |       85.7 |       13.92 |                   8.37 |                9.71 |
| suv_grande      |     201 |      91.11 |       13.12 |                    8.2 |                9.27 |
| van             |      70 |      82.05 |       11.59 |                   6.63 |                6.71 |

Global: **8.1 km/h** contra 9.03 km/h de la recta global y 27.74 km/h de la regla de Emori. En aplastamiento: 75.4 mm contra 74.4 mm (sin mejora).

Criterio de aceptación F2 (PLAN §13): conservación < 1e-9 ✔ (Hypothesis, 400 configuraciones); E2 con error reportado contra la línea base ✔.

### Pendientes registrados

- Rigidez lateral y trasera medida: buscar pruebas de barrera deformable móvil o coeficientes publicados (hoy `supuesto`).
- E2 no mejora la predicción de aplastamiento frente a la recta global; revisar en F7 si un b0 por clase o la forma del perfil reducen el error.
- Usar el tiempo de percepción-reacción para ubicar el inicio de frenado cuando el relato no lo da (hoy 0.6 s fijos con bandera); entra con la inversión de F7.
- Inercia de guiñada medida por clase (hoy placa rectangular).
- Port TS del solver y paridad (E7): F9, como marca PLAN §13.

### Decisiones

- Ver ADR 0005 (Python con `math` para facilitar el port, candidatos anti-Kane, t = 0 en el impacto, arrastre post-impacto 0.35 μ, tabla de rigidez generada y verificada).
- E2 acepta `LOAD CELL BARRIER` además de `FLAT BARRIER`: ambas son barreras planas rígidas (la primera con celdas de carga). Con ambas quedan 1316 pruebas; los descartes por criterio están en `conteos`.

### Resumen para René (F2)

- **Qué quedó:** el solver físico que convierte una escena en trayectorias, daños y tiempos, y la primera evidencia medida: con rigidez por clase sacada de pruebas reales de NHTSA, la velocidad de impacto se estima con 8.1 km/h de error medio.
- **Cómo probarlo:** `uv run pytest solver` y `uv run croquis-eval e2-barrier`. Para regenerar todo desde cero: `uv run croquis-data nhtsa download` y `uv run croquis-data nhtsa process`.
- **Qué necesito de ti:** nada para F3–F5.

## F3 — Visor base

### Plan

Archivos: contrato del resultado (`packages/scene-schema/resultado.schema.json`, Zod generado, resultados versionados de las 10 escenas), `packages/viewer` (módulos puros: geometría de vía, vehículos procedurales, maniquí, muestreo, línea de tiempo, reloj, sol, cámaras, grafo de escena, elección de backend; componente React Three Fiber), página `/visor`, e2e y capturas visuales, E6 (`eval/e6_performance.mjs`), ADR 0006.

Pruebas: unitarias y de propiedades del visor sin GPU (el grafo de escena se prueba en Node), componentes de interfaz con Testing Library, Playwright sobre las 10 escenas, capturas visuales en Linux, E6 en la laptop de referencia.

Riesgos: (1) el visor mostraría choques sin sentido si el solver no coloca bien los vehículos → se corrigió el contacto (zonas CDC) y la geometría de los fixtures. (2) WebGPU en GPU integrada → se mide y se elige backend. (3) Capturas visuales que difieren entre sistemas → se generan y comparan en Linux.

### Hecho

- **Correcciones del solver que el visor dejó a la vista:** el punto de contacto de cada vehículo (zona CDC) llega al impacto, ya no su centro de masa (antes los autos se encimaban y el choque no generaba giro); vueltas de 90° con recta posterior; seguimiento de carril en curva y glorieta; desvío inferido marcado como bandera; superficies planas con la normal de la superficie; **signo del término de altura de Searle** (D − μh, como Wood); trayectorias de peatones coherentes con Searle; rejilla alineada a t = 0.
- **Modelo de vía compartido** solver ↔ croquis ↔ visor (curva con centro en (0, −R), glorieta con borde por el origen); fixtures corregidos para que cada vehículo arranque en su carril y los objetos queden fuera de la calzada; los accesos de la glorieta del croquis ya conectan con el anillo.
- **Contrato del resultado** con Zod generado, validación en Python y TS, equivalencia Ajv↔Zod con mutaciones y resultados versionados verificados en CI con tolerancia numérica (Linux y Windows coinciden).
- **Visor 3D** `/visor`: vía, banquetas, rayas y pasos peatonales; vehículos genéricos de 14 clases con dimensiones reales y piezas nombradas; maniquí neutro; objetos y dispositivos básicos; evidencias declaradas; sol por fecha, hora y lugar; cielo físico horneado; cámaras libre, cenital, del conductor y cinematográfica; línea de tiempo con cámara lenta, cuadro por cuadro y marcadores; tabla de resultados con fuentes; leyenda ilustrativa sobre el lienzo; calidad y backend automáticos por medición; modo pantalla completa y bucle por URL.

### Evidencia (local, Windows, 2026-10-13)

| Comando                                     | Resultado                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `uv run pytest`                             | **244 pruebas** en verde                                                                        |
| `pnpm test`                                 | **273 pruebas** en verde (visor 102)                                                            |
| `pnpm --filter @croquis/web test:e2e`       | 16 pruebas en verde en Windows; en CI (Linux) corren las 26, incluidas las 10 capturas visuales |
| `uv run croquis-solver reconstruct --check` | resultados al día (también en CI Ubuntu y Windows)                                              |
| `node eval/e6_performance.mjs`              | `eval/results/e6_performance.json`                                                              |

E6 (de `eval/results/e6_performance.json`; Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz, 7.8 GB, GPU ANGLE (Intel, Intel(R) UHD Graphics (0x00009B41) Direct3D11 vs_5_0 ps_5_0, D3D11)), 1920×1080 a pantalla completa, cámara en movimiento, sin tope de vsync:

| Backend | Calidad | fps mínimo entre escenas | fps mediana | Escena más lenta | Carga inicial máx. (MB) |
| ------- | ------- | -----------------------: | ----------: | ---------------- | ----------------------: |
| WebGPU  | baja    |                    145.3 |       197.8 | glorieta         |                    0.77 |
| WebGPU  | media   |                     61.9 |        81.3 | glorieta         |                    0.77 |
| WebGPU  | alta    |                     28.3 |          35 | glorieta         |                    0.77 |
| WebGL 2 | baja    |                    211.4 |       324.5 | motociclista     |                    0.77 |
| WebGL 2 | media   |                     76.4 |        85.6 | frontal_curva    |                    0.77 |
| WebGL 2 | alta    |                     36.2 |        43.8 | peaton_cruce     |                    0.77 |

Presupuesto §7.8 con el backend que elige el modo automático en esta laptop (media: webgpu, alta: webgl; verificación en el visor a pantalla completa: «WebGPU · elegido por medición (WebGPU 108 fps)»): media ≥ 60 fps → ✔; alta ≥ 30 fps → ✔; carga inicial ≤ 8 MB → ✔.

Criterio de aceptación F3 (PLAN §13): las 10 escenas se ven ✔ (e2e); capturas visuales ✔ (10 referencias en Linux, comparadas en CI); E6 dentro de presupuesto ✔.

### Pendientes registrados

- Volcadura, ragdoll de peatones y ocupantes visibles: F5 (hoy el vehículo de la volcadura derrapa sin volcar y el maniquí no se articula).
- Texturas PBR (Poly Haven) para asfalto y pasto, alumbrado y faros con luz real, fases de semáforo: F8.
- Pipeline de Blender (§7.2) para assets de entorno o mallas más densas si F4 lo necesita; hoy los vehículos son procedurales (ADR 0006).
- El backend WebGPU de three.js rinde menos que WebGL 2 en Intel UHD; en calidad media WebGPU apenas pasa los 60 fps en la glorieta (margen estrecho; si una sesión mide menos, el modo automático cambia a WebGL 2). Revisar en cada actualización de three.js con E6.
- R3F 9 usa `THREE.Clock` (aviso de obsolescencia en consola); se va con la próxima versión de R3F.

### Decisiones

- Ver ADR 0006. Destacan: contrato del resultado separado del de entrada, modelo de vía compartido sin cambiar el contrato, vehículos procedurales, `WebGPURenderer` con elección de backend por medición, grafo de escena probado sin GPU, capturas generadas en Linux por CI.

### Resumen para René (F3)

- **Qué quedó:** las diez escenas se ven en 3D en `/visor`, con línea de tiempo, cámaras y la tabla de resultados; el solver ahora coloca bien el contacto entre vehículos y la geometría de las escenas es coherente con cada relato.
- **Cómo probarlo:** `pnpm dev` y abre http://localhost:3000/visor; cambia de escena y de cámara, reproduce en cámara lenta y salta a los eventos. Para medir el rendimiento: `pnpm --filter @croquis/web build` y `node eval/e6_performance.mjs`.
- **Qué necesito de ti:** nada para F4–F5.

## F4 — Daño

### Plan

Archivos: `dano.centro_m` en el resultado (esquema 1.1.0), carrocerías densas por secciones (`loft.ts`), campo de deformación y medición del perfil (`damage.ts`), materiales de daño en TSL (`damage-material.ts`), rig de daño por vehículo (`damage-rig.ts`), bolsas de aire (`airbag.ts`), marcas en el piso (`ground-marks.ts`), restos con Rapier (`debris.ts`, `debris-scene.ts`), cámara de acercamiento al daño, panel con bolsas de aire, capturas de daño, ADR 0007.

Pruebas: perfil C1–C6 medido sobre la malla deformada contra el del solver en las 10 escenas; propiedad de compresión sin pliegues; umbrales del IIHS; reglas de faros, parabrisas y bolsas en escenas reales; marcas por tiempo; horneado de Rapier reproducible; capturas de daño por escena en Linux.

Riesgos: (1) mallas sin vértices interiores → loft denso. (2) convención de C1 → fijada en el esquema y probada con un perfil asimétrico. (3) costo del daño en GPU integrada → E6 repetido.

### Hecho

- **Deformación plástica** desde el perfil del solver, horneada como morph target y animada en los 0.12 s de contacto; llantas que se recorren si el aplastamiento las alcanza.
- **Superficie** en TSL: transferencia de pintura en vetas, rayones con metal expuesto y abolladuras finas.
- **Vidrios:** parabrisas agrietado en telaraña (cabeza del peatón o frente aplastado ≥ 0.3 m), vidrios laterales que estallan, faros rotos con astillas.
- **Piezas desprendidas y restos** con Rapier determinista horneado (defensas, espejos, plásticos en el punto de impacto).
- **Bolsas de aire** con umbrales del IIHS (ΔV como sustituto de la velocidad equivalente contra barrera), visibles en la escena y explicadas en el panel.
- **Marcas en el piso** desde las trayectorias: frenado sin ABS, derrape y guiñada después del impacto, charcos de radiador.
- **Cámara** «Acercamiento al daño» y noches legibles (luz ambiental de alumbrado o de luna).

### Evidencia (local, Windows, 2026-10-13)

| Comando                               | Resultado                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `uv run pytest`                       | **244 pruebas** en verde                                                                                         |
| `pnpm test`                           | **311 pruebas** en verde (visor 139)                                                                             |
| `pnpm --filter @croquis/web test:e2e` | 16 pruebas en verde en Windows; en CI (Linux) corren las 36, incluidas 20 capturas (10 del impacto y 10 de daño) |
| `node eval/e6_performance.mjs`        | `eval/results/e6_performance.json` (con daño)                                                                    |

Prueba numérica de F4: en las 10 escenas, el perfil medido sobre la malla de cada vehículo dañado coincide con el C1–C6 del solver dentro de 2 cm o 6 % (motos y bicis excluidas: su deformación es ilustrativa).

E6 con daño (`eval/results/e6_performance.json`, mejor de 2 corridas por configuración, 1920×1080, cámara en movimiento, sin tope de vsync):

| Backend | Calidad | fps mínimo entre escenas | fps mediana | Escena más lenta     |
| ------- | ------- | -----------------------: | ----------: | -------------------- |
| WebGPU  | baja    |                     92.5 |       147.4 | lateral_interseccion |
| WebGPU  | media   |                     39.2 |        66.4 | frontal_curva        |
| WebGPU  | alta    |                     24.1 |        30.1 | glorieta             |
| WebGL 2 | baja    |                    174.2 |       242.8 | glorieta             |
| WebGL 2 | media   |                     69.4 |        79.2 | peaton_cruce         |
| WebGL 2 | alta    |                       33 |        42.6 | glorieta             |

Con la política automática por escena (WebGPU si alcanza 60 fps; si no, el más rápido): calidad media **64.4 fps** mínimo (WebGL 2 y WebGPU; escena más lenta lateral_interseccion); alta **33 fps** (WebGL 2); carga inicial máxima **2.36 MB** (incluye el WASM de Rapier). Presupuesto: media ≥ 60 ✔, alta ≥ 30 ✔, ≤ 8 MB ✔.

Criterio de aceptación F4 (PLAN §13): capturas de daño por escena ✔; perfil C1–C6 del visor coincide con el del solver (prueba numérica sobre la malla) ✔.

### Pendientes registrados

- Calibrar las reglas ilustrativas (faros, parabrisas, piezas, vidrios, bolsas) con E5/BeamNG en F10.
- Colisiones de restos con banquetas elevadas (hoy el piso de colisión es plano).
- Deformación de motos y bicis con su propio modelo (hoy ilustrativa) cuando el solver tenga rigideces para dos ruedas.
- Fluidos distintos del radiador y marcas de arrastre de volcadura: F5 (volcadura).

### Decisiones

- Ver ADR 0007: deformación en CPU horneada como morph target (probada numéricamente, exportable a glTF) y efectos de superficie en TSL; reglas ilustrativas declaradas; umbrales de bolsas del IIHS; restos con Rapier determinista horneado.

### Resumen para René (F4)

- **Qué quedó:** cada choque deja el daño que calculó el solver: carrocería hundida con la forma y la profundidad del perfil C1–C6, pintura transferida, vidrios rotos, piezas en el piso, bolsas de aire y marcas.
- **Cómo probarlo:** `pnpm dev`, abre http://localhost:3000/visor, elige «Acercamiento al daño» y recorre la línea de tiempo alrededor de 0 en cámara lenta.
- **Qué necesito de ti:** nada para F5.

## F5 — Personas y visibilidad

Criterio de aceptación (PLAN §13): proyección del ragdoll dentro de los límites de Searle en ≥ 95 % de corridas con semilla; E4 corrido; análisis de visibilidad con prueba en la escena del árbol.

### Plan (orden de trabajo)

1. **Solver, peatón y jinete (6.1.7).** Banda de distancias de Searle para una velocidad y un rango de fricción; proyección de motociclistas y ciclistas en choques vehículo–vehículo (hoy solo se proyecta al peatón).
2. **Solver, ocupantes (6.1.8).** Cinemática relativa al habitáculo con y sin cinturón: pulso de choque desde ΔV y aplastamiento, desplazamiento hacia el punto de impacto y zona de contacto probable. Sin predicción de lesiones (§10, §16.2).
3. **Solver, visibilidad (6.1.9).** Línea de vista 2.5D desde el ojo de cada conductor (alturas AASHTO) hacia cada actor en el tiempo. Oclusores: árboles (tronco y copa), postes, muros, vehículos estacionados y en movimiento. Límites: noche (alcance y cono de faros, alumbrado), lluvia o niebla (`entorno.visibilidad`). Responde desde cuándo y a qué distancia se podía ver.
4. **Solver, volcadura (6.1.6).** Criterio de inicio por velocidad lateral contra la velocidad crítica de deslizamiento (SSF); la secuencia 3D va en Rapier en el visor, etiquetada como ilustrativa.
5. **Contrato del resultado 1.2.0.** `personas[].ocupante`, proyección de jinetes, `visibilidad` y `vehiculos[].volcadura`; regenerar los fixtures.
6. **Cuerpos.** Pipeline en Python sobre la malla base, los targets y el rig de MakeHuman (CC0, `LICENSE.ASSETS.md` del repositorio oficial): variantes por edad y sexo, complexión como _morph target_, esqueleto reducido para animar y para el ragdoll, glTF cuantizado. Ropa neutra por regiones, sin anatomía.
7. **Visor.** Animaciones de caminar, estar de pie, manejar y montar; ragdoll Rapier con límites articulares, calibrado contra la banda de Searle (horneado con semilla); ocupantes con su movimiento y marcadores neutros de contacto; volcadura en Rapier; cámara de conductor con la visibilidad sobrepuesta; panel de visibilidad y ocupantes.
8. **Evaluaciones.** E4 (proyección de peatón contra datos publicados accesibles; alternativa: Searle sola), tasa de éxito del ragdoll con semillas y E6 de nuevo con personas.
9. **Pruebas.** Hypothesis para las propiedades de ocupantes y visibilidad, prueba de visibilidad en `objeto_fijo_arbol`, `peaton_cruce` (camión estacionado) y casos sintéticos, pruebas del ragdoll y capturas visuales nuevas.

Riesgos: rendimiento con mallas con piel en GPU integrada (se mide con E6; hay LOD si hace falta); datos públicos de E4 escasos (se documenta cuál se usó y su licencia).

### Qué se hizo (F5)

- **Solver (Python, referencia):**
  - **Jinetes:** proyección de motociclistas y ciclistas en choques vehículo–vehículo (fase `montado` y luego Searle).
  - **Banda de Searle** (`searle_distance_band`, forma cerrada convexa en μ).
  - **Ocupantes** (`occupant.py`): pulso senoidal desde ΔV y aplastamiento; espacio de vuelo de Michie sin cinturón; holgura más resorte con cinturón; zona y velocidad relativa de contacto; dos variantes si no se declara el cinturón.
  - **Visibilidad** (`visibility.py`): línea de vista 2.5D desde alturas de ojo AASHTO; oclusores exactos; noche (faros) y clima.
  - **Volcadura** (`rollover.py`): velocidad crítica de deslizamiento con bandera de consistencia.
  - **Objetos del entorno** (`scene_objects.py`): geometría compartida con el visor.
  - **Otros:** vía 0.84 × ancho, igual que el visor. Resultado **1.2.0**.
- **Cuerpos** (`assets/pipeline`, CC0 de MakeHuman):
  - **Descarga:** commit fijo con candado SHA-256.
  - **Forma:** _macro targets_ con el algoritmo de MakeHuman; sexo neutro y etnias a 1/3.
  - **Salida:** tres variantes por edad (762 KB cada una), complexión como _morph target_ y rig reducido a 16 segmentos.
  - **Reproducibilidad:** CI descarga los insumos y reconstruye byte a byte.
- **Visor:**
  - **Animación:** posturas por direcciones de segmento; marcha con curvas de Winter.
  - **Ragdoll:** Rapier con límites AAOS aplicados por el módulo, calibrado contra la banda de Searle y sin volver a chocar con los vehículos de su propio evento.
  - **Ocupantes:** en su asiento, con el desplazamiento del solver y aros neutros de contacto.
  - **Volcadura:** ilustrativa en Rapier.
  - **Cámaras:** "Seguir a la persona", y la del conductor con líneas de vista y aros verde o naranja.
  - **Panel:** personas y visibilidad en lenguaje neutro.
- **Rendimiento:** E6 mostró que el visor está limitado por la CPU por objeto dibujado. Para devolver el margen:
  - los ocupantes no proyectan sombra;
  - rines, faros, calaveras y vidrios salen del pase de sombras;
  - cada rueda es una malla y los aros son una sola `InstancedMesh`;
  - las posturas se recalculan solo cuando cambian.
- **Port TS:** `packages/solver-ts/src/pedestrian.ts` (Searle y banda) con paridad probada contra los resultados del solver.
- **Fixtures corregidos con su relato:** el peatón de `peaton_cruce` sale de detrás del camión estacionado; la vegetación de `frontal_curva` pasa al interior de la curva.

### Evidencia y números medidos

- **Criterio del ragdoll** (`pnpm --filter @croquis/eval-js ragdoll` → `eval/results/ragdoll_searle.json`): 460 corridas con semilla (100 en escenas canónicas y 360 en el barrido de 20–70 km/h con tres cuerpos).
  - **Con calibración:** **100.0 %** dentro de la banda de Searle. Es casi por construcción, porque la calibración apunta al centro de la banda.
  - **Sin calibrar** (física sola, k = 1): **94.6 %**.
  - **Factor k:** mediana 0.9527 (rango 0.8574–1) y 2.14 horneados en promedio.
  - **Casos sin calibrar por debajo del 90 %:** adulto/30kmh (70 %), mayor/30kmh (50 %).
  - **Criterio de F5** (≥ 95 %): ✔.
- **E4** (`uv run croquis-eval e4-pedestrian` → `eval/results/e4_pedestrian.json`): 17 casos publicados en dominio.
  - **Velocidad desde la distancia:** error absoluto medio de Croquis **5.215 km/h** (sesgo +3.125), con su intervalo cubriendo **65 %** de los casos (ancho medio 12.685 km/h). Searle sola: 5.813 km/h, cobertura 24 % (ancho 5.831 km/h). Wood: 6.156 km/h.
  - **Por fuente:** IPTM 2.501 frente a 8.549 km/h; Eubanks y Haight 5.058 frente a 4.229; Randles 8.485 frente a 3.677. Croquis sobreestima en los casos reales de baja velocidad.
  - **Distancia desde la velocidad:** Croquis 2.543 m (banda que cubre 47 %), Searle sola 2.912 m; el ragdoll sin calibrar da 2.423 m.
  - **Factor de proyección:** 0.9; el óptimo de la muestra es 0.92 y reajustarlo da 6.5 km/h dejando uno fuera, así que se conserva.
- **Visibilidad en la escena del árbol** (criterio de F5): `test_visibilidad_en_la_escena_del_arbol`. El conductor de la pickup (ojo a 1.40 m) ve el árbol durante toda la aproximación, desde más de 50 m.
  - **Árbol que tapa:** con un segundo árbol frondoso entre ambos, lo tapa un tramo (`test_visibilidad_con_otro_arbol_que_tapa_el_del_impacto`).
  - **Camión estacionado:** en `peaton_cruce` tapa al peatón hasta 1.8 s antes del impacto (se ve a 21.6 m).
- **E6 con personas** (`eval/results/e6_performance.json`, mejor de 2 corridas, 1920×1080, cámara en movimiento, sin tope de vsync):

| Backend | Calidad | fps mínimo entre escenas | fps mediana | Escena más lenta |
| ------- | ------- | -----------------------: | ----------: | ---------------- |
| WebGPU  | baja    |                    102.5 |       118.3 | glorieta         |
| WebGPU  | media   |                     44.8 |        56.7 | frontal_curva    |
| WebGPU  | alta    |                     17.5 |        22.9 | nocturno_lluvia  |
| WebGL 2 | baja    |                    117.5 |       169.6 | nocturno_lluvia  |
| WebGL 2 | media   |                     61.4 |        69.5 | glorieta         |
| WebGL 2 | alta    |                     30.3 |        37.6 | glorieta         |

Con la política automática por escena: calidad media **61.4 fps** mínimo (escena más lenta objeto_fijo_arbol); alta **30.3 fps**; carga inicial máxima **3.1 MB** (incluye cuerpos y el WASM de Rapier). Presupuesto: media ≥ 60 ✔, alta ≥ 30 ✔, ≤ 8 MB ✔.

- **Pruebas:** pytest **286**, TS **336** (visor 157, web 11, solver-ts 7) y e2e **17** locales (las 20 capturas se generan en Linux por CI). Lint, tipos, Prettier y reproducibilidad de los cuerpos en verde.

### Dependencias y herramientas (F5)

- **Paquete Python `croquis-assets`** (`assets/pipeline`; NumPy y httpx, ya en el stack).
- **Paquete JS `@croquis/eval-js`** (`eval/js`; tsx del catálogo) para evaluaciones que usan el visor.
- **pypdf y PyMuPDF**, solo de forma efímera con `uv run --with`, para leer las tablas de los artículos de E4. No quedan en el proyecto.

### Decisiones (ver ADR 0008)

- Cuerpos de MakeHuman sin Blender (pipeline Python reproducible).
- Sin suponer sexo ni etnia.
- Ragdoll calibrado que ignora a los vehículos de su propio evento.
- Visibilidad calculada por el solver con geometría compartida con el visor.
- Volcadura como criterio físico en el solver y vueltas ilustrativas en el visor.

### Pendientes declarados

- **Visibilidad:** campo visual del conductor (pilares, espejos) y deslumbramiento.
- **Fase previa:** deslizamiento lateral, para que la volcadura de `volcadura` salga del criterio y no solo del relato.
- **Cinturón:** calibrar holgura y rigidez cuando haya datos accesibles de pruebas.
- **Volcadura 3D:** validarla contra BeamNG (E5, F10).
- **E4:** sumar más casos publicados en cuanto haya conjuntos abiertos más grandes.
- **E6 con margen estrecho:** 61.4 fps en media y 30.3 en alta, contra 60 y 30; la laptop varía ±15 % según su temperatura. Siguientes optimizaciones sin bajar calidad, si una fase nueva lo empuja abajo: LOD de los cuerpos para ocupantes lejanos y fusión de más piezas fijas de los vehículos (el renderer está limitado por CPU por objeto).

### Resumen para René (F5)

Las personas ya son cuerpos articulados de MakeHuman (CC0, sin rasgos de sexo ni etnia, con ropa neutra):

- **Peatones:** caminan y salen proyectados con un ragdoll que cae dentro de los límites de Searle.
- **Ocupantes:** van en su asiento y se mueven en el impacto con aros azules neutros donde tocan el interior.
- **Conductores:** su cámara muestra qué podían ver y qué lo tapaba.
- **Volcadura:** se ve como secuencia ilustrativa.

Para probarlo:

1. Corre `pnpm dev` y abre `/visor?escena=peaton_cruce&camara=persona`; luego cambia a "Vista del conductor A" antes del impacto.
2. Revisa los paneles "Personas" y "Visibilidad".
3. Corre las evaluaciones: `uv run croquis-eval e4-pedestrian` y `pnpm --filter @croquis/eval-js ragdoll`.

No necesito nada nuevo de ti para F5. Lo bloqueado sigue en la tabla de arriba.

## F6 — Comprensión del relato

Criterio de aceptación (PLAN §13): E1 publicado con las tres alternativas (reglas, Haiku, Sonnet); fuga de PII medida; contrafactuales medidos.

### Plan (orden de trabajo)

1. **Glosario de español mexicano** versionado (`extraction/glosario.json`): expresión, variantes, significado y campo del contrato que afecta. Lo usan la línea base de reglas y el prompt.
2. **Redacción de PII local.** Referencia en Python y port TS con paridad, porque corre en el navegador antes de que el texto salga del dispositivo. Cubre nombres (diccionario con fuente), placas mexicanas, teléfonos, correos, CURP/RFC y direcciones con número.
3. **Relatos-MX.** Formato, herramientas y ≥ 300 relatos con su `EscenaSpec` de referencia, distribuidos como los tipos de ATUS:
   - **Relatos:** escritos a mano por el agente (marcados como sintéticos), con variaciones de registro (formal, coloquial, faltas de ortografía, desorden temporal) y contrafactuales de sexo, edad y tipo de vehículo.
   - **Partición y congelamiento:** división dev/test; el test se congela con hash antes de la primera evaluación.
4. **Línea base de reglas:** del relato redactado a una `EscenaSpec` parcial con evidencia literal.
5. **Verificador de evidencia:** todo campo con `fuente: relato` debe citar un fragmento literal; si no, baja a `supuesto`. Mide la tasa de alucinación de campo.
6. **Cliente de Claude:**
   - **Salida y modelos:** salida estructurada contra el esquema; modelo configurable (`claude-sonnet-5-5` por omisión; comparar con `claude-haiku-5-5`).
   - **Respuestas grabadas:** grabación y reproducción, que es lo que usa CI.
   - **Controles:** límite de gasto y medición de costo y latencia.
7. **Preguntas al usuario:**
   - **Contradicciones:** las banderas del solver se convierten en preguntas, no en acusaciones.
   - **Sensibilidad:** el solver muestrea con semilla los campos inciertos y estima cuánto reduce cada respuesta la varianza de la velocidad de impacto y las posiciones finales. Máximo 3 preguntas por ronda.
8. **E1:** F1 por campo, exactitud de categorías, error en numéricos, alucinación de campo, fuga de PII, cobertura de preguntas útiles, costo por 1 000 relatos, latencia p50/p95 y diferencia contrafactual. La línea base se mide ya; Haiku y Sonnet se graban cuando haya llave.
9. **Web:** página del relato con redacción en el navegador, extracción (reglas, o Claude si hay llave), preguntas y paso al croquis y al visor.

Riesgos: sin llave no hay columnas de Claude en E1 (queda bloqueado y documentado). Un benchmark escrito por el propio agente puede favorecer a la línea base de reglas: se mitiga con registros y estructuras variadas y declarándolo en las limitaciones.

### Qué se hizo (F6)

- **Relato en el dispositivo** (`packages/relato`, nuevo paquete `@croquis/relato`):
  - **Redactor y glosario en TypeScript:** port del redactor de datos personales y del glosario, que corren en el navegador antes de que el texto salga.
  - **Datos compartidos con Python:** patrones y pistas en `packages/relato/data/pii.json`. Se usa un subconjunto de regex que se comporta igual en `re.ASCII` y en `RegExp` sin `u`, y los espacios Unicode se normalizan uno a uno.
  - **Paridad:** `croquis-extraction golden build|check` escribe `fixtures/golden.json` (Relatos-MX completo más casos difíciles) y Vitest compara redacción, tramos y glosario en 517 textos.
  - **Cobertura del redactor:** nombres (diccionario de 491 nombres de DataMX, CC0, más pistas de contexto, minúsculas tras "se llama" y correferencia), placas, teléfonos (incluido 3-3-2-2), correos, CURP, RFC y números de domicilio. Los nombres de calles y lugares no se tocan.
- **Glosario de español mexicano** versionado (1.4.0): expresiones con su significado, el campo del contrato que afectan y la pregunta sugerida si son ambiguas ("camión" sin más, "camioneta", "se me cerró", "de noche"…).
- **Extracción:**
  - **Hechos:** representación de hechos con cita (`facts.py`) y constructor determinista de `EscenaSpec` (`spec_builder.py`): lo dicho va como `relato` con su cita literal; lo demás, como `supuesto` o `default`.
  - **Línea base de reglas** (`baseline.py`), ajustada solo con el dev.
  - **Verificador de evidencia** (`verify.py`).
  - **Cliente de Claude** (`claude_client.py`):
    - **Salida:** estructurada (`output_config.format`) sobre un esquema pequeño de hechos, que pasan por el mismo constructor (ADR 0009).
    - **Grabación:** grabación y reproducción por relato, hash del texto y huella del prompt.
    - **Gasto y respaldo:** tope de gasto diario y respaldo ante rechazos del servidor para Sonnet.
    - **Lotes:** `croquis-extraction claude record --split test` graba por lotes cuando haya llave.
- **Preguntas** (`questions.py`), máximo tres por ronda y sin culpa:
  - **Contradicciones:** salen de avisos estructurados que ahora emite el solver (`Reconstruction.avisos`, solo en Python; el resultado no cambia).
  - **Sensibilidad:** varía un campo a la vez con semilla y mide qué parte de la varianza de la velocidad al impacto y de la posición final explica.
  - **Ambigüedad:** sale de las expresiones ambiguas del glosario.
  - **Respuestas:** `apply_answers` las aplica como `fuente: usuario`.
- **Relatos-MX** (`data/relatos-mx`):
  - **Contenido:** 320 relatos sintéticos (160 dev, 160 test), distribuidos como los tipos de ATUS 2025 con mínimos para las categorías raras, en cinco registros, con 82 relatos con PII sintética y 197 variantes contrafactuales.
  - **Autoría y auditoría:** los lotes de test los escribieron agentes que no vieron la línea base, el glosario ni el redactor, y otros agentes los auditaron (52 correcciones) antes de congelar.
  - **Congelamiento:** el test está congelado sobre su contenido fuente (`test.lock`, `3454a815…`): mejorar el constructor no lo rompe.
  - **Licencia:** CC BY 4.0.
  - **Guía de anotación:** en su README.
- **E1** (`eval/croquis_eval/e1_extraction.py`):
  - **Métricas:** F1 por campo con equivalencias de valores genéricos, error de los números, número de vehículos, alucinación de campo antes y después del verificador, diferencia contrafactual, fuga de PII, cobertura de preguntas útiles, latencia y costo.
  - **Claude:** las columnas se miden solas en cuanto haya grabaciones.
- **API** (`services/api`):
  - **`POST /relato/extraer`:** vuelve a redactar en el servidor; usa Claude si hay llave y presupuesto (con límite por hora) y si no, reglas; verifica y devuelve las preguntas.
  - **Otras rutas:** `POST /relato/responder` y `POST /reconstruir`.
  - **CORS:** orígenes configurables.
- **Web** (`/relato`):
  - **Redacción a la vista:** escribes el relato y ves en vivo lo que se enviará, con los datos quitados.
  - **Glosario:** las expresiones ambiguas se marcan.
  - **Resultado:** se muestran los hechos con su fuente y su cita, y las preguntas se contestan ahí mismo.
  - **Croquis:** la escena se abre en `/croquis?fuente=relato` o se descarga.
- **Solver:** avisos estructurados con código y datos para cada bandera (`clase_sin_tabla`, `desvio_lateral`, `zonas_no_se_tocan`, `frenado_sin_distancia`, `frenado_detiene_antes`, `proyeccion_vs_velocidad`, `evento_sin_resolver`, `sin_reposo`, `persona_sin_posicion`, `volcadura_sin_velocidad`, `volcadura_no_mencionada`).

### Evidencia y números medidos (`eval/results/e1_extraction.json`, test congelado de 160 relatos; `e1_extraction_dev.json`, dev)

| Métrica (test congelado)                              | Reglas          | Claude Haiku 5.5 | Claude Sonnet 5.5 |
| ----------------------------------------------------- | --------------- | ---------------- | ----------------- |
| F1 micro / macro                                      | 0.714 / 0.557   | 0.852 / 0.878    | **0.875** / 0.904 |
| Precisión / exhaustividad (micro)                     | 0.816 / 0.635   | 0.901 / 0.808    | 0.898 / 0.853     |
| Número de vehículos exacto                            | 69.4 %          | 92.5 %           | 91.9 %            |
| Citas sin respaldo literal (antes del verificador)    | 0 de 997        | 8 de 1416        | 0 de 1468         |
| Citas sin respaldo tras el verificador                | 0               | 0                | 0                 |
| Diferencia contrafactual / al repetir el mismo relato | 3.8 % / 0.0 %   | 15.6 % / 21.2 %  | 11.2 % / 11.2 %   |
| Preguntas: errores cubiertos / no redundantes         | 32.8 % / 94.7 % | 8.6 % / 92.4 %   | 5.4 % / 92.1 %    |
| Latencia p50 / p95                                    | 2.3 / 4.2 ms    | 10.6 / 14.3 s    | 4.5 / 10.6 s      |
| Costo por 1,000 relatos                               | $0              | $1.31            | $9.96             |

Redactor de PII (común a los tres): **7.3 %** de fuga en el test (8 de 110: 6 NOMBRE, 2 PLACA), 2 tramos de más; en el dev, 0 de 64. Reglas en el dev: F1 micro 0.759.

Grabación de Claude (2026-10-14): 962 respuestas (por modelo, 160 relatos, 160 contrafactuales y 160 repeticiones del test, más una prueba en el dev). Gasto total registrado en `extraction/grabaciones/gasto.json`: **$5.33**, dentro del tope diario.

Lectura honesta:

- **Claude contra reglas:** Claude supera a las reglas en casi todos los campos (zonas de impacto, frenado, velocidad, clima, cinturón, casco, distancias).
- **Clase de vehículo:** es la excepción (F1 0.638 Sonnet, 0.614 Haiku, 0.802 reglas). Con un modelo nombrado ("Aveo", "Jetta"), el prompt v1 no trae la tabla modelo → clase y pide no precisar lo que no se dice, así que Claude omite la clase. Lo vio el coordinador al revisar pares agregados del test; por PLAN §5.2 no se ajustó el prompt contra el test.
- **Diferencia contrafactual:** en Claude es igual o menor que su propia variación al repetir el mismo relato (los modelos 5.5 no aceptan temperatura 0). No hay diferencia atribuible a sexo, edad o vehículo más allá del ruido. En las reglas, que son deterministas, el 3.75 % sí viene del cambio de palabras.
- **Brecha dev–test:** la línea base y el redactor se ajustaron solo con el dev; la brecha frente al test (0 % → 7.3 % de fuga; 0.759 → 0.714 de F1) mide cuánto generalizan. No se miró el contenido de las fugas del test.
- **Lo que vio el coordinador:** leyó los reportes de los auditores, que mencionan detalles de algunos relatos de test; después solo se cambió la línea base con evidencia del dev.
- **Cobertura de preguntas:** es baja con Claude porque sus errores restantes son sobre todo la clase omitida (dato que sí pregunta solo cuando pesa en la física) y valores que el relato dice y la extracción no tomó.
- **Autoría del benchmark:** todo el benchmark lo escribieron modelos; E9 lo contrastará con relatos de personas.

### Dependencias y herramientas (F6)

- **Paquete JS `@croquis/relato`:** sin dependencias nuevas (Vitest y fast-check del catálogo).
- **Python:** `croquis-extraction` ahora depende de `croquis-solver` (preguntas por sensibilidad). `anthropic` 1.13 ya estaba en el stack; la API se verificó con la documentación oficial del SDK.
- **Agentes de redacción y auditoría de Relatos-MX:** subagentes de Claude Code (8 escritores y 4 auditores). Las instrucciones quedaron en el scratchpad de la sesión; sus reglas están en `data/relatos-mx/README.md`.

### Decisiones (ver ADR 0009)

- **Claude produce hechos con cita**, no la `EscenaSpec` completa. El mismo constructor que usan la línea base y la referencia arma la spec; así el modelo nunca produce geometría ni números físicos.
- **Paridad de la redacción por datos compartidos** más salidas doradas, en vez de mantener dos copias de las regex.
- **Congelamiento sobre el contenido fuente**, no sobre la spec construida.
- **Puntuación justa:**
  - lo que la referencia trae como inferencia no castiga a quien lo afirma con el mismo valor;
  - un conductor de otro vehículo no es error;
  - los valores genéricos citados reciben crédito después de precisarse.
- **Caída de pasajero** como `inicio_frenado` o `arrastre`, porque el contrato no tiene un evento propio.

### Pendientes declarados

- **Prompt v2:** agregar la tabla modelo → clase (`modelos.json`) y aclarar que deducir la clase de un modelo nombrado no es adivinar. Se valida en el dev y se mide en el test nuevo de F7 (relatos adaptados de CISS), con su propio candado; el test actual queda con v1.
- **Relatos adaptados de casos CISS** (PLAN §5.2): se agregarán en F7, cuando se ingieran los datos de CISS, como un test aparte con su propio candado (el test actual ya está congelado).
- **Visor con escenas arbitrarias:** hoy la escena del relato se abre en el croquis; para verla en 3D, el visor necesita aceptar una spec y un resultado externos (la API ya tiene `POST /reconstruir`). Queda para F9 (demo y casos precargados), donde el visor deja de depender de las escenas canónicas.
- **Gasto persistente en el despliegue:** el tope se lleva en `extraction/grabaciones/gasto.json`; en F11 pasará a almacenamiento persistente del servidor.
- **Redactor:**
  - nombres comunes que también son palabras ("Rosa" al inicio de una oración);
  - nombres que no están en el diccionario de 2012 (por ejemplo, nombres jóvenes) y aparecen sin pista.

  La fuga del test (7.3 %) es la medida vigente.

- **Línea base:** zonas de impacto (F1 0.42), maniobras (0.57) y frenado (0.58) son los campos más débiles, y el clima (0.49).
- **Voz** (PLAN §5.1, paso 7): fase posterior.

### Resumen para René (F6)

Croquis ya entiende el relato:

1. **Redacción en tu dispositivo:** escribes en `/relato` y los datos personales se quitan en el navegador antes de enviar. Ves exactamente qué sale.
2. **Extracción:** Claude extrae los hechos con su cita literal y un verificador baja a "supuesto" lo que no esté en tu texto.
3. **Preguntas:** se pregunta, como máximo tres veces por ronda y sin culpar, lo que más cambia la reconstrucción.
4. **Croquis:** la escena se abre en el croquis.

En el test congelado de Relatos-MX:

- **Extracción:** Claude Sonnet 5.5 llega a F1 0.875, Haiku 5.5 a 0.852 y las reglas a 0.714.
- **Citas:** ninguna cita sin respaldo pasa el verificador.
- **Costo:** $9.96 por cada 1,000 relatos con Sonnet y $1.31 con Haiku.
- **Sesgo:** cambiar sexo, edad o vehículo no mueve velocidades ni maniobras más de lo que varía el modelo consigo mismo.
- **Datos personales:** el redactor deja pasar 7.3 % (nombres raros y dos placas); es lo más débil y se sigue midiendo.

Para probarlo:

1. Corre `uv run uvicorn croquis_api.main:app --port 8000` (con tu `.env.local` cargado) y `pnpm dev`.
2. Abre `/relato`.
3. Revisa los números con `uv run croquis-eval e1-extraction --split test`.

Gasté $5.33 de la API en grabar E1, dentro del tope que pusiste. No necesito nada nuevo de ti para F6.

## F7 — Inversión, Monte Carlo y consistencia

Criterio de aceptación (PLAN §13): E3 contra EDR y WinSmash; banderas de inconsistencia con pruebas.

### Plan (orden de trabajo)

1. **Ingesta de CISS 2017–2024** (`data/croquis_data/ciss.py`). Descarga los CSV de NHTSA con candado SHA-256 y arma una tabla por vehículo y evento con:
   - perfil de aplastamiento C1–C6, ancho, PDOF, plano CDC y objeto;
   - masa y dimensiones del vehículo;
   - ΔV de WinSmash (`CDC.DVTOTAL/DVLONG/DVLAT`, `DVBASIS`);
   - ΔV del EDR (`EDREVENT.MAXDVLONG/MAXDVLAT`, ligado por `CDCEVENT`);
   - el otro vehículo del evento.
2. **Inversión** (`solver/croquis_solver/inversion.py`, módulo 6.1.10):
   - **ΔV desde el daño:** CRASH3 con rigidez por clase y su dispersión, para choques entre dos vehículos y contra objeto.
   - **Velocidades desde la evidencia:** mínimos cuadrados robustos (SciPy `least_squares` con pérdida `soft_l1`) a partir de daños, posiciones finales, marcas de frenado y distancia de proyección.
   - **Distribución:** se obtiene muestreando las entradas inciertas con semilla.
3. **Monte Carlo** (módulo 6.1.11): muestrea todo campo con rango (masas, velocidades, fricción, frenado, rigidez) con semilla y da percentiles de la velocidad al impacto, ΔV y posiciones finales en el resultado. Cambia `resultado.schema.json` a 1.3.0, con el Zod generado, el panel del visor y las pruebas.
4. **Consistencia** (módulo 6.1.12): banderas cuando lo declarado no cabe en ninguna muestra física (marcas contra velocidad, reposo inalcanzable, proyección contra velocidad, daño contra velocidad), explicadas en lenguaje llano y sin culpa, con una prueba por bandera.
5. **E3** (`eval/croquis_eval/e3_ciss.py`): ΔV de Croquis desde el daño medido contra el ΔV del EDR, comparado con WinSmash contra el EDR. Reporta error absoluto medio, sesgo por rango de ΔV y cobertura del intervalo.
6. **Hipótesis en el visor:** comparar dos escenas (por ejemplo 40 contra 60 km/h) con vehículos fantasma y la diferencia de resultados en un panel.
7. **Pendientes de F6:**
   - **Relatos-MX:** test nuevo adaptado de narrativas públicas de CISS, con su propio candado.
   - **Prompt v2:** con la tabla modelo → clase, validado en el dev y medido en ese test nuevo.

Riesgos:

- **Datos de CISS:** solo una parte de los casos tiene EDR, y su ΔV es longitudinal y lateral por separado y con códigos centinela (888/997). Se filtra y se documenta cada exclusión.
- **Clases de vehículo:** la clasificación de CISS (BODYTYPE) es distinta de la nuestra y hace falta una tabla de correspondencia con fuente.
- **Rendimiento:** Monte Carlo es costoso en la laptop y su número de muestras se elige midiendo el tiempo.

### Hecho

- **CISS 2017–2024** (`data/croquis_data/ciss.py`, `croquis-data ciss download|build [--check]`):
  - CSV oficiales de NHTSA con candado SHA-256 por año, registrados en `data/SOURCES.md`.
  - Tabla por vehículo y evento en `data/processed/ciss/e3_vehiculos.csv` (8,975 filas), con perfil C1–C6, ancho, PDOF, objeto, masa, ΔV de WinSMASH, ΔV del EDR ligado por `CDCEVENT` y el otro vehículo.
  - Las exclusiones se cuentan en `e3_conteos.json`.
- **Inversión** (`solver/croquis_solver/inversion.py`, módulo 6.1.10):
  - **ΔV desde el daño:** CRASH3 con rigidez de NHTSA muestreada por bootstrap (A y B juntas) y error de modelo calibrado en CISS dev.
  - **Velocidades y rumbos desde la evidencia:** posición y rumbo final, marcas de frenado (fijan la distancia de frenado), proyección y daño. Mínimos cuadrados robustos (`soft_l1`) sobre el solver completo.
  - **Identificabilidad por Laplace:** "la evidencia no basta" en vez de un intervalo de los límites de búsqueda; las estimaciones en el límite se marcan.
  - **Distribución:** 12 reestimaciones con semilla por el método de la cuerda, con respaldo de ajuste completo.
- **Monte Carlo** (`montecarlo.py`, 6.1.11): 64 muestras uniformes con semilla y rangos según la fuente del dato. Resultado 1.3.0 con `incertidumbre`; el visor muestra el rango del 80 % bajo cada valor.
- **Consistencia** (`consistency.py`, 6.1.12): seis banderas contra el rango físico, en llano y sin culpa:
  - `detenido_con_velocidad`, `marcas_vs_velocidad`, `proyeccion_vs_velocidad`;
  - `dano_vs_velocidad`, `velocidad_vs_evidencia`, `reposo_inalcanzable`.

  En `/relato` son las primeras preguntas de cada ronda. La evidencia que una bandera ya cubre no se vuelve a preguntar con el aviso del solver.

- **Resultado 1.4.0:** `inversion` y `consistencia`, precalculados en las diez escenas; Zod regenerado. La API acepta `POST /reconstruir {analisis: true}`, con límite propio por hora (`CROQUIS_ANALYSIS_RATE_LIMIT_PER_HOUR`).
- **Visor:**
  - Panel "Lo que dice la evidencia física": evidencia usada, valor de partida contra lo que fija la evidencia, y "Datos que no cuadran".
  - Comparación de hasta tres hipótesis como vehículos fantasma (azul, naranja y violeta) con la diferencia en un panel (PLAN §7.6).
- **E3** (`eval/croquis_eval/e3_ciss.py`): ΔV de Croquis y de WinSMASH contra el EDR. Calibra en 2017–2021 y reporta en 2022–2024, por grupo de plano, contacto y rango de ΔV.
- **F7 en las escenas** (`eval/croquis_eval/f7_inversion.py`): parámetros identificables, banderas, tiempos y el intervalo sin la regla de identificabilidad.
- **Arreglo del solver:** un poste o árbol a muy baja energía disparaba una aserción (energía bajo el umbral de deformación permanente). Se acepta perfil cero y hay prueba de regresión con Hypothesis.
- **Documentación:** `docs/physics.md` §10–§12, ADR 0010 y README (filas y lectura honesta de E3, "Qué hay hoy").

### Evidencia (local, Windows, 2026-10-14)

| Comando                                                         | Resultado                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uv run ruff check .` · `ruff format --check .` · `pyright`     | sin errores                                                                                                                                                                                                                                                      |
| `uv run pytest`                                                 | **436 pruebas** en verde (inversión 19, consistencia 8, Monte Carlo 5, preguntas 12, API 12, objeto fijo con regresión)                                                                                                                                          |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `format:check`   | en verde; **899 pruebas** (relato 547, scene-schema 126, viewer 160, croquis-2d 35, web 24, solver-ts 7)                                                                                                                                                         |
| Playwright (`visor.spec.ts`: hipótesis y volcadura)             | en verde: dos hipótesis se suman y se quitan (fantasmas contados en la escena); la bandera de reposo inalcanzable se ve en la volcadura                                                                                                                          |
| `uv run croquis-solver reconstruct --check`                     | resultados 1.4.0 de las diez escenas al día (con `incertidumbre`, `inversion` y `consistencia`)                                                                                                                                                                  |
| `uv run croquis-eval e3-ciss`                                   | test 2022–2024, 2,205 vehículos: Croquis 11.49 km/h de error medio (WinSMASH 8.19); EDR ≥ 48 km/h: sesgo −3.14 (WinSMASH −14.37); traseros 16.59 (7.26); cobertura p10–p90 81.7 %                                                                                |
| `uv run croquis-eval f7-inversion`                              | en las diez escenas: 3 banderas (2 `velocidad_vs_evidencia`, 1 `reposo_inalcanzable`); sin la regla de identificabilidad, el p10–p90 sale 0.8–200 km/h (poste) y 0.2–200 (árbol); inversión más lenta 38.95 s (glorieta), Monte Carlo 10.16 s (frontal en curva) |
| `uv run croquis-eval e1-extraction --split test` (reproducción) | las preguntas ahora empiezan por la consistencia: cobertura sobre reglas 32.8 % → **33.9 %** (59 de 174); Sonnet y Haiku sin cambio (5.4 % y 8.6 %). README actualizado; la tabla de F6 queda como registro de su commit                                         |

Capturas revisadas (no versionadas): el visor con una hipótesis (fantasmas azules desplazados 4 m del vehículo real, tabla de diferencias) y el panel de evidencia en `peaton_cruce` y `glorieta` (velocidad que fija la evidencia, "la evidencia no basta", estimación en el límite).

Incidente: una corrida local de `pnpm test` falló una vez en `debris.test.ts` (horneado con Rapier, choque de frente) y no se reprodujo en 5 corridas más. Se dio a esas pruebas un límite explícito de 30 s por si fue el de 5 s por omisión. Si reaparece con otro mensaje, se investiga como bug.

### Pendientes registrados

1. **Relatos-MX, segundo test y prompt v2 (pendiente de F6). Hecho el 2026-10-14** (ver "F7 (continuación)" y ADR 0012).
   - **Fuente:** los CSV de CISS no traen narrativas y NHTSA no publica una API documentada para las del Crash Viewer (su API documentada es la de FARS). El test se construirá desde los campos codificados de CISS (maniobra, tipo de choque, superficie, luz, clima, clase): la verdad viene de NHTSA, no del autor de los relatos.
   - **Prompt v2:** con la tabla modelo → clase, validado en dev y medido en ese test nuevo.
2. **Rigidez lateral y trasera desde pruebas de NHTSA** (FMVSS 214 lateral y FMVSS 301 trasera). Es la debilidad medida en E3. No se ajusta con el EDR de CISS para no mezclar validación y calibración. Cambiará resultados y capturas. **Lateral, hecha el 2026-10-15** (ADR 0013); trasera, pendiente de los reportes PDF.
3. **Inercia de guiñada medida** (Heydinger et al., SAE 1999-01-1336) en lugar de la placa uniforme. Cambia todas las trayectorias posteriores al impacto y las capturas.
4. **Marcas de derrape en la inversión.** El contrato no dice si son anteriores o posteriores al impacto; hace falta un campo y una versión del contrato.
5. **Procedencia del rumbo final.** Hoy es parte de la pose declarada. Si E9 muestra que las personas no lo dicen, se separa en el contrato.
6. **Port TS** de inversión, Monte Carlo y las banderas de consistencia que muestrean: F9, con E7. Con la migración (ADR 0011) ya no hay servidor Python al cual llamar.
7. **CMA-ES** si aparecen escenas multimodales; en las diez canónicas el ajuste local converge.

### Decisiones

- ADR 0010: partición por año en E3, rigidez muestreada, inversión sobre el solver completo, identificabilidad explícita, método de la cuerda, consistencia contra rangos, resultado 1.4.0 e hipótesis con fantasmas.
- La rigidez lateral y trasera se queda como `supuesto` hasta tener una fuente física. No se calibra con el EDR.
- Las hipótesis se reconstruyen en el servidor. En la demo sin red llegarán con el port TS (F9). **Actualizado por la migración (ADR 0011):** ahora se reconstruyen en el navegador, en un Web Worker con el solver TS.

### Resumen para René (F7)

Croquis ya no da un solo número cuando no lo sabe:

1. **Rangos:** cada velocidad, ΔV y posición final trae el intervalo del 80 % (Monte Carlo con semilla).
2. **Lo que dice la evidencia:** con posiciones finales, marcas de frenado, distancia de proyección o daño, Croquis busca las velocidades y direcciones con las que el solver la reproduce. Cuando la evidencia no basta (por ejemplo, contra un poste), lo dice en vez de inventar un intervalo.
3. **Datos que no cuadran:** se marcan en lenguaje llano, sin culpar, y en `/relato` se convierten en preguntas. Ejemplo: en el cruce peatonal, las marcas y la distancia de proyección piden 51–56 km/h y el relato dice "como a 40".
4. **Hipótesis:** en `/visor`, "¿y si iba a 60?" dibuja la otra reconstrucción como fantasma de color (hasta tres) y compara velocidades, ΔV y posición final.

E3 con 2,205 casos reales de NHTSA (2022–2024):

- **En conjunto:** Croquis estima el ΔV con 11.49 km/h de error medio, contra 8.19 de WinSMASH (la herramienta de NHTSA).
- **Choques fuertes:** Croquis tiene mucho menos sesgo (−3.14 contra −14.37 km/h).
- **Traseros:** son su punto débil, porque no hay rigidez medida para atrás ni para los lados.
- **Intervalo:** cubre el 81.7 % de los casos.

Cómo probarlo:

- **Visor:** `pnpm --filter @croquis/web dev` y abre `/visor?escena=peaton_cruce`. Mira el panel "Lo que dice la evidencia física".
- **Hipótesis:** necesitan la API corriendo (`uv run uvicorn croquis_api.main:app`).

Qué necesito de ti: nada nuevo. Siguen pendientes AWS y Vercel, BeamNG y las personas para E9.

## Migración a Vercel solo (decisión de René, 2026-10-14)

Despliegue solo en Vercel: la web y la API van juntas como Route Handlers de Next.js, sin AWS, CDK ni FastAPI, y en producción no corre Python (`CLAUDE.md` y `PLAN.md` nuevos). El solver Python y la extracción Python quedan como referencia para pruebas, paridad y evaluaciones.

René eligió portar ya el núcleo del solver a TS, para que nada deje de funcionar en Vercel: las preguntas por sensibilidad y las contradicciones de `/relato`, y las hipótesis del visor. La inversión y Monte Carlo en TS siguen en F9, como él pidió. Las banderas de consistencia que dependen de ellos (daño contra velocidad, reposo inalcanzable y velocidad contra evidencia) llegan a TS con ese port.

### Plan (orden de trabajo)

1. **Hecho:** `CLAUDE.md` y `PLAN.md` nuevos; `packages/relato` pasa a `packages/extraction` (`@croquis/extraction`).
2. **`packages/extraction` en TS:**
   - Hechos, constructor de `EscenaSpec`, verificador de evidencia, línea base de reglas y conversión de la salida de Claude.
   - Cliente de Claude con salida estructurada. Reproduce las grabaciones existentes, con la misma huella de prompt que Python.
   - Tope de gasto detrás de una interfaz: archivo en local y Upstash Redis en Vercel. Conectar Upstash requiere la cuenta de René.
   - **Paridad:** salidas doradas de Python sobre todo Relatos-MX (reglas y respuestas grabadas de Haiku y Sonnet), comparadas en Vitest sin llamar a la API.
3. **Núcleo del solver en `packages/solver-ts`:** todo lo que usa `reconstruct` (pre-impacto, impulso, CRASH3, objeto fijo, post-impacto, contacto, vía, objetos, personas, ocupantes, visibilidad y volcadura). Paridad E7 contra los resultados de las 10 escenas canónicas, con tolerancia documentada.
4. **Preguntas en TS:**
   - Contradicciones por los avisos del solver, sensibilidad con Mersenne Twister idéntico al `random` de Python, glosario, banderas de consistencia que no dependen de inversión ni Monte Carlo, y aplicación de respuestas.
   - **Paridad:** contra Python con el mismo conjunto de banderas.
5. **Route Handlers:**
   - `apps/web/src/app/api/relato/extraer` (con streaming) y `/api/relato/responder`, con límite de peticiones (Upstash en Vercel, memoria en local).
   - Las hipótesis del visor se reconstruyen en el navegador con solver-ts en un Web Worker.
6. **Evaluaciones:** E1 mide el pipeline TS desde Node (Python solo puntúa) y debe dar los mismos números. Si no, se depura. El test congelado no se toca.
7. **Limpieza:** se borran `services/api`, `infra/` y lo de AWS; se actualizan CI, `.env.example`, la documentación y ADR 0011 (Vercel solo); merge con todo en verde y regreso a F7.

Riesgos:

- **Regex Python contra JS:** `\b`, `\w` y lookbehind se comportan distinto. Se mitiga trabajando sobre el texto plegado y con la paridad dorada.
- **Posiciones:** Python cuenta puntos de código y JS unidades UTF-16. Se convierten al escribir la evidencia.
- **Paridad numérica del solver:** `Math` de V8 contra `libm`, que se amplifica en el contacto iterativo. La tolerancia se documenta en E7.

### Hecho

Los siete pasos del plan están terminados, y están en ADR 0011.

- **`packages/extraction` (TS):**
  - Hechos, constructor, verificador, línea base de reglas, conversión de la salida de Claude y preguntas, con paridad exacta contra Python sin llamar a la API.
  - Del lado del servidor: Claude con streaming, grabaciones, tope de gasto (Upstash o `gasto.json`) y límite de peticiones (Upstash o memoria).
  - El prompt y las grabaciones se mudaron al paquete; la huella del prompt no cambió y todas las grabaciones siguen valiendo.
- **`packages/solver-ts`:**
  - Núcleo completo del solver con paridad E7 en las diez escenas.
  - Aritmética con la semántica de CPython (`pymath`: suma compensada, redondeo al par, `%`, `radians`/`degrees`, `isclose`, `pvariance` exacta) y el Mersenne Twister de Python (`pyrandom`), todo contra valores que escribió CPython.
- **Banderas en TS:** las tres banderas de consistencia que no muestrean. Las otras llegan en F9 con la inversión y Monte Carlo.
- **Route Handlers:** `POST /api/relato/extraer` (NDJSON en streaming) y `POST /api/relato/responder`. La página del relato muestra el avance mientras Claude escribe.
- **Visor:** las hipótesis se reconstruyen en un Web Worker con el solver TS.
- **E1:** mide el pipeline TS (`scripts/e1-predict.ts`). `--pipeline py` puntúa la referencia.
- **Limpieza:** se borró `services/api` (FastAPI) y lo de AWS. Se actualizaron `.env.example` (Upstash), CI (verificación de los módulos generados de prompts y tablas del solver), README, ADR 0001, 0002 y 0011, y `docs/responsible-ai.md`.
- **Bug de la referencia encontrado por el port:** con la normal del impacto tomada de la velocidad relativa, el signo del ruido de redondeo de v_t decidía la fricción del contacto. Dos normales a un bit de distancia daban 15 540 J o 27 568 J disipados. Los dos solvers tratan ahora |v_t| ≤ 1e−9·|v_n| como cero. Hay prueba de regresión con el caso real, que falla sin el arreglo, y los resultados canónicos no cambian.

### Evidencia (local, Windows, 2026-10-14)

| Comando                                                                 | Resultado                                                                                                                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @croquis/extraction test`                                | paridad del pipeline en todo Relatos-MX (reglas, Haiku, Sonnet; con control negativo), huella del prompt idéntica, 70 rondas de preguntas idénticas, servidor con dobles del SDK |
| `pnpm --filter @croquis/solver-ts test`                                 | E7 en las diez escenas con la tolerancia de `reconstruct --check` (con control negativo), aritmética de CPython bit a bit                                                        |
| `pnpm --filter @croquis/solver-ts e7`                                   | 61,888 números comparados; diferencia máxima 4.3e-5 (un impulso en N·s); 0 diferencias de estructura o texto (`eval/results/e7_parity.json`)                                     |
| `uv run croquis-eval e1-extraction --split test` (TS) y `--pipeline py` | métricas idénticas salvo la latencia de las reglas (0.85 ms p50 en TS, 2.56 ms en Python); idénticas también a las publicadas antes de la migración, así que E1 sigue vigente    |
| Playwright `relato` e `hipótesis`                                       | en verde sobre el build de producción; el Web Worker del solver funciona con Turbopack                                                                                           |

### Pendientes registrados

1. **Análisis bajo pedido** (`/reconstruir {analisis: true}`, de F7): se fue con FastAPI y vuelve con la inversión y Monte Carlo en TS (F9). Los resultados de las escenas canónicas los siguen trayendo precalculados.
2. **Banderas que muestrean en TS** (daño, reposo, velocidad contra evidencia): F9. En el test de E1 no cambian ninguna métrica.
3. **Vercel:** René tiene que conectar el repo, configurar las variables (`ANTHROPIC_API_KEY`, el tope y las de Upstash) y elegir el plan. Sin Upstash, en producción solo responde la línea base de reglas.

## F7 (continuación) — Relatos-MX: test CISS y prompt v2

Rama `feat/f7-relatos-ciss`. Es el pendiente 1 de F7. La migración a Vercel ya se fusionó (PR #10).

### Plan

1. **Fichas desde CISS** (`data/croquis_data/ciss_relatos.py`, `croquis-data ciss relatos [--check]`):
   - Selección con semilla y por estratos de los casos 2017–2024, para que los tipos se parezcan a la distribución de ATUS.
   - Cada código de NHTSA se traduce al vocabulario del contrato, usando las etiquetas oficiales de `FORMAT24.sas`, que viene en el mismo zip, y el manual (DOT HS 813 771).
   - Lo que se traduce: ambiente (WEATHER, LIGHTCOND, SURFCOND, SURFTYPE), vía (ALIGNMENT, RELJCT2, TYP_INT), control (TRAFCONT), maniobra (PREMOVE), frenado (MANEUVER), clase (BODYTYPE con largo), zonas (GAD del primer evento), tipo y objeto (EVENT) y la velocidad antes del choque del EDR (EDRPRECRASH, código 1010).
   - Un código sin equivalente exacto deja el campo fuera de la ficha, con cada exclusión contada.
   - Salida: `data/relatos-mx/ciss/fichas.jsonl` y conteos.
2. **Relatos escritos desde las fichas:**
   - Los escriben agentes que no vieron la línea base de reglas, con los cinco registros y PII sintética.
   - Quien escribe solo pone el texto y las citas: `relatos check` exige que los hechos anotados sean exactamente los de la ficha.
   - Un segundo agente, independiente, revisa que el texto no afirme hechos fuera de la ficha.
3. **Partición `ciss` en Relatos-MX:** `fuente/ciss-*.toml`, `build/ciss.jsonl` y su propio candado `ciss.lock`. Se congela antes de la primera evaluación. El test actual no se toca: su hash solo cubre la partición `test`.
4. **E1 con `--split ciss`** sobre el pipeline TS: reglas, y Haiku y Sonnet con prompt v1 (grabaciones nuevas, dentro del tope diario).
5. **Prompt v2:** la tabla modelo → clase; se valida en dev y se mide en `ciss`.

Riesgos:

- **CISS es de EE. UU. y solo de vehículos de pasajeros remolcados.** Los relatos se adaptan a México (km/h, vías y modelos que circulan aquí) y la distribución de tipos no puede ser la de ATUS en todo: casi no hay motocicletas. Lo que no se pueda se documenta.
- **Velocidad narrada:** la gente redondea. La ficha guarda el valor del EDR y la velocidad narrada redondeada a 5 km/h, que es la verdad de la extracción. El error contra el EDR se reporta aparte.

### Avance (2026-10-14)

1. **Fichas, hecho.** `croquis-data ciss relatos`, con pruebas sintéticas de cada traducción, exclusión, clase y acoplamiento. Al escribir y revisar salieron cuatro reglas que se aplicaron al generador y a todos los relatos (ADR 0012 §9):
   - clase del relato aparte de la de E3: carrocería que decide sola, VPIC y `modelos.json` coinciden;
   - tamaño dicho en el texto cuando el modelo no está en la tabla;
   - hechos que van juntos (velocidad 0 con detenido; dispositivo del cruce con su tipo, también en 'Intersection-Related');
   - el ciclista en su bicicleta, como choque entre vehículos.
2. **Relatos, hecho.** Los 150 pasaron por cuatro etapas:
   - escritos por seis agentes que no vieron la línea base;
   - revisados por otros seis;
   - editados para decir el tamaño y los cruces acoplados;
   - validados por la verificación contra la ficha, el esquema y el validador semántico.
     Se leyó una muestra antes de congelar.
3. **Partición `ciss`, congelada** (`ciss.lock`, `bd16632a…`). `test.lock` sigue intacto. Las salidas doradas incluyen los relatos CISS y la paridad TS pasa en reglas y redacción.
4. **Prompt v2, hecho.** Tiene versión propia en Python y TS, con huellas, paridad y grabaciones en `grabaciones/extraccion_v2/`.
   - **Grabaciones:** v1 y v2 en dev y en `ciss`, con Haiku y Sonnet. Las repeticiones van en todo, salvo v1 en dev (abajo). El libro de gasto registra $18.57 en el día (`grabaciones/gasto.json`), dentro del tope de $20.
   - **Libro de gasto seguro para grabadores en paralelo:** usa candado y escritura atómica. En Windows, abrir un candado que otro está borrando da `PermissionError`; ahora se reintenta, y lo prueba un caso propio.
5. **E1 medido.** El orden fue: dev con v1 y v2, decisión, y después `ciss`.
6. **v2 a producción** (`PROMPT_VERSION` en Python y TS, ADR 0012 §10). Los resultados sin sufijo siguen siendo de v1.

### Evidencia y números medidos (`eval/results/e1_extraction_dev*.json`, `e1_extraction_ciss*.json`)

| Medida                                                  | v1            | v2                |
| ------------------------------------------------------- | ------------- | ----------------- |
| Dev, F1 micro Sonnet / Haiku                            | 0.895 / 0.872 | **0.937 / 0.918** |
| Dev, clase Sonnet / Haiku                               | 0.638 / 0.662 | 0.944 / 0.932     |
| `ciss`, F1 micro Sonnet / Haiku                         | 0.978 / 0.968 | **0.993 / 0.986** |
| `ciss`, clase Sonnet / Haiku                            | 0.851 / 0.819 | 0.975 / 0.942     |
| `ciss`, repetir el mismo relato (de 150) Sonnet / Haiku | 0 / 5         | 1 / 5             |
| `ciss`, costo por 1,000 relatos Sonnet / Haiku          | $8.42 / $0.99 | $9.42 / $1.05     |

- **Reglas en `ciss`:** F1 0.690, clase 0.514, vehículos exactos 53.3 %.
- **Fuga del redactor:** 2 de 163 datos personales (1.2 %), los dos nombres.
- **Velocidad contra el EDR:** de 113 relatos con velocidad, Claude la extrae en todos, con 1.47 km/h de error medio contra el EDR, igual al piso del redondeo a 5 km/h. Las reglas la extraen en 104, con 3.09 km/h.
- **Suites, local:**
  - Python: ruff, pyright y pytest en verde.
  - TS: format, lint, typecheck, tests (782 en extraction) y build en verde.
  - Al día: los `generate:check`, `golden check`, `relatos check` (los dos candados intactos) y `ciss relatos --check`.

### Pendientes registrados (de esta rama)

1. **v2 en el primer test.** Faltan sus grabaciones de relatos, contrafactuales y repeticiones con los dos modelos. Sirve para la continuidad de la fila de E1, no para decidir: en ese test se descubrió el problema de la clase.
2. **Repeticiones de v1 en dev.** Faltaron por el tope del día. La decisión no las necesitó: el ruido se comparó en `ciss`.
3. **Clase de E3 y clase del relato.** E3 agrupa la carrocería 14 de CISS (SUV compacta) por su código y el test CISS la separa por largo. No cambia E3 (la clase solo elige rigidez), pero conviene unificarlas cuando se revise la rigidez (pendiente 2 de F7).

### Resumen para René (F7, test CISS y prompt v2)

1. **Un test cuya verdad no escribí yo.** Son 150 relatos nuevos. Los hechos salen de los campos codificados de 150 choques reales de NHTSA CISS 2024, y la velocidad, del EDR del vehículo. Otros agentes escribieron el texto; el sistema rechaza un relato si sus hechos no son exactamente los de NHTSA.
2. **El problema de la clase quedó resuelto.** Claude omitía la clase cuando el relato solo nombraba el modelo ("mi Aveo"). El prompt v2 le da la tabla de modelos. Se probó primero en dev y después en el test nuevo:
   - clase con Sonnet, de 0.851 a 0.975;
   - F1 general, de 0.978 a 0.993.
     Ya es el prompt de producción.
3. **Velocidad:** Claude extrae la velocidad narrada sin error. Contra el EDR queda a 1.47 km/h, que es justo lo que se pierde al redondear a 5 km/h como lo diría una persona.

Cómo probarlo:

- `uv run croquis-eval e1-extraction --split ciss` reproduce los números desde las respuestas grabadas, sin gastar.
- `uv run croquis-extraction relatos check` verifica que los dos tests congelados siguen intactos.

Qué necesito de ti: nada nuevo. El gasto en Claude del día fue $18.57 de los $20 del tope. Siguen pendientes Vercel y Upstash, BeamNG y las personas para E9.

## F7 (continuación) — Rigidez lateral (pendiente 2)

Rama `feat/f7-rigidez-lateral`. ADR 0013.

### Plan

1. **Bajar las pruebas `ITV`** de la Vehicle Crash Test Database (impactor contra vehículo): `croquis-data nhtsa download|process --config ITV`.
2. **Derivar la rigidez con la inversa exacta del cálculo del solver** (`eval/croquis_eval/e2_mdb.py`, `croquis-eval e2-mdb`):
   - momento en 1-D con restitución cero;
   - CRASH3 con corrección por PDOF;
   - forma de WinSMASH con el $d_0$ de NHTSA.
3. **Escribir las zonas en `stiffness_classes.json`** sin pisar la frontal, en cualquier orden.
4. **Validar con E3** (test 2022–2024, que no ajusta nada); regenerar escenas canónicas, tablas del port TS y E7.

Riesgo: la API no trae el aplastamiento de la cara de la barrera deformable, así que la parte de energía que absorbe necesita una fuente.

### Hecho

1. **Datos:** 2,517 pruebas ITV (`data/processed/nhtsa/itv_tests.csv`; crudos en `data/raw/nhtsa/itv/`, no versionados). Quedan 1,265 pruebas laterales de FMVSS 214 y NCAP en 8 clases; los conteos de cada filtro están en `e2_mdb.json`.
2. **Método:**
   - la barrera se lleva el 13.6 % de la energía (Johnson 2011, 70 pruebas con el aplastamiento de la cara medido; NHTSA supone 5 %, y como sensibilidad se reportan esos coeficientes);
   - $d_0 = 63.3\ \sqrt{N}$ de NHTSA;
   - una prueba unitaria verifica que el solver reproduce el ΔV de cada prueba con su propia rigidez.
3. **Equilibrio de fuerzas, descartado antes de mirar E3:** daba a la barrera 54 % de la energía, incompatible con lo medido.
4. **La tabla de rigidez la escriben `e2-barrier` y `e2-mdb`;** una prueba exige que salga idéntica desde los CSV en los dos órdenes.
5. **Regenerados:**
   - E3 (σ recalibrado en dev a 0.4658);
   - las escenas `glorieta`, `lateral_interseccion`, `motociclista` y `volcadura`;
   - las tablas del port TS y E7.

   F7 en las escenas no cambia, salvo los tiempos.

### Evidencia (local, Windows, 2026-10-15)

| Comando                                        | Resultado                                                                                                                                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uv run croquis-eval e2-mdb`                   | 1,265 pruebas laterales; dejar uno fuera: ΔV con error medio 6.19 km/h, contra 14.95 con el respaldo genérico                                                                                                                                       |
| `uv run croquis-eval e3-ciss` (test 2022–2024) | costados 11.04 → **8.51 km/h** (sesgo +6.26 → +2.44; ±10 km/h 56.3 % → 69.2 %; WinSMASH 7.32); conjunto 11.49 → **10.30** (WinSMASH 8.19); EDR ≥ 48 km/h 19.56 → 19.94 (sesgo −3.14 → −5.19); traseros sin cambio (16.45); cobertura p10–p90 82.0 % |
| `pnpm --filter @croquis/solver-ts e7`          | 61,888 números, diferencia máxima 4.3e-5, 0 diferencias de estructura                                                                                                                                                                               |
| suites                                         | ruff, pyright, pytest (455 en verde; las salidas doradas de extracción fallan solo en local, por las grabaciones sin versionar de la otra rama), format, lint, typecheck, tests TS, `generate:check`, build                                         |

- **La tabla en el navegador:** crece a ~170 KB y queda en un fragmento de 104 KB del worker del solver. El worker solo se crea con la primera hipótesis, así que la carga inicial de E6 no cambia.

### Pendientes

1. **Rigidez trasera desde los reportes PDF de FMVSS 301** (siguiente paso).
   - La API trae 170 pruebas desde 2007 sin masa, largo ni perfil del vehículo. Las completas son de modelos 1978–1994, y desde 1995 solo hay 8.
   - Cada prueba tiene un reporte PDF (~5 MB) con el peso de prueba, la masa de la barrera, la velocidad medida y el aplastamiento en tres puntos (izquierda, centro, derecha). Ejemplo: prueba 9643, Acura RDX 2008, 1,983.5 kg, barrera de 1,357.5 kg a 79.44 km/h, aplastamiento 384/418/311 mm.
   - Plan: bajar los reportes, extraer esos campos con un lector por laboratorio, validar contra la API donde coincidan, y aplicar el mismo método (la barrera deformable de la trasera se lleva la fracción medida en costados, como supuesto declarado).
2. **Fracción de la barrera por prueba:** hoy es un promedio. Si en algún momento la API o los reportes dan el aplastamiento de la cara, puede salir de cada prueba.
3. **Unificar la clase de E3 con la del test CISS** (carrocería 14 de CISS), como se anotó en el pendiente 3 del test CISS.

### Resumen para René (F7, rigidez lateral)

Los costados ya no usan una rigidez inventada. Sale de 1,265 choques de prueba de NHTSA contra el costado (FMVSS 214 y NCAP), con un método que reproduce cada prueba.

Contra lo que registraron los EDR de choques reales (CISS 2022–2024, que no se usó para ajustar nada):

- en costados, Croquis se equivoca 8.51 km/h en promedio, antes 11.04; WinSMASH, la herramienta de NHTSA, 7.32;
- en conjunto, 10.30 contra 11.49 antes;
- en los choques más fuertes empeoró un poco, y los traseros siguen igual.

La parte trasera es lo siguiente. Los datos modernos están en los reportes PDF de NHTSA y hay que leerlos uno por uno.

Cómo probarlo: `uv run croquis-eval e2-mdb` y `uv run croquis-eval e3-ciss` reproducen los números desde los CSV versionados.

Qué necesito de ti: nada nuevo.
