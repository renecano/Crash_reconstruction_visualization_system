# ADR 0019 — La extracción lee la fase de las marcas

- **Estado:** aceptado (2026-10-15; pendiente de ADR 0016)
- **Contexto:** desde el contrato 1.1.0, el solver usa la fase de las marcas (`evidencias[].fase`), pero la extracción no la leía del relato. Unas marcas de después del golpe llegaban al solver como frenado previo.

## Decisiones

1. **Campo nuevo de hechos, `evidencias.marcas_fase`** (`antes_impacto` o `despues_impacto`), solo junto con `evidencias.marcas_m`.
   - El constructor de specs (Python y TS) lo escribe en la evidencia de marcas.
   - Su cita va como segundo fragmento de la procedencia, así que el verificador la revisa: si la cita no está literal, la fase deja de contar como del relato.
2. **Reglas** (`baseline.py` y `baseline.ts`): buscan la fase en la oración de las marcas y en la anterior, en orden de prioridad.
   - Primero lo explícito: "después del golpe", "posterior al impacto", "antes del choque", "antes de llegar".
   - Después lo deducido: "con el golpe" y "se arrastró" dan después; "frené" da antes.
   - Sin nada de eso no hay fase, y el solver aplica la convención de 1.0.0.
3. **Prompt v3** = v2 más una regla sobre las marcas y el campo nuevo en el esquema de salida.
   - v1 y v2 no cambian: el campo solo entra en el esquema de v3 (`campos_for`). Sus huellas siguen iguales (f6b693169a4199c3 y 5816b86ad0e718ee) y sus grabaciones siguen valiendo.
4. **E1 solo puntúa la fase donde la referencia la anota** (`ANNOTATED_ONLY`).
   - Los tests congelados (test y CISS) se anotaron antes de que existiera el campo y no se tocan. Sin esta regla, un acierto de la fase en un relato sin anotar contaría como inventado.
   - La consecuencia: la fase se mide solo en dev.
5. **Dev con marcas:**
   - Se anotó la fase en los 6 relatos de dev que ya tenían marcas.
   - Se agregó `dev-006`: 30 relatos dirigidos, escritos por un agente que no vio la línea base, el glosario ni los prompts.
     - **Fase declarada:** 14 después del impacto y 11 antes.
     - **Sin fase en el texto:** 5, con la fase inferida y sin cita; no se evalúan como extracción.
     - **Casos difíciles a propósito:** marcas de frenado de después del golpe y una raspadura de antes.
   - Las reglas de la fase se escribieron antes de leer el lote.

## Medición

Dev de 190 relatos, pipeline TS, `e1_extraction_dev{,_v2,_v3}.json`. Las tres versiones tienen respuestas de los 190 relatos, de los 39 contrafactuales y de la repetición de cada relato.

- **Fase de las marcas** (30 relatos con la fase citada):

  | Método    | Acierta | Inventada | No la lee | F1    |
  | --------- | ------- | --------- | --------- | ----- |
  | Reglas    | 3       | 0         | 27        | 0.182 |
  | Sonnet v3 | 21      | 0         | 9         | 0.824 |
  | Haiku v3  | 23      | 0         | 7         | 0.868 |

  Las reglas fallan antes: solo encuentran el largo de las marcas en 4 de 36 relatos, porque sus patrones de largo no cubren cómo se dicen las marcas en el lote nuevo. Los patrones de largo no se cambiaron para no ajustarlos al lote; queda como pendiente.

- **Lo demás no empeora con v3.** F1 micro sin el campo de la fase, que v1 y v2 no pueden dar:

  | Modelo | v1    | v2    | v3    |
  | ------ | ----- | ----- | ----- |
  | Sonnet | 0.895 | 0.936 | 0.939 |
  | Haiku  | 0.869 | 0.913 | 0.921 |

  Con la fase incluida, que v1 y v2 cuentan como no leída, el F1 micro de dev queda en 0.887, 0.928 y 0.937 con Sonnet, y en 0.861, 0.905 y 0.920 con Haiku.

- **Criterio para producción**, fijado antes de medir los tests y en el mismo orden que el ADR 0012:
  1. En dev, v3 no empeora el F1 micro sin la fase frente a v2 con ninguno de los dos modelos. Se cumple.
  2. En el test `ciss`, que no anota la fase, v3 no empeora el F1 micro frente a v2 con ninguno de los dos modelos.

  El primer test se mide después de decidir y no entra en la decisión.

{TESTS}

## Consecuencias

{CONSECUENCIAS}
