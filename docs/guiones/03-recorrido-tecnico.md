# Guion 3 — Recorrido técnico (≈ 6 min)

**Para quién:** evaluadores técnicos.

**Material:**

- el recorrido técnico (`/recorrido`);
- el repositorio: `eval/results/`, `docs/adr/` y CI;
- la galería de E5 (`docs/galeria-e5/README.md`);
- el visor.

**Regla de las cifras:** todas las cifras salen de `eval/results/` y están en la tabla del README. Se nombra el archivo en pantalla cuando se cita una.

| #   | Tiempo    | En pantalla                                                          | Voz                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0:00–0:30 | Diagrama: relato → `EscenaSpec` (IA) → solver (física) → visor.      | «La regla de diseño: la IA traduce, la física decide y el visor muestra. El LLM solo produce un contrato, `EscenaSpec`; nunca geometría ni números físicos finales.»                                                                                                                                                                                       |
| 2   | 0:30–1:15 | `/recorrido#E1`: barras del test congelado y del test CISS.          | «E1 mide la extracción contra dos tests congelados: uno de relatos sintéticos y otro cuya verdad sale de los campos codificados de NHTSA, no de quien escribe. La línea base de reglas queda muy abajo. Los relatos los escribieron agentes de IA, y eso es un límite.»                                                                                    |
| 3   | 1:15–2:00 | `/recorrido#E2` y `#E3`. Se detiene en la estrella de WinSMASH.      | «La rigidez sale de miles de pruebas de choque de NHTSA. Contra la caja negra de choques reales, E3, WinSMASH se equivoca un poco menos en promedio; Croquis tiene menos sesgo. Lo publicamos tal cual.»                                                                                                                                                   |
| 4   | 2:00–3:00 | `/recorrido#E5` y después la galería: pares de foto y render.        | «E5 compara la malla deformada del visor con el aplastamiento medido en autos reales. La partición se congeló antes de medir, se ajustó solo con desarrollo, y el test se corrió una vez. Croquis gana en el perfil punto por punto, pero un perfil triangular simple predice mejor la profundidad máxima. En los frontales se ve: Croquis deforma menos.» |
| 5   | 3:00–3:45 | `/recorrido#E7` y `#E8`. Corte al trabajo E8 de CI en verde.         | «En producción no corre Python: el solver es un port en TypeScript, con paridad número por número contra la referencia (E7). E8: el resultado es idéntico bit a bit en Chromium, Firefox y WebKit, con funciones matemáticas propias.»                                                                                                                     |
| 6   | 3:45–4:30 | `/recorrido#E6`. Corte al visor con WebGPU y el selector de calidad. | «En una laptop de 8 GB con gráficos integrados, el visor cumple sus metas en baja y media. Alta y ultra se miden en una computadora de demo, que sigue pendiente.»                                                                                                                                                                                         |
| 7   | 4:30–5:15 | Repositorio: `docs/adr/`, `eval/results/` y un PR con CI.            | «Cada decisión tiene su ADR. Cada número tiene su script y su resultado versionado. CI no llama a la API de Claude: usa respuestas grabadas. Nada entra a main en rojo.»                                                                                                                                                                                   |
| 8   | 5:15–6:00 | README, sección «Límites y siguiente paso».                          | «Lo que falta: E9 con personas reales, alta y ultra en la computadora de demo y un mejor modelo de forma del daño, validado con datos nuevos. Croquis es una reconstrucción ilustrativa, no un peritaje.»                                                                                                                                                  |

**Notas de producción:**

- **Revisión de cifras:** antes de grabar, revisar que lo que se dice coincide con el README del día; si una evaluación cambió, se corrige el guion.
- **Respaldo de cada afirmación:** cada una de los pasos 2 a 6 se respalda en pantalla con el enlace del recorrido técnico, que lleva al archivo de resultados.
