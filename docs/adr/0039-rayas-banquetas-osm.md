# ADR 0039 — Rayas, banquetas y guarniciones en las calles de OpenStreetMap (F8, pendiente cerrado en F11)

- **Estado:** aceptado (2026-10-19). Reemplaza la parte del ADR 0023 que decía que las rayas y banquetas de OSM «no se infieren».
- **Contexto:** con la red de OSM (escena `interseccion_toluca`), el visor dibujaba solo la calzada, sin rayas, banquetas ni guarniciones. Junto a las plantillas se veía pobre. Era un pendiente de F8.

## Decisión

Regla: lo que no viene en los datos no se inventa.

- **Rayas:**
  - **Cuándo:** solo en las calles con `lanes` de OSM (`carriles`).
  - **Con qué reglas:** las de las plantillas. Orillas blancas, doble amarilla al centro en doble sentido (`oneway` de OSM) y discontinuas entre carriles, con el patrón del límite de la escena.
  - **Sin `lanes`:** no se pinta nada.
- **Banquetas y guarniciones:** siguen a `lugar.banquetas` y `lugar.guarniciones`, como en las plantillas, salvo en `motorway` y `trunk` (y sus enlaces).
- **Cruces:**
  - **Qué se corta:** las rayas, banquetas y guarniciones, donde otra calle cruza con un ángulo de más de 30°.
  - **Lo que no se corta:** una calle que sigue en otra vía de OSM, casi en línea (un mismo nombre partido en varias vías).
  - **Pavimento ajeno:** las banquetas y guarniciones tampoco caen sobre la calzada de otra calle con ningún ángulo. Así, en una avenida de dos cuerpos no aparece banqueta encima del otro cuerpo.
  - **Pasos peatonales:** las rayas centrales y de carril se cortan también en los pasos.
- **Croquis 2D:** sigue dibujando las calles del mapa como trazos de su ancho, sin rayas. El visor y el croquis no comparten la geometría del mapa (el croquis no depende del visor). Queda como pendiente llevarla a `croquis-2d`.

## Medición (E6 antes y después)

`node eval/e6_ab.mjs` en `interseccion_toluca`, WebGPU, 5 rondas intercaladas, sobre el commit del cambio. Se compara contra el interruptor de diagnóstico `osmSoloCalzada`, que dibuja la red como antes.

| Calidad | fps de la escena | Costo de rayas, banquetas y guarniciones | IC 90 %                | Resultado                     |
| ------- | ---------------- | ---------------------------------------- | ---------------------- | ----------------------------- |
| Media   | 71.4             | 0.62 ms por cuadro                       | 0.32 a 1.76 ms         | `e6_ab_osm_media_webgpu.json` |
| Baja    | 118.8            | sin costo medible (0.06 ms)              | el intervalo incluye 0 | `e6_ab_osm_baja_webgpu.json`  |

La escena sigue sobre las metas de §7.8.

## Consecuencias

- **Imágenes de la historia:** se volvieron a capturar (`scripts/capturas-historia.mjs`).
- **Referencias visuales:** las de `interseccion_toluca` se regeneran en CI y se revisan.
