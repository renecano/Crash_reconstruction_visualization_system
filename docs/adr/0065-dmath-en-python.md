# ADR 0065 — La referencia Python usa la misma matemática determinista que TS

- **Estado:** aceptado (2026-10-22).
- **Contexto:** el solver Python es la referencia; el port TS se compara contra sus resultados (paridad E7, `packages/solver-ts/src/parity.test.ts`, relativa 1e-6 y absoluta 1e-5; los bloques de inversión y consistencia, con 0.011). El ADR 0029 hizo determinista al solver TS con `dmath` (fdlibm 5.3 en aritmética IEEE exacta), pero Python seguía con `math.sin`, `cos`, `tan`, `atan`, `atan2`, `exp`, `log` y `hypot` de la libm del sistema (MSVC en Windows, glibc en Linux), `random.Random.gauss` (que también usa la libm) y `**` (la `pow` de la libm). Entre libm y fdlibm el último bit puede diferir.
- **El problema que lo destapó** (ADR 0063): cerca del reposo, la moto caída de `motociclista` (llantas bloqueadas) amplifica ese último bit. Un ulp en `cos` movía su velocidad 2e-4 m/s, y el optimizador local de la inversión lo llevaba a 0.02° en un rumbo poco fijado por la evidencia (−5.5 σ de residuo). Con el resultado 1.8.0, la paridad fallaba en cuatro números de ese bloque (0.02–0.03 contra la tolerancia de 0.011). No se tocó la tolerancia ni la física.

## Decisión

- **`solver/croquis_solver/dmath.py`:** port de `packages/solver-ts/src/dmath.ts` función por función: `sin`, `cos`, `tan`, `atan`, `atan2`, `acos`, `exp` (con `exp(1) = e` como V8), `log`, `hypot` y `hypot_n` con el algoritmo de V8, y `pow2` exacto. Solo usa suma, resta, producto, división y `math.sqrt` (exactas en IEEE 754), y `struct` para los bits. Así da lo mismo, bit a bit, en Windows, en Linux y en TS.
- **`dmath.Random`:** `random.Random` (el mismo Mersenne Twister de CPython y de `PyRandom` en TS) con `gauss` sobre `dmath.log`, `cos` y `sin`, como `PyRandom.gauss`.
- **El solver ya no usa la libm:** todas las llamadas a esas funciones de `math` pasan a `dmath`; `x ** 2` pasa a `x * x` (como V8, que calcula `x ** 2` como `x * x`); `q ** 1.5` pasa a `q · √q` (como TS); y los generadores son `dmath.Random`. `math.sqrt`, `math.radians`, `math.degrees`, `math.fmod`, `floor` y `ceil` se quedan: son exactas.
- **Una guardia lo protege** (`solver/tests/test_dmath.py`, como la regla de ESLint del ADR 0029): falla si un módulo del solver, fuera de `dmath.py`, llama funciones de la libm de `math`, `cmath` o `numpy`, usa `**` que no sea entre literales enteros, `pow()` o `random.*()`.
- **Pruebas:**
  - La misma tabla de bits de fdlibm que `dmath.test.ts`, con los casos especiales de IEEE 754.
  - Igualdad bit a bit con `dmath` de TS en una muestra fija de 4,057 casos de las diez funciones (`solver/tests/data/dmath_ts.json`, lo escribe `packages/solver-ts/scripts/dmath-fixture.ts`; `pnpm --filter @croquis/solver-ts generate:check` lo verifica).
  - Con Hypothesis, a lo más 1 ulp de la libm del sistema (2 en `hypot`: el algoritmo de V8 no redondea correctamente como `math.hypot` de CPython).

## Efecto medido

- **Paridad Python/TS** (comparación puntual de `fullResult` de TS con los resultados regenerados): de los 66,733 números de los 11 resultados canónicos, ninguno difiere entre la referencia Python y el solver TS: son iguales, no solo dentro de la tolerancia. `parity.test.ts` pasa en las 11 escenas con las tolerancias de siempre.
- **Cambio en los resultados canónicos:** 51 de los 66,733 números cambian respecto a los calculados con la libm de Windows.
  - Trayectorias de `frontal_curva` y `volcadura`, y un evento de `glorieta`: en el sexto decimal (1e-6).
  - Dos tiempos de eventos: 4.1e-5 s en `frontal_curva` y 1.4e-5 s en `volcadura`.
  - La inversión y la consistencia de `motociclista`: hasta 0.03 en la mejor estimación y los percentiles de los rumbos, 0.01 km/h en las velocidades de impacto.
  - Las otras siete escenas no cambian.
- **Sin cambio en las salidas doradas** de la ronda de preguntas (`packages/extraction/fixtures/questions.golden.json`) ni en los vectores numéricos (`croquis-solver numerics --check`).

## Consecuencias

- **La referencia ya no depende de la libm del sistema:** por construcción (solo operaciones IEEE exactas), Windows y Linux calculan lo mismo; CI lo comprueba en Ubuntu con `test_resultados_versionados_coinciden_con_el_solver` sobre los resultados generados en Windows. La tolerancia de `results_io` entre máquinas sigue igual.
- **E7 y E8** (`eval/results/e7_parity.json`, `eval/results/e8_determinism.json`) cambian con los resultados y se regeneran a mano, como toda evaluación larga.
- **Costo:** las funciones en Python puro son más lentas que las de C. Dos ajustes que no cambian ningún bit: los umbrales de `sin`, `cos` y sus núcleos se comparan como valores de |x| y no con la palabra alta (los dobles no negativos ordenan igual sus bits y sus valores), y las esquinas de la integración conjunta reutilizan el coseno y el seno del rumbo que ya calculó el paso (también en TS). En una medición puntual en la laptop de desarrollo (no es una evaluación versionada), el resultado completo de `motociclista`, `lateral_interseccion` y `alcance` tardó 1.7 veces lo que tardaba con la libm. En CI, `pytest` tardaba 143 s antes de este cambio, con un límite de 10 minutos para todo el trabajo.
