# Bitácora de Croquis

Este archivo permite que cualquier sesión retome el trabajo sin contexto previo.
Reglas de trabajo: `CLAUDE.md`. Especificación: `PLAN.md`.

## Estado actual

- **Fase actual:** F3 — Visor base (cerrando: PR #5 de `feat/f3-visor`, falta CI verde y merge).
- **Siguiente paso concreto:** merge del PR #5 y arrancar **F4 — Daño** (PLAN §7.3: deformación desde el perfil C1–C6 del solver sobre las piezas nombradas de los vehículos procedurales, vidrios, piezas desprendidas, transferencia de pintura, bolsas de aire y marcas en el piso; prueba numérica de que el perfil del visor coincide con el del solver).
- **F0** cerrado el 2026-10-10 (PR #1), **F1** el 2026-10-10 (PR #3), **F2** el 2026-10-13 (PR #4).

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
