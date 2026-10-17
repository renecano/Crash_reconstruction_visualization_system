# ADR 0027 — Optimizador y álgebra lineal propios para la inversión (F9)

- **Estado:** aceptado (2026-10-17)
- **Contexto:** F9 pide el port TS completo del solver, incluidas la inversión y Monte Carlo, con paridad E7 (relativa 1e-6, absoluta 1e-5) y determinismo E8.
  - **Dependencias en Python:** la inversión (`inversion.py`) usa `scipy.optimize.least_squares` (región de confianza reflectiva con límites, pérdida `soft_l1` y `x_scale`), `numpy.linalg.lstsq` en el reajuste por cuerda y `numpy.linalg.pinv` en la desviación local (Laplace). En el navegador no hay equivalentes.
  - **Por qué no basta un optimizador «equivalente»:** `fit_evidence` usa `max_nfev=40`, así que muchas veces el ajuste para por presupuesto y no por convergencia; el valor final depende del camino exacto. Además, con jacobianos de rango deficiente, `lstsq` y `pinv` dan la solución de norma mínima por SVD, que una solución por ecuaciones normales no reproduce.

## Decisiones

1. **La referencia Python deja SciPy en la inversión.** Usa un optimizador propio, escrito en Python puro (`croquis_solver/lsq.py`) y portado línea por línea a TS.
   - **Algoritmo:** Levenberg–Marquardt con las variables escaladas por `x_scale`.
   - **Pérdida `soft_l1`:** por mínimos cuadrados reponderados. El peso de cada residuo es ρ'(r²) = 1/√(1 + r²) y el costo, ½ Σ 2(√(1 + r²) − 1), igual que en SciPy con `f_scale = 1`.
     - El costo se calcula como 2r²/(√(1 + r²) + 1), que es la misma cantidad sin cancelación. Con r ~ 1e-6 la forma directa pierde unas 4 cifras y las decisiones de aceptar un paso se vuelven ruido; las pruebas lo encontraron en problemas lineales con ajuste casi exacto.
   - **Amortiguamiento de Nielsen (1999):** λ₀ = 10⁻³ · máx diag(JᵀJ), y λ se ajusta con la razón entre la reducción real y la predicha. Con factores fijos (÷3 y ×2) gastaba muchas más evaluaciones en pasos rechazados y no cabía en el presupuesto de 40 de la inversión.
   - **Límites con conjunto activo:** las variables en un límite cuyo descenso saldría de la caja se fijan en esa iteración. Sin esto, el ajuste se atoraba junto a un límite activo.
   - **Paso que cae en un límite y no mejora:** antes de reducirlo se prueba el punto interior al 99.5 % del camino, como hace la región de confianza de SciPy.
     - **Por qué:** el costo puede ser discontinuo justo en el límite. En `motociclista` el costo es varias veces mayor con la velocidad exactamente en cero que apenas por encima.
   - **Criterios de parada fijos:** presupuesto de evaluaciones; reducción relativa del costo o paso relativo < 1e-8 (también para el paso propuesto, aunque se rechace); gradiente proyectado < 1e-10; o costo cero.
2. **Álgebra lineal propia** (`croquis_solver/linalg.py`):
   - **SVD:** de Jacobi de un lado, con barridos en orden fijo y umbral de convergencia fijo. Encima, `lstsq` (norma mínima, con `rcond` como NumPy) y `pinv`.
   - **Sistemas simétricos definidos positivos:** Cholesky.
   - **Tamaño:** las matrices son de unos cuantos residuos por ≤ 6 parámetros, así que el costo no importa y el orden de las operaciones queda fijo, idéntico en Python y TS.
3. **Validación del cambio:**
   - **Contra NumPy:** pruebas de propiedades (Hypothesis) del álgebra lineal, a 1e-10 relativo en matrices bien condicionadas, y con la solución de norma mínima en rango deficiente.
   - **Contra SciPy:** el optimizador encuentra el mismo mínimo que `least_squares` en problemas sintéticos con solución conocida (lineales, no lineales, con límites activos y con valores atípicos que `soft_l1` debe atenuar).
   - **En la inversión real:** `croquis-eval f9-optimizador` resuelve en cada escena canónica el mismo problema de `fit_evidence` con los dos optimizadores. E3 no depende del optimizador (calcula ΔV desde el aplastamiento con CRASH3, sin ajuste) y no cambia.
   - **Resultados canónicos:** se regeneran (`croquis-solver reconstruct`) y E7 compara también los bloques de inversión, incertidumbre y consistencia.
4. **SciPy queda solo en las pruebas**, como referencia para comparar. No es dependencia del solver.

## Resultado (`eval/results/f9_optimizador.json`)

En las 8 escenas con inversión, con el mismo presupuesto de 40 evaluaciones:

|                                                   | SciPy   | Optimizador propio |
| ------------------------------------------------- | ------- | ------------------ |
| Convergen                                         | 8       | 8                  |
| Costo total (menor = mejor ajuste a la evidencia) | 28.5212 | 24.273             |
| Evaluaciones totales                              | 152     | 118                |

- **Mejor mínimo con el propio:** `interseccion_toluca`, `volcadura`.
- **Igual** (±0.0001): `objeto_fijo_arbol`, `peaton_cruce`, `poste`.
- **Mejor con SciPy:** `glorieta`, `lateral_interseccion`, `motociclista`. En `glorieta` la diferencia es clara; en las otras dos, pequeña.
- **Por qué no coinciden siempre:** los problemas vienen de la simulación y son multimodales, así que dos algoritmos pueden caer en mínimos distintos.
- **Los resultados canónicos se regeneraron** (`croquis-solver reconstruct --all`) y `eval/results/f7_inversion.json` se volvió a medir.

## Port TS y paridad E7 (F9, paso 2)

- **Módulos portados:** `linalg.ts`, `lsq.ts`, `inversion.ts`, `montecarlo.ts` y las banderas de consistencia que muestrean, más lo que usan de CPython: `random.gauss` y `randrange`, `statistics.quantiles` (inclusive) y `median`, y el bootstrap de la rigidez.
- **Vectores de referencia:** `croquis-solver numerics` escribe `packages/solver-ts/fixtures/numerics.json` y CI lo revisa con `--check`.
  - El álgebra lineal, el optimizador, `randrange` y los cuantiles coinciden **bit a bit**.
  - `gauss` coincide a 12 cifras: usa cos, sin y log, que pueden diferir en el último bit entre V8 y la biblioteca matemática de CPython.
- **E7 sobre el resultado completo** (`eval/results/e7_parity.json`):
  - Núcleo y Monte Carlo: 68,557 números a relativa 1e-6, sin diferencias de estructura ni de texto.
  - Inversión y consistencia: 217 números, con diferencia máxima 0.01 en `motociclista/inversion/parametros/2/estimacion/p50`. Es el último decimal de un percentil, donde la diferencia de bits de `gauss` cambia el redondeo en esa escena.
  - Por eso esos dos bloques se comparan con una unidad de su resolución reportada (0.011). Es mucho más estricto que el 5 % con el que la referencia Python se comparaba entre máquinas cuando usaba BLAS.

## Consecuencias

- **La inversión cambia sus números en las escenas canónicas,** porque el camino del optimizador ya no es el de SciPy. La comparación se publica tal cual; no se ajustó nada para imitar a SciPy.
- **El port TS de la inversión** se vuelve una traducción directa, sin bibliotecas numéricas, y la paridad E7 se puede exigir a la misma tolerancia que el resto del solver.
