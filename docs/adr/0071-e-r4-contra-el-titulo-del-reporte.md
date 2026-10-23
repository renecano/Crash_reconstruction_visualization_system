# ADR 0071 — E-R4 también contra la modalidad del título del reporte

- **Estado:** aceptado (2026-10-23).
- **Contexto:** la auditoría de R4b (ADR 0069) mostró que la etiqueta «otra» de R0, lo que Claude leyó en las conclusiones de cada reporte, mezcla hechos sin choque con choques que el propio título del reporte nombra. René pidió agregar a E-R4 una segunda medición contra la modalidad del título, sin quitar la de R0, y publicar las dos lado a lado. La regla para leer el título se define con desarrollo, se congela en un commit antes de mirar la prueba y la prueba se mide una sola vez.

## Decisión

- **La regla** (`packages/cesvi/src/titulo-reporte.ts`, congelada en `37b1ffa`):
  1. Se toma la frase tras «modalidad de», hasta lo que ya describe el hecho («en el que», «donde», «entre»…).
  2. De ella, su primera cláusula: el título nombra primero la modalidad («salida del camino y volcadura» → salida del camino).
  3. Se aplica la primera regla que coincide, en este orden:
     1. reversa;
     2. hecho sin choque → «otra» (incendio, inundación, corte de circulación, bache, desprendimiento, partes bajas, daños en el motor…);
     3. objeto fijo;
     4. volcadura;
     5. salida del camino;
     6. alcance (también «posterior»);
     7. frontal;
     8. lateral (perpendicular, oblicua, embestida, raspado);
     9. atropello;
     10. carambola («múltiple»).
  4. Un título genérico («colisión», «choque», «impacto», «informe») o sin «modalidad de» no da modalidad: ese reporte no entra en esta medición.
- **Con desarrollo**, al revisar la regla, se corrigieron dos errores antes de congelarla:
  - «salida de» cortada por un salto de línea;
  - `\bposte` atrapaba «posterior» (lo encontró la prueba unitaria).
- **Las predicciones de Croquis no cambian:** son las ya medidas de v1 (ADR 0067) y v2 (ADR 0069). Solo cambia la referencia.
- **Línea base:** la modalidad más frecuente en los títulos de desarrollo («alcance»), igual que la de R0 se toma de sus etiquetas de desarrollo.
- **Script:** `eval/cesvi_r4c_titulo.mts` (`revisar`, `medir <partición>`).
  - **Resultados:** `eval/results/cesvi_r4c_titulo_{desarrollo,prueba}.json`, con la frase y la modalidad del título de cada reporte.
  - **Los textos crudos siguen fuera de git.**

## Medición

| Modalidad                                   | Referencia         | v1     | v2     | Línea base                 |
| ------------------------------------------- | ------------------ | ------ | ------ | -------------------------- |
| Desarrollo (459; 347 con título comparable) | título del reporte | —      | 55.0 % | 33.4 % («siempre alcance») |
| Prueba (205; 190 con etiqueta R0)           | etiqueta de R0     | 34.2 % | 39.5 % | 35.3 % («siempre otra»)    |
| Prueba (205; 156 con título comparable)     | título del reporte | 48.7 % | 55.8 % | 37.2 % («siempre alcance») |
| Prueba, modalidades físicas                 | etiqueta de R0     | 52.8 % | 59.3 % | 37.4 %                     |
| Prueba, modalidades físicas                 | título del reporte | 55.1 % | 61.6 % | 42.0 %                     |

**Por modalidad en la prueba, v2 contra el título:**

| Modalidad         | Resultado    |
| ----------------- | ------------ |
| Alcance           | 72.4 % de 58 |
| Lateral           | 68.6 % de 35 |
| Volcadura         | 66.7 % de 9  |
| Objeto fijo       | 52.9 % de 17 |
| Frontal           | 50 % de 6    |
| Salida del camino | 14.3 % de 7  |
| «Otra»            | 11.1 % de 18 |
| Reversa           | 0 de 5       |
| Carambola         | 0 de 1       |

## Límites

- **49 de los 205 reportes de la prueba** no tienen un título comparable (genérico o sin «modalidad de»). La medición contra el título es sobre los 156 restantes; la de R0, sobre 190.
- **Lo que ya se sabía de la prueba:** antes de esta regla, la auditoría de R4b ya había contado, con otra clasificación más gruesa, cuántas «otra» de la prueba tenían título de choque (solo conteos, sin ajustar nada). Esta regla se escribió y se probó solo con desarrollo.
- **La regla es léxica:** lee lo que CESVI escribió. Si el título y las conclusiones del reporte no dicen lo mismo, esta medición sigue al título.

## Consecuencias

- **E-R4 publica las dos referencias.** Contra el título del reporte, la v2 de Croquis gana 18.6 puntos a su línea base (55.8 % contra 37.2 %). Contra la etiqueta de R0, la ventaja es de 4.2 puntos.
