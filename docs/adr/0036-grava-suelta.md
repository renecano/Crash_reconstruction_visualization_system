# ADR 0036 — Grava suelta: grano de piedra, bordes suaves y textura CC0 (F8, pendiente cerrado en F11)

- **Estado:** aceptado (2026-10-18).
- **Contexto:** en `objeto_fijo_arbol`, la grava suelta se veía como manchas de camuflaje al acercarse (pendiente de F8).
  - **Cómo estaba hecha** (ADR 0020): manchas de ruido de 0.6 m, nítidas, lisas y de color claro.
  - **Restricción:** las texturas solo se aplican en alta y ultra (ADR 0026), así que el arreglo tenía que verse también en baja y media.

## Decisión

1. **Forma, en todas las calidades:**
   - manchas más chicas (0.35 m), con bordes suaves (ancho 0.35 en unidades de ruido);
   - opacidad parcial (0.65) y un color más cercano al asfalto.
   - Así la grava se ve esparcida, no a manchas.
2. **Grano, en todas las calidades:** dentro de la mancha, el brillo varía ±30 % con un ruido del tamaño de una piedra (2.5 cm). No descarga nada.
3. **Textura, en alta y ultra:** «Gravel Stones» de Poly Haven (Amal Kumar, CC0, mosaico de 2 m, el tamaño real de la toma).
   - **Cómo se usa:** llena las manchas con su color y su relieve, normalizados al color calibrado, como las demás texturas (ADR 0024).
   - **Cuándo se carga:** solo en escenas con `grava_suelta` (`SceneGraph.wantedTextures`), así que el resto no descarga sus 0.25 MB.
4. **Lo demás no cambia:** aceite, lodo y charcos conservan su aspecto (los campos nuevos `edge` y `opacity` valen por omisión lo de antes).

## Medición (E6 antes y después, ADR 0026)

`node eval/e6_ab.mjs` en `objeto_fijo_arbol`, WebGPU, 5 rondas intercaladas, sobre el commit `5157fee`. Se compara contra el interruptor de diagnóstico `gravaPrevia`, que dibuja las manchas de antes.

| Calidad | fps de la escena | Costo de la grava nueva | IC 90 %        | Resultado                       |
| ------- | ---------------- | ----------------------- | -------------- | ------------------------------- |
| Media   | 75.0             | 0.5 ms por cuadro       | 0.44 a 2.15 ms | `e6_ab_grava_media_webgpu.json` |
| Baja    | 136.8            | 0.27 ms por cuadro      | 0.15 a 0.52 ms | `e6_ab_grava_baja_webgpu.json`  |

**Lectura:** el costo es pequeño y medible en las dos calidades. La escena sigue sobre las metas de §7.8 (baja ≥ 30 y media ≥ 60) y no es la más lenta del conjunto.

**Variación entre corridas:** una primera corrida con el mismo código, todavía sin commit, dio 0.8 ms en media y nada medible en baja. Se reporta la del commit limpio.

## Atribución

Al agregar la grava se encontró un error en `assets/ASSETS.md`: el asfalto y el pasto se atribuían a Rob Tuytel. Según la API de Poly Haven (`api.polyhaven.com/info/<id>`) y el código del pipeline, son de Dimitrios Savva (Asphalt Track) y de Charlotte Baglioni (Leafy Grass). Se corrigió.
