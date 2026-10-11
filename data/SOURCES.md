# Fuentes de datos

Cada dato externo que usa Croquis se registra aquí (CLAUDE.md, regla 4). Formato: origen, URL exacta, fecha de descarga, licencia y script que lo obtiene y procesa.

| Fuente                                                     | URL       | Descargado | Licencia                                                                                          | Script                                      | Uso                                                                    |
| ---------------------------------------------------------- | --------- | ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| INEGI — ATUS, conjunto de datos abiertos (en localización) | pendiente | pendiente  | [Términos de Libre Uso de la Información del INEGI](https://www.inegi.org.mx/inegi/terminos.html) | `data/croquis_data/atus.py` (en desarrollo) | Cifras de PLAN §1 y distribución de tipos de accidente para Relatos-MX |

## Notas

- La URL histórica `https://www.inegi.org.mx/contenidos/programas/accidentes/datosabiertos/atus_anual_csv.zip` (131.7 MB) responde con `Last-Modified: 19 Aug 2024`, así que no incluye 2024 ni 2025. Las variantes anuales probadas (`atus_anual_2024_csv.zip`, `atus_anual_2025_csv.zip`, `conjunto_de_datos_atus_2025_csv.zip`, …) devuelven la página "Esta liga ya no existe". La pestaña "Datos abiertos" de la página del programa se renderiza con JavaScript; se localizarán las ligas con un navegador headless y se registrarán aquí.
