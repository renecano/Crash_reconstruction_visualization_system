# ADR 0089 — Ningún contorno de vehículo traslapa a otro después del impacto

- **Estado:** aceptado (2026-10-24).
- **Contexto:** René vio en el 3D de AXA las dos pickups encimadas, también en el reposo. Pidió:
  - que ningún contorno traslape a otro desde 0.04 s después del impacto, en la animación ni en el reposo, en todos los casos;
  - que, si las posiciones que coloca el perito se enciman, se le avise y se le proponga separarlas;
  - una prueba con la distancia mínima entre contornos en AXA y en las escenas canónicas.

## Lo que se midió antes

`uv run croquis-eval contornos`: distancia mínima entre contornos de cada par desde 0.04 s después de cada impacto entre los dos, hasta el reposo (negativa = traslape). El resultado de antes está en `eval/results/contornos_antes.json` (el mismo script con el código de `main`, commit `ca1eead`).

- **AXA** (`demo/escenas-r11/axa.json`) se traslapaba 1.82 m: las dos pickups arrancaban la fase posterior en la misma pose.
- **Con la caja sin deformar,** cinco escenas canónicas se traslapaban: `frontal_curva`, `glorieta`, `lateral_interseccion`, `motociclista` y `nocturno_lluvia`. La peor era `nocturno_lluvia`, con 0.26 m, también en el reposo.
- **Con la caja deformada** (la cara dañada hundida su aplastamiento), además de AXA, `nocturno_lluvia`: 0.17 m a los 0.04 s.

## Causas

1. **La lectura de AXA no trae las zonas del impacto,** solo los daños de cada vehículo:
   - sin zonas, el solver supone el centro del frente de los dos;
   - en un alcance, dos frentes en el mismo punto son dos centros en el mismo punto.
2. **El contacto secundario** (ADR 0063):
   - permitía el encaje del instante del impacto y lo deshacía a 1 m/s, así que uno grande tardaba segundos;
   - usaba la caja deformada, pero el 3D dibuja el daño con el perfil C1–C6, que es menor que el máximo en casi toda la cara.

## Decisión

1. **El contorno es la caja sin deformar** (largo × ancho):
   - el 3D dibuja el daño hacia adentro de ella, así que si las cajas no se traslapan, nada de lo que se ve se traslapa, sea el vehículo paramétrico o el modelo de R10;
   - el encaje con que arrancan en el instante del impacto se deshace parejo en `SEPARATION_S` = 0.04 s, dos cuadros de 0.02 s, que se ven como el rebote del choque;
   - en una carambola, igual después de cada impacto posterior;
   - va en `postimpact.py` y en su port TS, con paridad.
2. **Sin zonas del impacto,** `especDeExpediente` toma la cara del primer daño de cada vehículo y lo dice en los límites:
   - solo la cara, sin el tercio ni el vértice, porque el daño dice dónde se deformó, no en qué punto de la cara fue el contacto;
   - en AXA, V1 por atrás y V2 por el frente.
3. **Posiciones finales del perito que se enciman** (`posicionesEncimadas`, `packages/cesvi/src/encimadas.ts`):
   - en los pasos del lugar y de la reconstrucción, un aviso dice qué vehículos y cuánto;
   - «Separarlos» mueve a cada uno la mitad del traslape más `HOLGURA_M` = 0.1 m por el eje de menor traslape, sin girarlos;
   - el perito puede deshacerlo.

## Evidencia

- **Después,** `eval/results/contornos.json` no da ningún traslape en ningún par, con ninguno de los dos contornos: lo que queda es redondeo de punto flotante (del orden de 10⁻¹⁵ m, contornos que se tocan).
- **Pruebas** (Python y TS):
  - desde `SEPARATION_S` después de cada impacto, la caja de ningún par traslapa la de otro en ninguna muestra ni en el reposo (tolerancia 10⁻⁹ m), en las escenas canónicas con impacto entre vehículos y en AXA;
  - el encaje inicial se deshace parejo en `SEPARATION_S`;
  - las zonas que salen de los daños;
  - el aviso y la propuesta de separación.
- **Paridad TS–Python** con los resultados de las escenas canónicas regenerados.
- **Lo que cambió en los resultados:**
  - las trayectorias del después del impacto, que se separan antes;
  - las preguntas de una de las escenas de extracción, porque el orden de las preguntas depende de cuánto reduce cada una la incertidumbre del solver;
  - en la moto caída, el auto ya no es independiente de la moto al bit: los une la separación de sus contornos, por menos de 1 mm.

## Límites

- **Un salto en dos cuadros:** la separación en 0.04 s mueve a los vehículos lo que se encajaban (su aplastamiento) en dos cuadros.
- **AXA con las zonas correctas no reproduce las velocidades de CESVI:**
  - con las posiciones de la versión de la evidencia y B en reposo detrás de A (el supuesto del método de los restos de CESVI), la reconstrucción da V2 a 41.01 km/h y V1 a 39.95 km/h (`velocidad_previa` en `demo/escenas-r11/axa.json`);
  - el dictamen da 63.15 km/h por deformación;
  - los 63.89 km/h de antes salían de la geometría equivocada (los dos centros en el mismo punto);
  - la comparación del paso 7 (el método de CESVI, 63.90 contra 63.15) no cambia.
  - Por qué la inversión no deja que las medidas C y L fijen la velocidad de V2 queda en «Endurecimiento pendiente».
