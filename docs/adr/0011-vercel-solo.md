# ADR 0011 — Despliegue solo en Vercel: pipeline del relato y solver en TypeScript

- **Estado:** aceptado (2026-10-14; decisión de René, migración en `feat/vercel-only`)
- **Contexto:** PLAN y CLAUDE.md cambian el despliegue: la web y la API van juntas en Vercel (Route Handlers de Next.js), sin AWS, CDK ni FastAPI, y en producción no corre Python. Antes de la migración, `/relato` dependía de FastAPI (`services/api`) para extraer, preguntar y reconstruir, y el visor reconstruía las hipótesis en el servidor.

## Decisiones

1. **El pipeline del relato pasa a TypeScript** (`packages/extraction`, `@croquis/extraction`):
   - redactor, glosario, hechos, constructor de `EscenaSpec`, verificador, línea base de reglas, conversión de la salida de Claude, preguntas y aplicación de respuestas;
   - entrada aparte `@croquis/extraction/server` (solo servidor): llamada a Claude con streaming, grabaciones, tope de gasto y límite de peticiones.
   - La referencia Python (`extraction/`) se queda, como `solver/`, para pruebas, paridad y evaluaciones; no se despliega.
2. **Paridad exacta con la referencia, sin llamar a la API.** Python escribe salidas doradas y Vitest las compara:
   - `pipeline.golden.json`: todo Relatos-MX (517 specs de reglas y 962 respuestas grabadas de Haiku y Sonnet). Spec, cuentas de la conversión y verificador idénticos, con la misma huella de prompt.
   - `questions.golden.json`: 70 rondas de preguntas (las 10 escenas y una muestra de Relatos-MX).
   - Para lograrla, el port reproduce la semántica de Python donde JS difiere: regex con `\w`, `\d` y `\b` Unicode y el `$` de Python (`pyre.ts`); posiciones en puntos de código; `json.dumps(sort_keys=True)` con `ensure_ascii`; `round` al par, `sum` compensada, `%` con el signo del divisor, `math.radians` y `math.degrees`; `random.Random` (Mersenne Twister con `init_by_array`) y `statistics.pvariance` exacta.
3. **El núcleo del solver pasa a TypeScript ahora** (`packages/solver-ts`). René eligió adelantarlo para que nada dejara de funcionar en Vercel (las preguntas por sensibilidad y las hipótesis reconstruyen la escena).
   - **Alcance:** todo lo que usa `reconstruct` (pre-impacto, impulso, CRASH3, objeto fijo, post-impacto, contacto, vía, objetos, personas, ocupantes, visibilidad y volcadura).
   - **E7** (`pnpm --filter @croquis/solver-ts e7` → `eval/results/e7_parity.json`): la paridad se mide en las diez escenas.
   - **F9:** la inversión, Monte Carlo y las banderas de consistencia que muestrean (daño, reposo, velocidad contra evidencia) siguen en F9, como pidió René. Mientras, la ronda de preguntas TS equivale a la de Python con `sampled=False`. En el test congelado de E1 eso no cambia ninguna métrica: se midió con los dos pipelines.
4. **Route Handlers** en `apps/web/src/app/api/relato/`:
   - `extraer` responde NDJSON en streaming (inicio, progreso mientras Claude escribe, resultado), con `maxDuration = 120`;
   - `responder` responde JSON, con `maxDuration = 60`.
   - Se verificó contra la documentación de Vercel (actualizada el 2026-08-24): con Fluid compute, Hobby permite hasta 300 s, y para respuestas largas sobre HTTP/1.1 recomiendan transmitir progreso.
5. **Tope de gasto y límite de peticiones con Upstash Redis** (Marketplace de Vercel). Sin Upstash, en Vercel no hay dónde llevar el gasto: Claude queda apagado y responde la línea base de reglas, con el motivo visible. En local, el gasto se lleva en `packages/extraction/grabaciones/gasto.json`, el mismo libro que la referencia Python. Conectar Upstash requiere la cuenta de Vercel de René.
6. **Hipótesis del visor en el navegador:** el solver TS corre en un Web Worker (`apps/web/src/workers/reconstruct.worker.ts`), sin servidor.
7. **E1 mide el pipeline TS:** `scripts/e1-predict.ts` produce los registros en Node y `croquis-eval e1-extraction` solo puntúa. `--pipeline py` puntúa la referencia con el mismo código. En el test congelado las métricas coinciden salvo la latencia de las reglas, que no se publica.
8. **Se borran** `services/api` (FastAPI) y las referencias a AWS y CDK. El directorio `infra/` nunca llegó a tener código.

## Consecuencias

- **Bug de la referencia encontrado por el port:** con la normal del impacto tomada de la velocidad relativa, la velocidad tangencial era ruido de redondeo (~1e−16) y su signo decidía la dirección de la fricción del contacto. Dos normales a un bit de distancia disipaban 15 540 J o 27 568 J. Los dos solvers tratan ahora |v_t| ≤ 1e−9·|v_n| como cero. Hay prueba de regresión con el caso real, y los resultados canónicos no cambian.
- **Análisis bajo pedido:** `POST /reconstruir {analisis: true}` (Monte Carlo, inversión y consistencia por petición, de F7) se fue con FastAPI. Vuelve cuando esos módulos lleguen al solver TS en F9. Los resultados de las escenas canónicas los siguen trayendo precalculados.
- **Posiciones del glosario:** en la respuesta de `/api/relato/extraer` ahora van en unidades UTF-16, que es lo que usa el navegador para resaltar. La referencia Python las daba en puntos de código, lo que fallaba con emojis.
- **Lo que Vercel necesita de René:** conectar el repositorio, configurar las variables de entorno (`ANTHROPIC_API_KEY`, el tope y las de Upstash) y elegir el plan. Mientras tanto todo corre en local.
