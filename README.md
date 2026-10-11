# Croquis

> Reconstrucción 3D de percances viales a partir del relato de quien los vivió.
> **Reconstrucción ilustrativa. No es un peritaje, una prueba legal ni un dictamen de responsabilidad.**

Croquis toma lo que una persona cuenta ("iba por Tollocan, el de la camioneta gris se me cerró…"), lo convierte con un LLM en una escena estructurada donde cada dato está ligado a la frase que lo respalda o marcado como supuesto, lo deja corregir en un croquis 2D, reconstruye la física con un solver propio y lo muestra en 3D en el navegador. **La IA traduce, la física decide y el visor muestra.**

Estado: **F1 — Contrato y croquis** (ver `docs/PROGRESS.md`). Este README se completa fase por fase siguiendo el estándar de PLAN §15; toda cifra que aparece aquí sale de un script en `eval/` con su salida en `eval/results/`.

## Problema

Cifras calculadas desde los datos abiertos de INEGI ATUS 1997–2025 con `uv run croquis-eval atus-summary` (fuente y definiciones en `data/SOURCES.md`; salida en [`eval/results/atus_summary.json`](eval/results/atus_summary.json)).

| Indicador (zonas urbanas y suburbanas de México) |    2024 |    2025 |   Cambio |
| ------------------------------------------------ | ------: | ------: | -------: |
| Accidentes de tránsito registrados               | 374,949 | 380,391 |  +1.45 % |
| Personas fallecidas en el lugar                  |   4,656 |   4,571 |  −1.83 % |
| Personas heridas                                 |  85,980 |  86,956 |  +1.14 % |
| Colisiones con motocicleta                       |  61,869 |  68,505 | +10.73 % |
| Volcaduras                                       |  13,371 |  15,412 | +15.26 % |
| Peatones fallecidos en el lugar                  |     901 |     776 | −13.87 % |
| Pasajeros fallecidos en el lugar                 |     972 |   1,004 |  +3.29 % |

- En 2025 el **Estado de México** fue la entidad con más personas fallecidas en el lugar (460, con 25,032 accidentes), seguido de Jalisco (391), Puebla (291), Chihuahua (271) y Ciudad de México (269).
- Distribución por tipo en 2025: colisión con vehículo automotor 58.4 %, con motocicleta 18.0 %, con objeto fijo 11.4 %, volcadura 4.1 %, con peatón 2.8 %, salida del camino 2.6 %, con ciclista 1.1 %. Esta distribución guía la composición del benchmark Relatos-MX (F6).
- El total de 2021 recalculado desde el archivo (340,415) coincide con la cifra publicada por el INEGI que citaba el plan.

Después de un percance, quien lo vivió tiene que explicarlo (a su aseguradora, al ajustador, al otro conductor, a su familia) con palabras y, a lo mucho, un croquis a mano. Las herramientas profesionales de reconstrucción son caras, cerradas y para peritos; las animaciones genéricas no respetan la física.

## Qué hay hoy

- **El contrato `EscenaSpec` v1** (`packages/scene-schema/escena.schema.json`): cada dato lleva `fuente` (relato, usuario, supuesto o default), `confianza` y el fragmento literal del relato que lo respalda. Zod y Pydantic se generan desde el esquema y CI verifica que estén al día.
- **Diez escenas canónicas** con relato (alcance, lateral en intersección, frontal en curva, peatón en cruce, motociclista, árbol, poste, volcadura, nocturno con lluvia, glorieta) que validan en TypeScript y en Python.
- **Un validador semántico** con paridad TS ↔ Python: referencias rotas, evidencia faltante, rangos declarados, masas y dimensiones fuera de la clase (tabla construida desde 47 fichas técnicas), velocidades implausibles, vehículos encimados, roles y eventos incoherentes. Los mensajes nunca asignan culpa.
- **El croquis 2D** (`/croquis`): arrastra y gira vehículos, personas, objetos y marcas; el JSON y el dibujo son la misma escena y lo que la persona mueve queda marcado como suyo.

## Cómo probarlo

### En local (Windows, PowerShell)

Requisitos: Node 24, pnpm 12, Python 3.14 y uv 0.13 (ver `docs/adr/0001-stack.md`).

```powershell
pnpm install
uv sync --all-packages --all-groups
pnpm dev            # web en http://localhost:3000 (croquis en /croquis)
uv run pytest       # pruebas Python
pnpm test           # pruebas TypeScript
pnpm --filter @croquis/web test:e2e   # Playwright (requiere `playwright install chromium`)
```

### En vivo

Pendiente de F11 (despliegue dev y prod).

## Resultados medidos

Pendiente. Tabla E1–E9 con enlaces a `eval/results/` conforme se corra cada evaluación (PLAN §8).

## Mapa del repo

Ver PLAN §3.2. Resumen: `apps/web` (Next.js), `packages/scene-schema` (contrato, generadores, fixtures, validador), `packages/croquis-2d` (editor 2D), `packages/solver-ts` y `packages/viewer` (en fases siguientes), `services/api` (FastAPI), `solver` (referencia Python), `extraction` (comprensión del relato), `data` y `eval` (datos y evidencia), `assets`, `infra`, `docs`.

## Datos, licencias e IA responsable

- `data/SOURCES.md` y `assets/ASSETS.md` registran origen y licencia de cada dato y asset. Los datos de accidentes son del INEGI (ATUS) bajo sus Términos de Libre Uso; las masas y dimensiones de vehículos vienen de fichas técnicas públicas de los fabricantes (URL por modelo).
- `docs/responsible-ai.md` detalla las medidas de PLAN §10.
- Código bajo licencia MIT (`LICENSE`).

## Límites y siguiente paso

Se documentan al cierre de cada fase en `docs/PROGRESS.md`.
