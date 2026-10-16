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

- **Test `ciss`**, medido después de cumplir el criterio en dev (`e1_extraction_ciss_v2.json` contra `e1_extraction_ciss_v3.json`): v3 no empeora, así que **pasa a producción** (`PROMPT_VERSION = "extraccion_v3"` en Python y TS).
  - **F1 micro:** Sonnet 0.9926 → **0.9926**; Haiku 0.9858 → **0.9871**.
  - **Clase:** Sonnet 0.975 → 0.973; Haiku 0.942 → 0.975.
  - **Repetir el mismo relato:** Sonnet 1 → 2 de 150 pares; Haiku 5 → 5.
  - **Contrafactuales:** Sonnet 1 → 0 de 65; Haiku 1 → 2.
  - **Costo por 1,000 relatos:** Sonnet $9.42 → $9.25; Haiku $1.05 → $1.07.
- **Primer test, medido después de decidir** (`e1_extraction_v3.json`), no entra en la decisión:
  - **F1 micro:** Sonnet 0.919 → **0.924**; Haiku 0.896 → **0.902**.
  - **Contrafactuales crudos:** Sonnet 31 → 21 de 160 pares, contra 20 al repetir; Haiku 33 → 31, contra 21.
  - **Prueba pareada:** no encuentra efecto en ningún tipo.
- **Corridas incompletas:** cuatro respuestas de Haiku en CISS se cortaron por un error de conexión. Las grabaciones de dev y del primer test se detuvieron dos veces porque la laptop se quedó sin memoria. Todo se completó grabando solo lo que faltaba; ningún resultado se midió con respuestas incompletas.

## Consecuencias

- **Producción usa v3.** El solver recibe la fase cuando el relato la dice; si no la dice, la spec no la trae y el solver aplica la convención de 1.0.0.
- **Grabaciones:** las de v1 y v2 siguen valiendo (sus huellas no cambiaron). Las de v3 viven en `grabaciones/extraccion_v3`.
- **Las reglas casi no leen la fase:** su límite es el largo de las marcas (4 de 36 en dev). Mejorar esos patrones queda pendiente, con relatos nuevos que no sean los del lote, para no ajustarlos a él.
- **Fase medida solo en dev:** E1 solo mide la fase en dev, con 30 relatos dirigidos que escribió un agente.
- **Vehículo de las marcas:** la extracción no dice qué vehículo dejó las marcas. El constructor se las asigna al primero, como antes.
- **Pendientes:**
  - un test con la fase anotada, que se congele antes de medir;
  - el vehículo que deja las marcas.
