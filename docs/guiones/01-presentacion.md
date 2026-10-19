# Guion 1 — Presentación (≈ 2 min)

**Para quién:** quien no conoce el proyecto: jurado, portafolio o redes.

**Tono:** humano y directo. Nada de culpas ni de lesiones (PLAN §10).

**Material:**

- la página de historia (`/historia`);
- el visor en la escena de Toluca (`/visor?escena=interseccion_toluca`), en calidad alta;
- el recorrido técnico (`/recorrido`).

**Regla de las cifras:** toda cifra que se diga en voz sale de `eval/results/` y está en el README. Si un resultado cambia, se actualiza el guion antes de grabar.

| #   | Tiempo    | En pantalla                                                                                                                                       | Voz                                                                                                                                                                                              |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 0:00–0:12 | Negro. Sonido de lluvia ligera. Aparece la captura del cruce de Toluca desde arriba (`public/historia/toluca-cruce.jpg`), con la leyenda visible. | «Una tarde nublada en Toluca, un taxi entra a un cruce y le pega a un auto en la puerta del chofer.»                                                                                             |
| 2   | 0:12–0:30 | La sección «Y luego hay que contarlo» de `/historia`, con desplazamiento lento.                                                                   | «Después viene lo difícil: contarlo. Al ajustador, al agente de tránsito, a la familia. Cada quien pregunta distinto y la memoria es de fragmentos.»                                             |
| 3   | 0:30–0:45 | La sección «No es un caso raro», con la serie anual de ATUS.                                                                                      | «Y no es un caso raro: el INEGI registró más de 380 mil hechos de tránsito en zonas urbanas y suburbanas en 2025.» (`atus_summary.json`)                                                         |
| 4   | 0:45–1:05 | La lista CROQUIS, letra por letra, con un corte rápido a cada pantalla: relato, campos con su cita, preguntas, croquis, visor.                    | «Croquis: cuentas lo que pasó con tus palabras, la IA lo convierte en datos y marca de qué frase salió cada uno, te pregunta solo lo que falta, acomodas el croquis… y la física hace el resto.» |
| 5   | 1:05–1:25 | El visor de Toluca en cámara lenta, de la cámara libre a la de daño.                                                                              | «La reconstrucción no la inventa la IA: la calcula un solver de física, con la rigidez de los autos medida en pruebas de choque reales.»                                                         |
| 6   | 1:25–1:45 | El recorrido técnico, de E1 a E5. Se detiene en E3, donde WinSMASH tiene la estrella.                                                             | «Cada pieza se mide contra una alternativa simple, con los tests congelados antes de medir. Y donde Croquis pierde, se dice.»                                                                    |
| 7   | 1:45–2:00 | La leyenda en grande: «Reconstrucción ilustrativa… No es un peritaje.» Logo de texto «Croquis» y la URL.                                          | «Croquis no busca culpables: ayuda a explicar. croquis-sage.vercel.app.»                                                                                                                         |

**Notas de producción:**

- **Resolución:** 1920×1080 a 30 fps. Las capturas del visor se graban con el exportador de video del propio visor (MP4), que ya trae la marca en cada cuadro.
- **Música:** sin música con derechos; solo ambiente o música CC0, registrada en `assets/ASSETS.md`.
- **Subtítulos:** en español, quemados en el video y también como archivo `.srt`.
