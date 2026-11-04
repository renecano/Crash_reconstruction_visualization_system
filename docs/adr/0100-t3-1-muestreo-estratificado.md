# ADR 0100 — T3.1: el rango no depende del muestreo

- **Estado:** aceptado (2026-11-03). Primer punto de T3 (PLAN-CESVI v3, «Números defendibles»).
- **Contexto:** el rango p10–p90 de la velocidad previa que reporta Croquis sale de pocas muestras sorteadas con la semilla de la escena: 12 reajustes de la inversión con la evidencia perturbada (`inversion._estimate`) y 64 muestras del Monte Carlo de los campos inciertos. Con sorteos independientes del Mersenne Twister, el rango cambiaba con la semilla: en AXA, el p10 de V2 se movía 13.2 km/h y el p90 18.7 km/h entre 20 semillas (`eval/results/axa_rango_estable_antes.json`). Un perito no puede defender un rango que depende de un número al azar.

## Decisión

1. **Hipercubo latino en los dos muestreos** (`solver/croquis_solver/stratified.py`, referencia; `packages/solver-ts/src/stratified.ts`, port con paridad). Cada sorteo que hace una muestra, en el orden en que lo pide, es una dimensión; cada dimensión se reparte en `n` estratos iguales y cada muestra cae en un estrato distinto (una permutación por dimensión). La permutación sale de `random.shuffle` de CPython (`_randbelow` por `getrandbits`, que `PyRandom.shuffle` reproduce bit a bit) y la posición dentro del estrato de `random()`. `uniform(a, b)` es `a + (b − a)·u`; `gauss(μ, σ)` es `μ + σ·Φ⁻¹(u)` con la inversa de la normal de Acklam (error relativo < 1.2e-9) sobre `dmath.log`, las mismas operaciones y en el mismo orden en los dos lenguajes.
   - **Con semilla de diseño fija** (`DESIGN_SEED` más el tamaño del hipercubo), no con la semilla de la escena: el diseño es cuasialeatorio, el mismo para cualquier escena del mismo tamaño. Primero se probó el hipercubo sorteado con la semilla de la escena: el p10 y el p90 de V2 en AXA pasaron de moverse 13.2 y 18.7 km/h a 6.0 y 6.8 km/h entre 20 semillas (los 32 reajustes no lineales conservan ruido de muestreo en los percentiles de salida), lejos aún del 1 km/h de la meta. Con el diseño fijo, el rango deja de depender de la semilla por construcción; la semilla de la escena sigue valiendo para todo lo demás (restos, personas, variación visual).
2. **Cuántas dimensiones tiene una muestra se cuenta con una pasada seca** (`count_draws` con `CountingDraws`, que devuelve el centro de cada sorteo): `perturbed` no cambia; solo recibe otra fuente de sorteos (`Draws`: `uniform` y `gauss`).
3. **Determinismo:** la misma escena da el mismo rango con cualquier semilla; la mejor solución (el multiarranque) tampoco usa la semilla, como antes (ADR 0091). El campo `semilla` de los resultados se conserva por trazabilidad.
4. **Las referencias se regeneran con Python** (`uv run croquis-solver reconstruct --all`: escenas canónicas, fixtures de inversión y de agentes) y el port pasa la paridad E7 con la tolerancia de siempre.
5. **La pregunta «velocidad contra evidencia» compara el valor indicado, no su rango entero.** Con el hipercubo, el p10 de la escena canónica `peaton_cruce` bajó de 50.7 a 49.5 km/h y el rango del relato («como a 40»: 30–50) pasó a traslaparse por medio km/h con el intervalo de la evidencia (49.5–55.6): la regla anterior (rangos disjuntos) apagaba la pregunta, aunque 40 km/h sigue fuera de lo que fija la evidencia. Ahora `velocidad_vs_evidencia` se levanta cuando el valor indicado queda fuera del intervalo del 80 % (`consistency.py` y `consistency.ts`; `docs/physics.md`). Solo `peaton_cruce` cambia de banderas entre las 16 referencias.
6. **Más muestras en el Web Worker**: el resultado completo de producción (`fullResult`) acepta el número de reajustes y de muestras del Monte Carlo; el worker pide más que los valores por omisión de la referencia (que se quedan para las fixtures y la CI, que debe seguir por debajo de 10 minutos), si el resultado completo sigue por debajo de 10 s en la laptop (`eval/results/axa_tiempo_navegador.json`).

## Evidencia

- `eval/axa_rango_estable.mts` → `eval/results/axa_rango_estable_antes.json` y `axa_rango_estable.json` («después»): movimiento del p10 y del p90 de V2 entre 20 semillas; meta ≤ 1 km/h (ver PROGRESS).
- Pruebas: `test_stratified.py` y `stratified.test.ts` (estratos, determinismo, `shuffle` y el hipercubo iguales a CPython, inversa de la normal contra `statistics.NormalDist`), `test_montecarlo.py`, `test_inversion.py`, paridad E7 (`parity.test.ts`, `inversion-un-dano.test.ts`).

## Límites

- El hipercubo estratifica cada dimensión por separado, no las combinaciones, y es un solo diseño: el rango es una cuadratura fija de la incertidumbre de las entradas, no una muestra; con más reajustes (32 en producción) la cuadratura es más fina.
- Si una muestra pide más sorteos que otra (p. ej. un sorteo condicional), la pasada seca no lo vería; hoy `perturbed` y Monte Carlo sortean siempre lo mismo para una escena dada.
