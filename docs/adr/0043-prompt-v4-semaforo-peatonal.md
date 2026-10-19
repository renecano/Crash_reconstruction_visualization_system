# ADR 0043 — Prompt v4: la extracción lee el semáforo peatonal

- **Estado:** propuesto (2026-10-19). El método y el criterio quedaron escritos antes de escribir el lote nuevo y antes de medir. La decisión se agrega al final cuando haya números.
- **Contexto:** el contrato 1.3.0 agregó `semaforo_peatonal` (ADR 0038), pero ningún prompt lo pedía. El semáforo peatonal solo llegaba si la persona lo ponía en el croquis. Los prompts v1–v3 no podían pedirlo sin cambiar su huella y perder sus grabaciones.

## Diseño

1. **Prompt v4 = v3 más la regla 13:**
   - **Qué dice:** `semaforo` es el de los vehículos y `semaforo_peatonal`, el de los peatones.
   - **Cuándo usar el peatonal:** solo si el relato dice que era el de los peatones. «El semáforo» o «la luz» sin más es `semaforo`.
   - **Los dos a la vez:** si el relato menciona ambos, van los dos.
2. **Esquema por versión:** `semaforo_peatonal` entra en el `enum` de dispositivos solo desde v4 (`SINCE_V4_DEVICES`, `devicesFor`/`devices_for`). Pasa lo mismo que con la fase de las marcas en v3 (`SINCE_V3`).
3. **Glosario por versión:**
   - **El problema:** el glosario entra en el prompt de todas las versiones y su versión, en la huella. Una entrada nueva habría cambiado las huellas de v1–v3.
   - **Entradas con `desde`:** una entrada con `desde: "extraccion_v4"` solo entra en el prompt de v4 y siguientes.
   - **`version_por_prompt`:** guarda la versión del glosario que vio cada prompt anterior (1.4.0).
   - **Resultado:** las huellas de v1–v3 no cambian (f6b693169a4199c3, 5816b86ad0e718ee y 86f6a54999b8cbf7, en Python y TS, con prueba). La de v4 es 613dc7f7bc958502.
   - **Reglas:** la línea base usa todas las entradas.
4. **Entrada nueva del glosario, `semaforo_peatonal`:**
   - **Patrones:** «semáforo peatonal», «semáforo de/para (los) peatones», «luz de (los) peatones», «luz peatonal», «muñequito» y «monito verde/rojo».
   - **Precedencia:** la coincidencia más larga gana, así que «semáforo peatonal» ya no da `semaforo`.
   - **Orden de trabajo:** los patrones se escribieron antes de leer el lote nuevo.

## Cómo se mide (E1)

- **Anotaciones anteriores al tipo:**
  - **Tests congelados:** dos relatos del primer test hablan del semáforo peatonal y están anotados `semaforo`, porque el tipo no existía. No se tocan.
  - **Dev:** los dos relatos que lo mencionan, en `dev-002` y `dev-005`, se reanotaron como `semaforo_peatonal`; dev no está congelado.
- **Métrica común:**
  - **Regla:** `semaforo_peatonal` cuenta como `semaforo`, en la predicción y en la referencia. Así v1–v4, las reglas y los tests congelados siguen comparables.
  - **Comprobación:** con esta regla, E1 de v3 en el test CISS y en el primer test da los mismos números que antes; solo cambian los metadatos y la latencia de las reglas.
- **Métrica del tipo nuevo:**
  - **Dónde:** `semaforo_peatonal` con su etiqueta exacta, solo en dev, donde la anotación ya conoce el tipo.
  - **Qué se reporta:** aciertos, inventados y no leídos.
  - **Qué no cambia:** no entra en el F1 micro ni en el macro.
- **Lote dirigido `dev-007`:**
  - **Contenido:** 30 relatos con semáforos peatonales dichos de distintas maneras, con los dos semáforos, y casos difíciles con solo el de los vehículos aunque haya peatones.
  - **Quién lo escribe:** un agente que no ve la línea base, el glosario ni los prompts.
  - **Quién lo revisa:** otro agente revisa la anotación.

## Criterio para producción

Se fija antes de medir, en el mismo orden que los ADR 0012 y 0019:

1. **Dev, con `dev-007`:** v4 no empeora el F1 micro de la métrica común frente a v3 con ninguno de los dos modelos. v3 también se graba en los relatos de `dev-007`, para comparar sobre el mismo conjunto.
2. **Test `ciss`:** v4 no empeora el F1 micro frente a v3 con ninguno de los dos modelos.

Si se cumplen los dos, v4 pasa a producción (`PROMPT_VERSION`). El primer test se mide después de decidir y no entra en la decisión. La métrica del tipo nuevo se reporta junto a las reglas, pero no es condición: v3 no puede dar el tipo, así que lo que v4 detecte es ganancia si no empeora lo demás.

## Costo

Con el costo por relato de v3 (`costo_usd_por_1000` en `e1_extraction_*_v3.json`):

- dev con repetición y contrafactuales en v4, más `dev-007` en v3: unos 6 USD;
- el test CISS en v4: unos 3 USD.

El primer test, que se mide después de decidir, cuesta aparte. Todo cabe en el tope diario de 20 USD en local.
