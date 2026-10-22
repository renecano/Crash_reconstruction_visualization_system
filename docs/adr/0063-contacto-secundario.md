# ADR 0063 — Contacto secundario después del impacto (R3)

- **Estado:** aceptado (2026-10-21).
- **Contexto:** R3 de `docs/cesvi/PLAN-CESVI.md` pide que en el impacto los cuerpos no se atraviesen. `eval/r3_interpenetracion.mts` mide, en cada escena canónica e instante de la trayectoria, la penetración de las cajas (largo × ancho) de cada par de vehículos por el teorema del eje separador; el exceso es lo que pasa de la suma de sus aplastamientos máximos (`dano.perfil_m`). Con el resultado 1.7.0, 3 de 8 pares pasaban 1 cm: `nocturno_lluvia` 1.438 m en t = 1.3 s, `motociclista` 0.083 m en t = 0 y `glorieta` 0.072 m en t = 0.72 s. La causa de los dos casos después del impacto: en la fase posterior cada vehículo se integraba por separado, así que, después de separarse, uno podía volver a meterse en el otro sin que nada lo impidiera.

## Decisión

- **Los vehículos de un choque entre vehículos se integran juntos** (`postimpact.integrate_joint` en Python, `integrateJoint` en TS, mismo algoritmo y mismo orden de operaciones). Avanzan al mismo paso (2 ms) con el mismo modelo de llantas de siempre; después de cada paso se resuelve el contacto de cada par. Un vehículo que llega al reposo puede volver a moverse si el otro lo empuja; uno que arranca detenido espera en reposo hasta que lo empujen.
- **Contorno deformado.** El contorno de cada vehículo es su caja con la cara dañada (el lado de su CDC: F, B, L o R) hundida su aplastamiento máximo. Así la caja sin deformar se puede encajar en la otra hasta la profundidad del daño, que es la deformación, pero no más: si los contornos deformados no se encajan, el encaje de las cajas sin deformar no pasa de la suma de aplastamientos, que es lo que mide la evaluación.
- **Contacto secundario** (`resolve_secondary_contact`). Si los contornos se encajan más de lo permitido:
  1. **La normal** es la del menor desplazamiento que los separa según el teorema del eje separador (`axis_overlaps`: cada eje de arista en sus dos sentidos). **Se conserva mientras dura el contacto** y solo cambia a otro eje si ese separa con al menos `AXIS_HYSTERESIS` = 5 cm menos. Sin esta histéresis, cuando dos ejes quedaban casi empatados la normal se turnaba de un paso a otro según el último bit del redondeo y el empujón cambiaba de dirección: en una escena de la ronda de preguntas de Relatos-MX, un ulp en la entrada movía la salida 8.7 cm, y Python y TS no coincidían. Con ella, un ulp mueve la salida menos de 1e-12 m en las escenas canónicas (prueba `test_un_ulp_no_cambia_el_resultado` y su espejo en TS).
  2. **Si se acercan en esa normal,** impulso plástico (restitución 0) en los centros de masa: conserva el momento lineal y deja a los dos con la misma velocidad normal. Es el caso de un vehículo que empuja al otro. **Un vehículo en reposo** al que ese impulso no saca del reposo (`STOP_SPEED`, el mismo umbral con que la fase posterior declara el reposo) se queda quieto, como sujeto por sus llantas, y el otro pierde toda su velocidad normal contra él.
  3. **Separación de lo que sobra** del encaje permitido, repartida en proporción inversa a la masa entre los que se mueven, así que el centro de masa del par no se mueve; si los dos están en reposo, entre los dos.
- **Encaje permitido.** Arranca en el que tienen los contornos en el instante del impacto, porque esa configuración la fija el punto de contacto declarado (ADR 0062 y anteriores), no este modelo. Solo baja: sigue al encaje real cuando se separan y, además, se deshace a `DEPENETRATION_SPEED` = 1 m/s (2 mm por paso, 2 cm por cuadro de 0.02 s), para que no se vea un salto en el primer cuadro y al poco tiempo los contornos ya no se encajen. La integración sigue mientras algún vehículo se mueva o quede encaje por deshacer. El valor es una elección numérica, no física; está registrado aquí y en el código.
- **Un solo vehículo no cambia.** Los impactos contra objetos y personas siguen con `integrate`, que comparte el paso de llantas (`_advance`) con la integración conjunta. Una prueba verifica que dos vehículos lejanos dan, bit a bit, lo mismo que integrados por separado.
- **Resultado 1.8.0.** El contrato del resultado no cambia de forma; sube la versión porque cambian los números. Los resultados canónicos se regeneraron con `uv run croquis-solver reconstruct --all`.

## Por qué la moto pasa de su aplastamiento en t = 0 y es aceptable

En `motociclista` la moto (caja de 1.95 × 0.75 m) pega con el centro de su frente (CDC F-C) en el centro de la puerta derecha del auto (R-P), que está girando: el frente de la moto llega a 31° de la normal de la puerta. Con los dos puntos de contacto juntos, la esquina de la caja de la moto entra en el costado (ancho / 2)·sen θ = 0.375 · sen 31° ≈ 0.19 m, y el aplastamiento de los dos suma 0.112 m. No es un defecto del contacto ni de la fase posterior: es la configuración del impacto que fija el punto de contacto declarado, y la caja rectangular exagera el frente de una motocicleta, donde lo que va adelante es la llanta y el manubrio, que da el ancho, va detrás. Después del impacto ese exceso solo baja (las pruebas lo exigen: nunca más que el de t = 0 menos `DEPENETRATION_SPEED`·t) y a los 0.04 s ya no queda. No se ajustó ninguna tolerancia para ocultarlo: la evaluación lo sigue reportando, separado del exceso después del impacto.

## Resultados

`eval/r3_interpenetracion.mts` → `eval/results/r3_interpenetracion.json` (solver TS, las 11 escenas canónicas, 8 pares de vehículos):

|                                       | Resultado 1.7.0                        | Resultado 1.8.0                                                                        |
| ------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| Pares que pasan 1 cm su aplastamiento | 3 de 8                                 | 1 de 8 (`motociclista`, en t = 0)                                                      |
| Exceso máximo                         | 1.438 m (`nocturno_lluvia`, t = 1.3 s) | 0.083 m (`motociclista`, t = 0)                                                        |
| Después del impacto (t > 0)           | —                                      | 1 de 8: lo que queda de la moto en t = 0.02 s, 0.031 m; en t = 0.04 s ya no hay exceso |

`nocturno_lluvia` y `glorieta` quedan en 0. La evaluación ahora reporta aparte el exceso después del impacto (`exceso_posterior_m`), porque el de t = 0 es la configuración del impacto y no lo toca este modelo.

## Límites

- **Impulso lineal en los centros:** el contacto secundario no acopla la guiñada. Un golpe en una esquina no hace girar a ninguno de los dos.
- **Sin fricción entre carrocerías:** un vehículo puede deslizarse a lo largo del costado del otro sin frenarse por el roce.
- **Contorno rectangular con la cara hundida de forma pareja,** con el aplastamiento máximo y no con el perfil; en la moto, la caja exagera el frente (ver arriba).
- **La normal del menor traslape** es la dirección de menor separación, no la de la cara que realmente choca. En un encaje profundo y de lado puede empujar de costado (en `nocturno_lluvia`, A empuja de lado a la combi).
- **El reposo como sujeción:** un empujón que no saca a un vehículo detenido de `STOP_SPEED` no lo mueve; ese pequeño impulso no se conserva.
- **La inversión** (ADR 0027) ajusta velocidades y rumbos a las posiciones finales con un optimizador local. Con el contacto secundario, algunas combinaciones que antes llegaban a la posición final atravesando al otro vehículo ya no llegan, y el ajuste cambia (ver Consecuencias).

## Consecuencias

Cambios en los resultados canónicos (`packages/scene-schema/fixtures/resultados`, resultado 1.7.0 → 1.8.0):

- **Sin cambio de números:** `alcance`, `frontal_curva`, `objeto_fijo_arbol`, `peaton_cruce`, `poste` y `volcadura` (solo la versión). Ninguna velocidad de impacto ni delta-v cambia en ninguna escena: el contacto secundario actúa después del impacto.
- **`nocturno_lluvia`:** A ya no atraviesa a la combi. Empuja de lado a B, que queda en (27.25, −9.04) en vez de (27.21, −6.96). A recorre 18.78 m después del impacto en vez de 30.11 m y queda en (29.33, −6.37, −51°) en vez de (40.42, −10.13, −10°). Reposo de A en t = 3.65 s (antes 6.58 s), de B en 2.70 s (antes 2.47 s); la escena dura 5.66 s (antes 8.6 s). Cambian sus percentiles de Monte Carlo.
- **`glorieta`:** B recorre 2.47 m en vez de 2.98 m y queda en (2.41, 1.15) en vez de (2.52, 1.65); A casi igual. Reposo de B en 1.22 s (antes 1.50 s). Cambian Monte Carlo y la inversión.
- **`lateral_interseccion`:** la reconstrucción nominal no cambia, pero la inversión sí. Su mejor ajuste anterior (A a 62.55 km/h, B a 5.93 km/h) llegaba a las posiciones finales declaradas con A atravesando 1.37 m a B; sin eso, el ajuste local queda en A 81.95 km/h (p10–p90 56.83–81.08) y B 22.72 km/h, con más residuo en el rumbo final de B (3.69 σ). Aparece la bandera `velocidad_vs_evidencia` para A (la declarada es 35–55 km/h); `test_consistency.py` lo registra.
- **`interseccion_toluca` y `motociclista`:** solo cambian Monte Carlo, la inversión y, en Toluca, el rango de la bandera de consistencia que ya tenía (A a 13–22 km/h en vez de 16–24).
- **Ronda de preguntas:** `packages/extraction/fixtures/questions.golden.json` (lo escribe `uv run croquis-extraction golden build`) cambia porque la participación en la varianza sale de reconstrucciones con el solver.
- **Pendientes que dependen del resultado:** E7 (`eval/results/e7_parity.json`), E8 (`eval/results/e8_determinism.json`, hashes del resultado completo) y los cuadros de la portada (`apps/web/public/portada/fuente.json`, ya desactualizados antes de este cambio) se regeneran a mano.

## Paridad Python/TS

La reconstrucción coincide entre Python y TS en todas las escenas canónicas y en los puntos que evalúan la inversión y la ronda de preguntas con contacto. Queda una diferencia previa a este cambio: cerca del reposo, la moto caída (llantas bloqueadas) amplifica el último bit de `cos`, `sin` e `hypot` (libm de Python contra fdlibm de `dmath`) hasta 2e-4 m/s, y el optimizador local de la inversión lo lleva a 0.02° en el rumbo de la moto de `motociclista`, que tiene mucho residuo (−5.5 σ). Antes de este cambio la diferencia sin redondear ya era 0.012 (−0.608 contra −0.620) y pasaba por el redondeo a centésimas; con el resultado 1.8.0, `parity.test.ts` falla en ese bloque (cuatro números de la inversión de `motociclista`, la mejor estimación y percentiles de los rumbos, difieren en 0.02–0.03; la tolerancia es 0.011). Pendiente de decidir, sin tocar la tolerancia: usar en Python el mismo fdlibm que `dmath` para que los dos sean idénticos bit a bit, o regularizar la fricción de llanta bloqueada cerca de velocidad cero (cambia la física de un vehículo solo y todos los resultados).
