# ADR 0062 — Reconstrucción física desde la evidencia del perito (R2)

- **Estado:** aceptado (2026-10-21).
- **Contexto:** R2 de `docs/cesvi/PLAN-CESVI.md` (plan v2). R1 deja la escena del caso en el expediente (contrato 2.0.0, ADR 0061), con lo que el perito coloca en el mapa. El solver de producción (port TS, con paridad contra Python) reconstruye escenas del contrato v1 (`EscenaSpec`) y ya invierte la evidencia declarada para dar velocidades con percentiles (ADR 0027).

## Decisión

- **Un adaptador, no un solver nuevo** (`packages/cesvi/src/reconstruccion.ts`, `especDeExpediente`). La escena del solver se arma en dos capas:
  1. **Base:** `buildSpec` de `@croquis/extraction` da una escena v1 válida a partir de la clase, las zonas de contacto y el tipo de impacto. Lo que el expediente no dice queda como valor por omisión o supuesto, igual que en el relato (ADR 0006).
  2. **Evidencia del perito,** con fuente `usuario` en la escena v1, la que la inversión toma como declarada:
     - **Posiciones finales y su rumbo,** en metros desde el punto de impacto (el promedio de las posiciones de impacto que colocó). El rumbo del contrato 2.0.0 (desde el norte, horario) se pasa al de la escena v1 (desde +X, antihorario).
     - **Masas.**
     - **Daño declarado:** la mayor C como profundidad y L como ancho.
     - **Huellas:** frenado antes del impacto o derrape.
  - **La posición inicial** que el perito no coloca queda 12 m antes de su posición de impacto, en su rumbo, marcada como supuesto.
- **El solver no cambia,** así que la paridad Python/TS no se toca. La página corre `fullResult` (reconstrucción, Monte Carlo, inversión y consistencia) en el Web Worker del visor. `interpretarResultado` lo lee en términos del expediente, y es la misma función para la página y las pruebas.
- **Ningún número inventado:**
  - **Sin evidencia** (sin posiciones, medidas ni huellas), la inversión no identifica ninguna velocidad, y la página lo dice con lo que el perito puede aportar.
  - **Con evidencia,** muestra la mejor estimación y los percentiles p10–p90, y la evidencia que las fija, en palabras («posición final de V1»).
- **Límites declarados en pantalla:**
  - **Más de un impacto:** se calcula el primero; las carambolas son R6.
  - **Posiciones finales sin las de impacto:** no se pueden medir desde el punto de impacto.
- **Verificación CESVI al lado** (`verificacion.ts`):
  - **McHenry y EBS** con la fórmula sustituida (C1, ADR 0059), cuando hay 2, 4 o 6 medidas C, L, la masa y la rigidez.
  - **La rigidez** es la del perito, la del dictamen o NHTSA E2 marcada como tal (`rigidezPorVehiculo`).
  - **Rigidez en kN/m:** una rigidez de dictamen con A < 1000 está en kN/m, como la escriben los dictámenes de CESVI aunque impriman «N/m» (ADR 0048). La energía sale en kJ y la masa va en toneladas, y la página lo dice. Con el caso de AXA da 225.454 kJ y 63.90 km/h, lo mismo que C1.
  - **Si falta un dato,** dice cuál.

## E-R2 (`eval/cesvi_r2_reconstruccion.mts` → `eval/results/cesvi_r2_reconstruccion.json`)

- **Escenas:** las 10 de R1 y el caso de AXA del corpus. 11 de 11 válidas y reconstruidas, con trayectoria de cada vehículo e incertidumbre por Monte Carlo; mediana de 425 ms en la laptop de desarrollo.
- **Ninguna fija velocidades,** porque ninguna trae posiciones del perito: las de R1 las coloca el perito en la página, y el dictamen de AXA no da coordenadas. Es lo esperado: la página lo dice y pide la evidencia.
- **Con posiciones de impacto y finales,** la inversión fija las velocidades con sus percentiles. La prueba unitaria lo comprueba en el crucero de R1, y la e2e en la página.
- **La verificación CESVI sobre el corpus** es E-C1 (ADR 0059).

## Consecuencias

- **R3 tiene trayectorias** del solver de producción para el 3D.
- **R4 compara estas velocidades con las de los dictámenes,** con posiciones tomadas de lo que describe cada dictamen.
- **Pendiente** (anotado en «Endurecimiento pendiente»): un mapa con búsqueda del lugar en «Caso nuevo». Hoy el perito navega a mano hasta el punto.
