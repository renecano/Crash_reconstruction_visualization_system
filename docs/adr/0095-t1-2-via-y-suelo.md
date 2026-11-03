# ADR 0095 — T1.2: vía y suelo del escenario 3D

- **Estado:** aceptado (2026-11-02). Segundo subtramo de T1 (PLAN-CESVI v3). Incluye los dos cambios que René pidió al aprobar T1.1: sin anillos ni bandas de color en el pasto de noche (y pasto oscuro y neutro), y la noche con lluvia a ≥ 60 fps de mediana en media.
- **Contexto:** tras T1.1 el piso seguía siendo un plano verde liso y la vía franjas grises sin desgaste; en las carreteras no había acotamiento ni barrera; las huellas eran cuadriláteros de bordes duros; de noche con lluvia el asfalto encharcado calculaba ruido 3D por pixel para los charcos (`t1_tirones.mjs`: sin ese estado, +15 % de fps) y el lienzo de 8 bits de media mostraba bandas alrededor de cada luminaria.

## Decisión

1. **Mapa de desgaste por escena** (`road-wear.ts`, `buildWearMap`): una textura de 512 × 512 sobre una ventana de 160 m centrada en la acción, calculada una vez con la semilla de la escena. Rojo: rodadas (a ±0.8 m del eje de cada carril, derivadas de las rayas de la plantilla o de las calles del mapa) más pulido general; verde: parches de bacheo; azul: bajos donde se junta el agua. El material del asfalto (`applyWear`) oscurece y pule las rodadas, pinta los parches y, en `encharcado`, pone los charcos en los bajos en lugar del ruido por pixel. Determinista; pruebas de rodadas, fracciones y ventana.
2. **Texturas del entorno también en media, solo el mapa de color** (`lite`). ADR 0026 (decisión 7) las dejó solo en alta y ultra por 3–4 ms en la laptop; con los tres mapas (color, normal, rugosidad) costaban un 22 % de los fps en AXA (`t1_tirones.mjs`, `sinTexturas`); con solo el color, la variación de brillo a 23 m leída de la misma textura (no ruido por pixel) y rugosidad calibrada, media queda en 60 fps. Alta y ultra conservan los tres mapas.
3. **Acotamientos y barreras por clase de vía** (`road-decor.ts`): franja de grava de 2.5 m (o `ancho_acotamiento`) a cada lado en `carretera_dos_carriles` y `autopista` (la plantilla de autopista ya la trae dentro del ancho) y en `motorway`/`trunk` del mapa (AXA); barrera metálica (riel de doble onda simplificado a 0.55 m, postes instanciados cada 4 m) en autopista y vías rápidas del mapa. Procedurales, no del lugar real.
4. **Huellas como calcomanías** (`ground-marks-material.ts`): la geometría de `quadsToGeometry` lleva `u` a lo ancho de la marca y el material suaviza el 35 % de cada borde. Instantes y posiciones siguen saliendo del solver.
5. **Tramado contra las bandas** (`dither.ts`): ruido de gradiente entrelazado (Jimenez 2014, sin seno: con `sin` costaba 12 % de los fps) de ±1/2 nivel sumado como emisión (después de la iluminación, amplitud constante) en el pasto, la banqueta, el acotamiento, el asfalto y las rayas, **solo de noche**, que es cuando se ven las bandas (`stdDither`, `texturedPlanarMaterial`, `asphaltMaterial`). three r186 no aplica `material.dithering` en WebGPU.
6. **Pasto de noche oscuro y neutro:** `groundColor` nocturno pasa de `#2a3326` (verde que, con el ambiente cálido del alumbrado, salía oliva) a `#1c1d1b`.
7. **Densidad en media:** la lluvia fuerte baja de 6000 a 4000 estelas (la ligera y el granizo, en proporción) y **de noche media dibuja a 0.8 de la resolución** (`NIGHT_PIXEL_RATIO_MEDIA`): con cuatro conos de luz reales (dos faros y dos luminarias), lluvia y piso mojado, la GPU integrada daba 39 fps de mediana a resolución completa y 62.5 a 0.8; sin luminarias, 43; sin texturas, 37; es decir, el costo es de las luces, que son función. Recorte de densidad de media (PLAN §7.8), alta y ultra no cambian.
8. **El precompilado espera a las texturas** (`texturedGraph` en `SceneViewer`): cambiar los materiales después del precompilado obligaba a compilar otra vez en el hilo principal (p1 de 5 fps).

## Lo que no entra

- Juntas de concreto y alcantarillas, gotas sobre el piso mojado: quedan anotados en «Endurecimiento pendiente».
- Las curvas de la plantilla (arcos) no llevan acotamiento ni barrera todavía.

## Evidencia

- Capturas «t1.2» contra «t1.1» en `docs/cesvi/t1/`; fps en `eval/results/e6_t1_t1.2_media.json` (mediana de 3, media, laptop): AXA 62.9, cruce 76.9, noche con lluvia 68.5, carambola 70.4 (T1.1: 66.2, 65.8, 38.9, 64.9). Las cuatro cumplen la meta de media.
- Pruebas: `road-decor.test.ts` (5), `road-wear.test.ts` (4), `scene-graph.test.ts` (u de las marcas), `env-textures.test.ts` (media).
