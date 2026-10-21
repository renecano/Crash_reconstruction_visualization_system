# ADR 0047 — CI para el trabajo con CESVI: lo que cuenta para hacer merge

- **Estado:** aceptado (2026-10-20). Decisión de René.
- **Contexto:**
  - **El cambio de rumbo:** Croquis ahora es para los peritos de CESVI México (`docs/cesvi/PROTOTIPO.md`). El alcance lo pone CESVI y lo primero es mostrarles un dictamen reproducido.
  - **Lo que costaba la CI:** cada PR corría la e2e completa en escritorio y celular con referencias visuales, E8 en tres navegadores, los generados, la demo grabada y la reproducibilidad de los datos en Linux y Windows. En el PR #63 la e2e sola pasó de los 25 minutos de su límite.

## Decisión

- **Para hacer merge solo cuentan** (`.github/workflows/ci.yml`, todo en menos de 10 minutos):
  - formato, lint y tipos (TypeScript y Python);
  - las pruebas unitarias de lógica y cálculos (`pnpm test` y `pytest`);
  - una e2e por flujo principal, en Chromium: las pruebas marcadas con `@flujo` en su título. El build de producción lo hace esta misma e2e.
- **Lo demás corre a mano** (`.github/workflows/completo.yml`, `workflow_dispatch`): cuando René lo pide o antes de una demo con CESVI. Son los generados al día, la demo grabada, la e2e completa con las referencias visuales, E8, la reproducibilidad de los datos y Python en Windows.
- **Nada se borra:** cada cosa que salió de la CI está en `docs/PROGRESS.md`, sección «Endurecimiento pendiente».

## Consecuencias

- **Lo que puede llegar a `main` sin detectarse:** un generado desfasado, una diferencia entre navegadores o una regresión visual. Lo atrapa la corrida completa antes de una demo.
- **Hasta que exista el flujo de CESVI:** no hay pruebas con `@flujo`, así que la e2e de la CI pasa sin pruebas (`--pass-with-no-tests`). La primera es la de `/cesvi` (Hito 1).
