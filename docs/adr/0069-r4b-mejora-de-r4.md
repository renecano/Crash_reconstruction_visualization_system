# ADR 0069 — R4b: ronda de mejora de R4

- **Estado:** aceptado (2026-10-22).
- **Contexto:** E-R4 v1 (ADR 0067) no sostiene «Croquis llega a lo mismo que CESVI».
  - En la prueba congelada, la modalidad queda en 34.2 %, contra 35.3 % de la línea base «siempre otra».
  - Además: reversa 0 de 9, objeto fijo 35.3 %, salida del camino y volcadura 20 %, velocidades por deformación 0 de 5.
  - En E-R6, 7 de 88 impactos posteriores ocurren.
  - René pidió una ronda de mejora antes de R7. Las reglas se ajustan solo con desarrollo y se congelan en un commit antes de medir la prueba una sola vez. La v1 y la v2 se publican lado a lado.

## Decisión

### 1. Medidas a sus campos

- **Lectura de C1…C6 y L** (`medidasDeDeformacion`): cada medida vale el último número de su tramo, con la unidad junto a ese número.
  - Ejemplo: «C1 = 85 – 45 = 45 cm = 0.45 m» → 0.45 m.
  - Una resta sin resultado no da medida: Croquis no hace cuentas.
  - Sin unidad, una C de más de 3 se lee en cm.
- **Las entradas de los cálculos pasan a sus campos** (`conEntradasDeCalculo`): C, L, masa, A y B van al vehículo y al primer daño no previo, solo si el campo está vacío y con la cita del cálculo.
- **La masa queda en kg** aunque el texto diga «Kg», «kilogramos» o toneladas. La verificación CESVI solo la toma en kg.
- **Prompts:**
  - `corpus-cesvi-v4` y `escena-narracion-v2` piden la masa (o el peso) y la rigidez en el vehículo, y las medidas en el daño aunque estén en los cálculos o en una tabla, copiando el resultado de una cuenta.
  - Con `corpus medidas` se releyeron con v4 solo los 48 reportes cuyo texto trae medidas, masas o rigidez (2.668 USD).

### 2. Reversa

- **El solver separa el rumbo del frente del sentido de marcha** (`ReversePath` y `travel_heading`, Python y port TS).
  - Antes, la maniobra «reversa» giraba la trayectoria 180° y el cuerpo la seguía: el vehículo chocaba con el frente.
  - Escena canónica nueva: `reversa`. La paridad TS pasa en las 13.
- **La lectura** (`escena-narracion-v2`, sección `movimiento`) marca la maniobra de cada vehículo que narra el texto, en la versión de la evidencia.
- **`especDeExpediente`:**
  - pasa la maniobra narrada a la escena (reversa, detenido, vueltas);
  - con posiciones del perito, coloca al que retrocede 12 m _delante_ del impacto, y al detenido en su posición de impacto.
- **Límite medido en desarrollo:**
  - las narraciones de R0 no dicen que alguien retrocedía (0 de 16 reversas), porque R0 quitó la dinámica que concluye CESVI y las declaraciones;
  - la pista «estacionamiento» tampoco sirve (4 de 16 reversas, contra 21 casos de otras modalidades).
  - **Consecuencia:** en E-R4 la reversa no se puede identificar con la entrada de la prueba. Lo que se arregla es el producto: si el perito narra la reversa, Croquis la reconstruye bien.

### 3. Modalidad

- **Un vehículo**, en este orden, fijado con desarrollo:
  1. vuelco, con el vocabulario de las narraciones («sobre su toldo», «giro sobre su eje»);
  2. el techo o el toldo en la narración, o un daño en el techo;
  3. salida del camino;
  4. objeto fijo golpeado (impacto, objeto dañado o «contra un…»);
  5. incendio → «otra»;
  6. parte posterior → alcance;
  7. último recurso: un objeto fijo nombrado.
- **«Otra»:** Croquis solo la infiere con evidencia positiva de un hecho sin choque (un incendio con un solo vehículo), nunca por descarte. Cada «otra» predicha cuenta, acierte o no (`otra_predicha`).
- **Precisión por modalidad predicha** (`precision_por_modalidad`), al lado de la exhaustividad. Así un último recurso que acierta poco se ve, aunque suba la exhaustividad de su modalidad.
- **Auditoría de «otra»** (informativa; no cambia la etiqueta con que se mide), en `eval/cesvi_r4b_auditoria_otra.py`. Se compara la etiqueta «otra» de R0 con el título del propio reporte:
  - **Desarrollo, 131 «otra»:** 28 son hechos sin choque, 69 llevan título de choque entre vehículos (38 laterales o perpendiculares, 9 alcances, 7 reversas, 3 frontales…) y 39 no se pueden clasificar («COLISIÓN», «CHOQUE», «IMPACTO»).
  - **Prueba, 67 «otra»:** 11 sin choque, 30 con título de choque y 25 sin clasificar.

### 4. Carambolas

- Los vehículos que solo están en impactos posteriores, sin posiciones del perito, se colocan donde dice la narración (`colocarPosteriores`):
  1. una reconstrucción rápida (sin Monte Carlo) muestra a dónde va el vehículo ya colocado después de su golpe;
  2. el otro queda detenido a la mitad de ese recorrido real, con la cara de contacto que dice la narración (o la parte posterior), mirando al que llega;
  3. todo es supuesto, y los límites lo dicen.
- `conZonas` conserva las caras de contacto que lee la narración (`contacto`) y solo completa las que faltan con los daños.
- **E-R6 v2** pasa por `escenaDeConversion`, como «Caso nuevo», y mide desarrollo y prueba por separado, con la v1 de la misma partición al lado.
  - **Qué mide y qué no:** el impacto ocurre porque Croquis coloca al vehículo en la trayectoria. E-R6 v2 mide que la secuencia narrada se reproduce con una disposición coherente con la narración, no que las posiciones sean las reales.

## Medición

- **Desarrollo** (ajuste; `eval/results/cesvi_r4b_reproduccion_desarrollo.json`, 459 narraciones leídas con `escena-narracion-v2`):

  | Métrica             | v2                        | Línea base                 |
  | ------------------- | ------------------------- | -------------------------- |
  | Modalidad           | 45.5 %                    | 31.2 % («siempre otra»)    |
  | Modalidades físicas | 65.1 %                    | 38.8 % («siempre alcance») |
  | Volcadura           | 82.6 % (precisión 52.8 %) | —                          |
  | Objeto fijo         | 73.8 % (precisión 37.8 %) | —                          |

- **Carambolas en desarrollo:** 44 de 56 impactos posteriores ocurren, contra 5 de 56 en v1 (`eval/results/cesvi_r4b_carambolas_desarrollo.json`).
- **Prueba congelada** (una sola vez, con las reglas congeladas en `29b67ab`): v1 y v2 lado a lado en `eval/results/cesvi_r4b_comparacion.json`.

  | Eje (205 narraciones, 190 con modalidad) | v1              | v2                        | Línea base                 |
  | ---------------------------------------- | --------------- | ------------------------- | -------------------------- |
  | Modalidad                                | 34.2 %          | 39.5 %                    | 35.3 % («siempre otra»)    |
  | Modalidades físicas                      | 52.8 %          | 59.3 %                    | 37.4 % («siempre alcance») |
  | Volcadura                                | 20 %            | 60 % (precisión 40 %)     | —                          |
  | Objeto fijo                              | 35.3 %          | 52.9 % (precisión 30 %)   | —                          |
  | Alcance                                  | 73.9 %          | 78.3 % (precisión 63.2 %) | —                          |
  | Frontal                                  | 66.7 %          | 83.3 % (precisión 35.7 %) | —                          |
  | Lateral                                  | 68 %            | 64 % (precisión 28.1 %)   | —                          |
  | Salida del camino                        | 20 %            | 10 % (precisión 33.3 %)   | —                          |
  | Reversa                                  | 0 de 9          | 0 de 9                    | —                          |
  | «Otra» predicha                          | —               | 2 de 3 aciertan           | —                          |
  | Zonas (exhaustividad / precisión)        | 69.2 % / 59.7 % | 71.2 % / 61.3 %           | —                          |
  | Primer impacto / secuencia completa      | 63.7 % / 49.6 % | 68.1 % / 51.1 %           | —                          |
  | Posiciones finales                       | 53.4 %          | 50.0 %                    | —                          |
  | Velocidades por deformación              | 0 de 5          | 0 de 5                    | —                          |

- **Carambolas en la prueba:** 21 de 31 impactos posteriores ocurren, contra 2 de 32 en v1. Las 33 escenas son válidas y van en 3D.
- **E-R5 en la prueba** (`eval/results/cesvi_r4b_importar.json`):
  - listos para reconstruir: 205 de 205 (v1: 204);
  - masa: 3.4 % de los vehículos (v1: 2.4 %);
  - C y L: 0 %.
- **Lectura honesta:**
  - la modalidad física gana con claridad a su línea base;
  - la modalidad con «otra» apenas la pasa;
  - las reglas de un vehículo generalizan peor que en desarrollo (45.5 % allí, 39.5 % aquí).
- **Gasto de API:** 11.25 USD.
  - C0 v4: 2.668 USD;
  - piloto: 0.2453 USD;
  - desarrollo: 5.6738 USD;
  - prueba: 2.6626 USD.

## Límites

- **Velocidades por deformación:** las narraciones casi no traen L (el ancho dañado). Sin L, McHenry no se calcula, y Croquis no lo inventa. En desarrollo se calculan las que traen C, L, masa y clase.
- **La etiqueta «otra» de R0** mezcla hechos sin choque con choques que el título del reporte nombra. E-R4 se mide con ella tal como está; la auditoría lo documenta.
- **Reversa:** ver arriba; la entrada de E-R4 no la trae.
