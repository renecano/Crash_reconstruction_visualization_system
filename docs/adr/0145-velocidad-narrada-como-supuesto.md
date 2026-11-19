# ADR 0145 · La velocidad que dice la narración entra a la física como supuesto con su rango

- **Fecha:** 2026-11-18
- **Estado:** aceptada.
- **Pedido:** René, ronda 4: «Velocidades siempre bajas… Si la narración dice la velocidad o la describe, úsala como supuesto declarado con su rango. Si no la dice, pregúntasela al perito… Si la evidencia no fija la velocidad, dilo y usa la declarada o la típica, nunca una mínima arbitraria.»

## Diagnóstico (medido con el solver TS, 2026-11-18)

- **La lectura no extraía velocidades.** `SISTEMA_ESCENA` no tiene campo de velocidad, así que «a 80 km/h» o «a exceso de velocidad» se perdían.
- **El solver no tenía prior de velocidad.** `velocidad_previa` solo era el arranque del ajuste: 40 km/h si nadie la decía.
- **Un auto contra un árbol, sin reposo:** 40 km/h (el arranque), «la evidencia no la fija».
- **Con el reposo junto al árbol:** el ajuste se iba al tope de 200 km/h (σ local 62) y la pantalla lo escondía.
- **Las velocidades bajas** salían de la evidencia que sí fija algo (el reposo, el daño). Sin evidencia, quedaba el arranque.

## Decisión

### 1. El detector (`packages/cesvi/src/velocidad-narrada.ts`)

Es determinista y deja su cita; no llama al modelo, así que no gasta API ni cambia las lecturas grabadas.

**Una cifra:**

| Cómo lo dice la narración | Rango |
| --- | --- |
| «a 80 km/h» | ±10 % |
| «como a 60», «aproximadamente», «unos» | ±15 % |
| «entre 60 y 70» | 60–70 |
| «a más de 90» | 90–117 (+30 %) |
| «a menos de 40» | 24–40 (−40 %) |

**Una descripción, relativa al límite de la vía** (L = límite):

| Descripción | Valor | Rango |
| --- | --- | --- |
| «a exceso de velocidad», «a alta velocidad», «rápido» | 1.3 L | L a 1.6 L |
| «despacio» | 0.4 L | 5 a 0.7 L |
| «a vuelta de rueda» | 8 km/h | 3–15 km/h (el valor que ya usaba la ruta del relato) |
| la típica de la vía | 0.9 L | 0.6 L a 1.2 L |

Estos rangos son **supuestos de Croquis**, dichos en la nota del cálculo: un límite es un máximo legal, no una medición.

**El límite de la vía** es su `maxspeed` de OpenStreetMap o, si no lo tiene, el de su tipo según la **LGMSV, art. 49 fr. III** (DOF 17-05-2022, última reforma DOF 29-12-2023):

| Tipo de vía en OSM | Límite |
| --- | --- |
| motorway | 80 km/h (inciso e, acceso controlado) |
| trunk, primary | 50 km/h (inciso d) |
| secondary, tertiary, residential, unclassified, living_street, service | 30 km/h (inciso c) |

Mientras no se conoce la vía, se usa la avenida primaria (50 km/h). Al marcar el choque sobre una calle, se recalcula (`conLimiteDeLaVia`).

**No cuenta como velocidad del hecho:** un límite señalado («velocidad máxima de 50 km/h», «restrictivo de 40»), «el carril de baja velocidad», ni una frase sin vehículo claro cuando hay varios.

### 2. La pregunta

Si la narración no dice la velocidad de un vehículo en movimiento, la lectura agrega «¿A qué velocidad venía V1 antes del impacto?», con su campo en km/h y «No sé». Con «No sé», queda la típica de la vía como supuesto.

### 3. El solver (Python de referencia y port TS, con paridad)

- **El contrato:** `velocidad_previa.a_priori = true` con su `rango` p10–p90. Es aditivo, así que el contrato sigue en la 2.3.0.
- **El residuo:** `velocidad_declarada:<veh>` = (v − valor) / σ, con σ = ancho del rango / 2.563 (mínimo 2 km/h). Es información declarada y se combina con la evidencia.
- **Donde la evidencia ya la fija**, la evidencia manda: su σ es mucho menor.
- **Donde no la fija**, la fija lo declarado, y el resultado lo dice: `fijada_por: "declarada"` (comparando el σ local con y sin ese residuo).
- **En las simulaciones** el valor declarado se sortea dentro de su rango. Va al final de los sorteos, para que las escenas sin velocidad declarada conserven sus números idénticos.

## Consecuencias

- **AXA y los cinco ejemplos no narran velocidades:** sus cifras no cambian. Lo comprueban `croquis-solver reconstruct --all --check` y la paridad de las 14 escenas canónicas (sin diferencias, 2026-11-18). El antes y después medido va en `eval/results/ronda4_velocidad_narrada.json`.
- **Un caso como el de Tollocan contra un árbol**, narrado «a exceso de velocidad», da la velocidad alrededor del límite de su vía y lo dice, en vez de 20 o 40 km/h sin explicación.
- **Pruebas:**
  - `velocidad-narrada.test.ts`;
  - la paridad `arbol_velocidad_declarada` (Python ↔ TS);
  - `test_inversion.py` sin cambios.
