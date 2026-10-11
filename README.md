# Croquis

> Reconstrucción 3D de percances viales a partir del relato de quien los vivió.
> **Reconstrucción ilustrativa. No es un peritaje, una prueba legal ni un dictamen de responsabilidad.**

Croquis toma lo que una persona cuenta ("iba por Tollocan, el de la camioneta gris se me cerró…"), lo convierte con un LLM en una escena estructurada donde cada dato está ligado a la frase que lo respalda o marcado como supuesto, lo deja corregir en un croquis 2D, reconstruye la física con un solver propio y lo muestra en 3D en el navegador. **La IA traduce, la física decide y el visor muestra.**

Estado: **F0 — Fundaciones** (ver `docs/PROGRESS.md`). Este README se completa fase por fase siguiendo el estándar de PLAN §15; toda cifra que aparezca aquí sale de un script en `eval/` con su salida en `eval/results/`.

## Problema

Pendiente de F0: las cifras de INEGI ATUS se calculan con `uv run croquis-data atus summary` y se citan desde `eval/results/atus_summary.json`.

## Cómo probarlo

### En local (Windows, PowerShell)

Requisitos: Node 24, pnpm 12, Python 3.14 y uv 0.13 (ver `docs/adr/0001-stack.md`).

```powershell
pnpm install
uv sync --all-packages --all-groups
pnpm dev            # web en http://localhost:3000
uv run pytest       # pruebas Python
pnpm test           # pruebas TypeScript
```

### En vivo

Pendiente de F11 (despliegue dev y prod).

## Resultados medidos

Pendiente. Tabla E1–E9 con enlaces a `eval/results/` conforme se corra cada evaluación (PLAN §8).

## Mapa del repo

Ver PLAN §3.2. Resumen: `apps/web` (Next.js), `packages/*` (contrato, solver TS, visor, croquis 2D), `services/api` (FastAPI), `solver` (referencia Python), `extraction` (comprensión del relato), `data` y `eval` (datos y evidencia), `assets`, `infra`, `docs`.

## Datos, licencias e IA responsable

- `data/SOURCES.md` y `assets/ASSETS.md` registran origen y licencia de cada dato y asset.
- `docs/responsible-ai.md` detalla las medidas de PLAN §10.
- Código bajo licencia MIT (`LICENSE`).

## Límites y siguiente paso

Se documentan al cierre de cada fase en `docs/PROGRESS.md`.
