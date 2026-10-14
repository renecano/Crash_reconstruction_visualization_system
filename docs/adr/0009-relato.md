# ADR 0009 — Comprensión del relato (F6)

- **Estado:** aceptado (2026-10-14, F6)
- **Contexto:** PLAN §5 pide que el relato se redacte en el dispositivo, que un extractor (Claude) produzca la `EscenaSpec` con evidencia literal, un verificador que baje a `supuesto` lo que no tenga cita, un glosario de español mexicano, preguntas que reduzcan la incertidumbre y un benchmark propio (Relatos-MX, ≥ 300 relatos, test congelado) para E1 con tres alternativas: reglas, Claude Haiku y Claude Sonnet.

## Decisiones

1. **Redacción de PII con datos compartidos y paridad probada.** Los patrones y pistas viven en `packages/extraction/data/pii.json`; la referencia Python (`croquis_extraction.pii`) y el port TS (`@croquis/extraction`, que corre en el navegador) los leen igual.
   - **Regex común:** solo un subconjunto que se comporta igual en `re` con `re.ASCII` y en `RegExp` sin bandera `u` (`\d`, `\s`, `\w`, `\b` ASCII, lookbehind de ancho fijo, sin banderas en línea). Lo que antes era insensible a mayúsculas corre sobre el texto plegado.
   - **Espacios Unicode:** se normalizan uno a uno a `" "` (24 caracteres listados igual en ambos lados), así que las posiciones no cambian.
   - **Paridad:** `croquis-extraction golden build|check` escribe `packages/extraction/fixtures/golden.json` (Relatos-MX completo más casos difíciles: emojis, espacios raros, mayúsculas con acento) y Vitest compara redacción, tramos y glosario. Las posiciones de Python son puntos de código; el port las convierte desde UTF-16.
   - **Nombres:** diccionario de 491 nombres de pila de DataMX (CC0), más pistas de contexto y apellidos frecuentes del INEGI. Los nombres que también son palabras comunes ("Rosa", "Luz") no se redactan al inicio de una oración sin otra pista: es una fuga aceptada y medida en E1 (ver limitaciones).
2. **Claude produce hechos, no la `EscenaSpec` completa.** El modelo devuelve, con salida estructurada (`output_config.format` con `json_schema`), una lista plana de hechos `{campo, vehiculo, persona, valor, cita}` más vehículos, personas, dispositivos y hasta tres preguntas. El constructor determinista (`spec_builder`), el mismo que usan la línea base y la referencia de Relatos-MX, los convierte en `EscenaSpec`.
   - **Por qué:** el esquema completo del contrato (48 definiciones, `$ref`, patrones y rangos) es grande para la salida estructurada y le daría al modelo la oportunidad de producir poses y números que no le tocan (CLAUDE.md: el LLM nunca genera geometría ni números físicos finales). Con un constructor común, E1 compara la comprensión del relato y nada más.
   - **Esquema sin uniones:** lo opcional es una lista que puede faltar; `valor` va como texto y se valida en código contra el contrato (los valores inválidos se descartan y se cuentan).
   - **Citas:** una cita que no aparece literal baja el hecho a `supuesto`; E1 reporta esa tasa como alucinación de campo y el verificador confirma que la spec final no tiene citas falsas.
3. **Grabación y reproducción.** `CROQUIS_LLM_MODO=replay|record|live`; CI solo usa `replay`.
   - **Archivos:** cada respuesta se guarda en `extraction/grabaciones/<modelo>/<id>.json` con la salida, el uso de tokens, la latencia, el costo y el `request_id`.
   - **Validez:** una grabación solo vale para el mismo texto (SHA-256) y la misma huella de prompt y esquema; si alguno cambia, hay que volver a grabar.
4. **Modelos, precios y tope de gasto.**
   - **Modelos:** `claude-sonnet-5-5` por omisión (PLAN §5.1) y `claude-haiku-5-5` para comparar, con esfuerzo `medium` y razonamiento adaptativo por omisión.
   - **Respaldo ante rechazos:** Sonnet usa el del servidor (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Un rechazo final o una respuesta truncada es un error y no se graba.
   - **Precios (USD por millón de tokens, tabla oficial vigente el 2026-10-14):**

     | Modelo                                  | Entrada | Salida | Lectura de caché | Escritura de caché  |
     | --------------------------------------- | ------- | ------ | ---------------- | ------------------- |
     | Sonnet 5.5                              | 2       | 10     | 0.20             | ×1.25 de la entrada |
     | Haiku 5.5 (≤ 100 000 tokens de entrada) | 0.10    | 0.50   | 0.01             | ×1.25 de la entrada |

   - **Caché:** el prompt de sistema (instrucciones, valores válidos y glosario) es estable y se marca con `cache_control`.
   - **Tope de gasto:** `CROQUIS_LLM_DAILY_BUDGET_USD` (PLAN §16.4), contabilizado por día en `extraction/grabaciones/gasto.json`; con tope 0 no hay llamadas.
5. **Glosario versionado y compartido** (`packages/extraction/data/glosario.json`): patrones sobre el texto plegado, efectos sobre campos del contrato y pregunta sugerida en las entradas ambiguas. Lo usan la línea base, el prompt de Claude y el navegador.
6. **Relatos-MX.**
   - **Distribución:** ATUS 2025 con mínimos para las categorías raras.
   - **Formato:** TOML con marcas de PII sintética y ranuras contrafactuales.
   - **Referencia:** construida con el mismo constructor y validada con el esquema y el validador semántico.
   - **Autoría del test:** los lotes de test los escribieron agentes que no leyeron la línea base, el glosario ni el redactor, para reducir el sesgo de autoría.
   - **Congelamiento:** el test se congela con hash (`relatos freeze`) antes de la primera evaluación.
   - **Licencia:** CC BY 4.0.
   - **Caída de pasajero:** el contrato no tiene un evento propio; se representa con `inicio_frenado` (frenón) o `arrastre` (arrancó mientras bajaba).
7. **E1 por hechos.** La puntuación compara hechos con cita: lo supuesto ni suma ni resta.
   - **Valores genéricos:** los valores genéricos del relato ("camioneta", "llovía", "de noche", "en el cruce", "camión") aceptan cualquiera de sus precisiones.
   - **Números:** se aceptan dentro de una tolerancia (velocidad ±10 km/h, distancias ±2 m) y además se reporta su error absoluto.
   - **Vehículos:** se emparejan narrador con narrador y luego por clase y maniobra.

## Consecuencias

- Sin `ANTHROPIC_API_KEY` las columnas de Claude de E1 quedan "pendiente" y el resto de F6 avanza. Grabar es un comando (`croquis-extraction claude record --split test`) que respeta el tope de gasto.
- Cambiar el prompt, el esquema de salida o el glosario invalida las grabaciones (la huella cambia): es deliberado, para que un número de E1 siempre corresponda al prompt vigente.
- El port TS de la redacción debe cambiar junto con la referencia; `golden check` en CI y la prueba de paridad lo garantizan.
