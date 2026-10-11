# Física de Croquis — modelos, ecuaciones y referencias

> Este documento acompaña a `solver/croquis_solver` (referencia) y `packages/solver-ts` (port).
> Cada módulo se documenta cuando se implementa; lo que aquí aparece como _pendiente_ no existe aún en código.

## Convenciones

- Unidades internas SI: metros, segundos, kilogramos, radianes. La interfaz convierte a km/h (`units.py` / `units.ts`).
- Marco de referencia planar: X al este, Y al norte, rumbo medido desde +X en sentido antihorario.
- Todo lo aleatorio recibe semilla explícita; los resultados con rango se reportan como percentiles.

## Módulos (PLAN §6.1)

| #   | Módulo                                                                          | Fase  | Estado    |
| --- | ------------------------------------------------------------------------------- | ----- | --------- |
| 1   | Pre-impacto (trayectorias, frenado, percepción-reacción)                        | F2    | pendiente |
| 2   | Impacto vehículo-vehículo (impulso planar, restitución, fricción tangencial)    | F2    | pendiente |
| 3   | Energía de deformación CRASH3 (A/B/G, perfil C1–C6)                             | F2    | pendiente |
| 4   | Impacto con objeto fijo                                                         | F2    | pendiente |
| 5   | Post-impacto (3 GDL, círculo de fricción)                                       | F2    | pendiente |
| 6   | Volcadura (criterio de inicio; secuencia en Rapier etiquetada como ilustrativa) | F5    | pendiente |
| 7   | Peatón y ciclista (Searle, Wood; ragdoll calibrado)                             | F2/F5 | pendiente |
| 8   | Ocupantes (cinemática relativa, sin lesiones)                                   | F5    | pendiente |
| 9   | Visibilidad (línea de vista en el tiempo)                                       | F5    | pendiente |
| 10  | Inversión (mínimos cuadrados robustos; CMA-ES si hace falta)                    | F7    | pendiente |
| 11  | Monte Carlo                                                                     | F7    | pendiente |
| 12  | Consistencia (banderas en lenguaje llano)                                       | F7    | pendiente |

## Rangos de plausibilidad por clase (F1)

El validador semántico (`check.ts` / `check.py`) marca masas, dimensiones y velocidades fuera de los rangos de `packages/scene-schema/vehicle_classes.json` (E006–E008). Los rangos de masa y dimensiones salen de fichas técnicas (`data/SOURCES.md`); los topes de velocidad por clase son constantes de diseño (p. ej. 220 km/h para un sedán compacto, 70 km/h para una bicicleta) pensados para detectar relatos físicamente imposibles, no para describir el desempeño de un modelo.

## Pruebas del solver (PLAN §6.2)

- Propiedades con Hypothesis / fast-check: conservación de momento lineal y angular (error relativo < 1e-9), energía cinética después ≤ antes, ΔV coherente con masas, simetría al intercambiar vehículos.
- Casos analíticos con solución cerrada.
- Paridad Python ↔ TS con tolerancia objetivo 1e-6 relativa (E7).
- Determinismo por semilla (E8).

## Referencias

- Brach, R. M. y Brach, R. M., _Vehicle Accident Analysis and Reconstruction Methods_, SAE.
- Kudlich, H. / Slibar, A., modelo de impulso planar.
- CRASH3 Technical Manual, NHTSA.
- Searle, J. A., "The Physics of Throw Distance in Accident Reconstruction", SAE 930659.
- Wood, D., SAE 910814.
- Watson et al., SAE 2023-01-5043 y SAE 2022-01-5069 (CISS vs EDR).
