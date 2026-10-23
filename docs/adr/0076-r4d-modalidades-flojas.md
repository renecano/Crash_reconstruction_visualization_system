# ADR 0076 — R4d: las modalidades flojas (salida del camino, reversa, «otra»)

- **Estado:** aceptado (2026-10-23).
- **Contexto:**
  - René (2026-10-23) pidió, como cuarta prioridad después de R9, mejorar con desarrollo las modalidades flojas de E-R4 y volver a medir la prueba una sola vez.
  - En la v2 (ADR 0069, 0071), la prueba daba, contra la etiqueta de R0 y contra el título:
    - salida del camino: 1 de 10 y 1 de 7;
    - reversa: 0 de 9 y 0 de 5;
    - «otra»: 2 de 67 y 2 de 18.

## Qué se probó con desarrollo

Solo la muestra de desarrollo (459 reportes, lecturas v2 ya guardadas, sin API), contra las dos referencias.

| Regla candidata                                                                                                                                                              | Contra R0     | Contra el título                       | Decisión                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------- | --------------------------------------------- |
| Un vehículo con incendio es «otra» antes que todo (el fuego daña el techo y disparaba «volcadura»)                                                                           | 45.5 → 46.2 % | 55.0 → 56.5 %                          | Se queda                                      |
| Un vehículo con daño mecánico del motor (biela, pistón, lubricación, calentamiento, agua succionada) es «otra», después de un vuelco descrito y de un contacto con un objeto | 46.2 → 47.6 % | 56.5 → 58.5 %                          | Se queda                                      |
| Un vehículo dañado sobre todo en la parte inferior es «otra» («impacto en partes bajas»)                                                                                     | sin cambio    | sin cambio (+1 «otra», −1 objeto fijo) | Se quita: no gana nada                        |
| La salida del camino antes que el vuelco (CESVI titula «salida del camino y volcadura»)                                                                                      | 47.6 → 46.9 % | 58.5 → 58.2 %                          | Se quita: salida gana 4 y volcadura pierde 5  |
| La reversa como maniobra, no como pieza («sensor de reversa», «luz de reversa», «el reverso» de una pieza)                                                                   | 47.6 → 48.1 % | 58.5 → 59.1 %                          | Se queda: quita los 2 falsos casos de reversa |

- **Reversa:**
  - **Por qué no se puede inferir:**
    - las narraciones sin conclusiones no dicen quién se movía;
    - los daños de una reversa y de un alcance son los mismos (frente contra parte posterior);
    - ninguna palabra separa los dos grupos en desarrollo (12 reportes titulados «reversa» contra 73 «alcance» entre los que Croquis infiere alcance).
  - **La clase del vehículo no se pudo probar:** la lectura casi nunca la da, y no se gastan llamadas para inventarla.
- **Salida del camino:** las palabras del terreno (barranco, talud, terreno natural, cuneta) aparecen igual en volcaduras y objetos fijos.

Las reglas v3 se congelaron en `03edc63` antes de mirar la prueba. En desarrollo: 45.5 → 48.1 % contra R0 y 55.0 → 59.1 % contra el título.

## Resultado en la prueba congelada (medida una sola vez)

`eval/results/cesvi_r4c_titulo_prueba.json`, `eval/results/cesvi_r4d_reproduccion_prueba.json` y `eval/results/cesvi_r4d_comparacion.json`:

|                                              | v1     | v2     | v3     | Línea base       |
| -------------------------------------------- | ------ | ------ | ------ | ---------------- |
| Modalidad contra la etiqueta de R0 (190)     | 34.2 % | 39.5 % | 42.1 % | 35.3 % («otra»)  |
| Modalidad contra el título del reporte (156) | 48.7 % | 55.8 % | 58.3 % | 37.2 % (alcance) |
| Modalidades físicas contra R0 (123)          | 52.8 % | 59.3 % | 60.2 % | —                |

Por clase, de la v2 a la v3:

| Clase             | Contra R0     | Contra el título |
| ----------------- | ------------- | ---------------- |
| «Otra»            | 2 → 6 de 67   | 2 → 6 de 18      |
| Reversa           | 0 de 9        | 0 de 5           |
| Salida del camino | 1 de 10       | 1 de 7           |
| Volcadura         | 6 de 10       | 6 → 5 de 9       |
| Alcance           | 36 → 37 de 46 | 42 → 43 de 58    |

Cuando Croquis dice «otra», acierta 6 de 10 contra R0 y 6 de 11 contra el título.

## Límites

- **Reversa y salida del camino siguen sin mejora:** la narración sin conclusiones no trae lo que las separa.
  - Mejorarlas pide otra entrada: la clase de cada vehículo, o quién se movía, preguntados al perito o leídos de otra parte del reporte.
  - Queda en «Endurecimiento pendiente».
- **«Corte de circulación» es «otra» en la regla del título** (congelada en ADR 0071). Croquis lo infiere como lateral, y esa regla no se cambia.
