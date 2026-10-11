# IA responsable en Croquis

Resumen operativo de PLAN §10. Cada medida indica dónde vive en el código y en qué fase se verifica.

## Lo que Croquis nunca hace

1. Asignar culpa o "presunto responsable".
2. Diagnosticar o estimar lesiones de personas reales (ADR 0002, decisión 2).
3. Presentar la reconstrucción como peritaje o prueba.
4. Inventar datos sin marcarlos como `supuesto`.
5. Guardar el relato completo en el servidor sin consentimiento explícito.
6. Mostrar contenido gráfico de personas lesionadas.

## Medidas y dónde están

| Medida                                                                                                             | Implementación                                                                                             | Fase                          | Verificación                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| Leyenda visible: "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje." + semilla + hash  | `apps/web/src/components/legend.tsx`; `services/api/croquis_api/main.py` (`LEGEND_TEXT`)                   | F0                            | Prueba unitaria y e2e de la portada; snapshots del visor (F3); prueba de exportaciones (F9) |
| Hash del relato en lugar del texto                                                                                 | `extraction/croquis_extraction/hashing.py`                                                                 | F0                            | Pruebas con Hypothesis                                                                      |
| PII redactada en el dispositivo                                                                                    | `extraction` (redactor regex + diccionario + placas MX)                                                    | F6                            | Tasa de fuga medida en E1                                                                   |
| Todo campo con `fuente`, `confianza` y evidencia                                                                   | `escena.schema.json`                                                                                       | F1                            | Validación del esquema; verificador de evidencia (F6)                                       |
| Consentimiento separado para guardar casos y para mejorar el sistema                                               | API y UI                                                                                                   | F6/F11                        | Pruebas e2e                                                                                 |
| Sesgo contrafactual (sexo, edad, tipo de vehículo)                                                                 | `eval/relatos-mx`                                                                                          | F6                            | E1                                                                                          |
| Lenguaje sin culpa en preguntas y banderas                                                                         | `extraction` (detector de contradicciones)                                                                 | F6/F7                         | Revisión de textos generados en pruebas                                                     |
| Modos de falla documentados (relato contradictorio, datos insuficientes, física fuera de rango, LLM no disponible) | API + UI (croquis manual siempre disponible)                                                               | F6/F9                         | Pruebas de cada modo                                                                        |
| Límite de gasto y de peticiones por usuario                                                                        | `services/api/croquis_api/settings.py` (`CROQUIS_LLM_DAILY_BUDGET_USD`, `CROQUIS_LLM_RATE_LIMIT_PER_HOUR`) | F0 (config) / F6 (aplicación) | Pruebas de la API                                                                           |
| Sin logotipos ni marcas en modelos 3D; sin sangre ni lesiones visibles                                             | `assets/pipeline`, `packages/viewer`                                                                       | F3/F5                         | Revisión de assets en `assets/ASSETS.md`                                                    |
