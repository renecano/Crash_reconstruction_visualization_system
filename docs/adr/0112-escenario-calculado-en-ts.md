# ADR 0112 — El escenario del visor Unity se calcula en TS y viaja en el paquete caso-3d

- **Fecha:** 2026-11-07
- **Estado:** aceptada
- **Contexto:** U2 (plan v4 §3.3) pide en Unity las vías desde `lugar` en todas sus variantes, la red de OpenStreetMap, las marcas viales, las guarniciones, los dispositivos, las evidencias, el terreno de C3, los marcadores de C1, el entorno procedural y el cielo, «con las reglas de T1.1–T1.3 de v3».

## El problema

Todo eso ya existe en TS:

- **La disposición de la vía** sale de `roadLayout` de `@croquis/croquis-2d`, la misma que dibuja el croquis 2D. ADR 0006 exige que el 3D y el croquis coincidan.
- **La geometría** está en funciones puras de `@croquis/viewer`, sin three.js: `buildRoadGeometry`, `buildMapRoadGeometry`, `roadDecorFor`, `planEnvironment`, `terrainHeightAt`, `proceduralPoles`, `planNightLights`, `computeGroundMarks` y `environmentFor`.
- **Las mantiene el frente W:** `croquis-2d` es suyo y va a cambiar con C1 y C3.

Pasarlas a C# serían unas 3,000 líneas duplicadas, más pruebas de paridad. Además, cada cambio de W en el croquis tendría que repetirse en Unity, o el 3D dejaría de coincidir con el 2D.

## Decisión

1. **TS calcula el escenario y Unity lo dibuja,** igual que ya pasa con las trayectorias: Unity no calcula ni la física ni la vía.
2. **El paquete caso-3d agrega `escenario`, opcional.** Trae los datos de esas funciones casi tal cual: mallas en planta con sus capas, instancias (árboles, postes, señales, luminarias), edificios, cercas, cerros, el ambiente (sol, noche, mojado, lluvia, niebla) y las marcas en el piso con su tiempo. El esquema lo describe en `caso3d.schema.json` y el C# se genera de ahí, como el resto.
3. **Lo arma `escenarioDe(escena, resultado)`,** en `apps/web/src/components/visor-unity/`, junto al componente `<VisorUnity>` (carpeta de U). Solo usa las funciones puras de `@croquis/viewer`, que sigue congelado: se leen, no se cambian.
4. **Sin `escenario`, Unity dibuja un piso liso,** como en U1. Así los paquetes de `fixtures/caso3d/`, que prueban la fidelidad (D2), no dependen del visor web.
5. **La versión del paquete sigue en 1.0.0.** El campo es opcional, y nadie fuera de este frente consume todavía el paquete.

## Consecuencias

- **El 3D coincide con el croquis 2D** por construcción, y los cambios de W en `croquis-2d` llegan solos a Unity.
- **Lo procedural** (árboles, edificios, parcelas, cerros) usa la misma semilla de la escena en la web y en Unity, y va con su etiqueta «procedural».
- **El paquete pesa más:** se mide cuánto al armar las 5 escenas de D1 y se anota en la bitácora de U.
- **Lo que sí dibuja Unity con sus propias reglas:** materiales, luz, cielo, lluvia y modelos. Son reglas de dibujo, no geometría del caso.
