# ADR 0031 — Exportaciones: cuadros, glTF, video, informe y croquis (F9)

- **Estado:** aceptado (2026-10-17). Se completa por partes; esta versión cubre cuadros PNG y glTF, y fija la decisión del video.
- **Criterio (PLAN §7.9, §10):**
  - **Qué se exporta:** video (WebM y MP4), cuadros PNG, escena glTF, informe PDF y croquis 2D (SVG, PNG y PDF).
  - **La marca:** todo lleva «Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje.», más la semilla y el hash de entradas.
  - **Dónde se genera:** en el navegador (PLAN §3: en producción no corre Python ni hay servidor de archivos).

## Decisiones

1. **Leyenda única** (`packages/scene-schema/src/legend.ts`): el texto, la semilla, el hash completo de entradas y la atribución de OpenStreetMap cuando la escena usa su vía (ADR 0023).
   - **Quién la usa:** el visor, el informe, el croquis y cada exportación.
   - **El texto no se repite** en ningún otro lugar del código.
2. **Captura de cuadros** (`SceneViewer` → `onExport`):
   - **Cómo dibuja:** el visor entrega una API que dibuja un instante a demanda (`advance` de React Three Fiber, con el reloj en pausa) y copia el lienzo en la misma tarea, antes de que el navegador lo presente.
   - **Backends:** así sirve con WebGPU y con WebGL 2 sin `preserveDrawingBuffer`.
   - **Tamaño fijo** (720p, 1080p o 4K): se cambia el tamaño del renderer con relación de píxeles 1 y se restaura después.
   - **Verificación:** en la laptop, con GPU real, WebGPU y WebGL 2 dieron el mismo cuadro a 1920 × 1080; la prueba e2e lo cubre con WebGL 2.
3. **PNG** (`export/capture.ts`, `export/png.ts`): la marca va dibujada en una franja abajo y, además, como texto del archivo.
   - **Por qué `iTXt`:** el texto va en un chunk `iTXt` (UTF-8). `tEXt` solo admite Latin-1 y la marca lleva «—».
   - **Sin dependencias:** CRC-32 y chunks siguen la especificación PNG del W3C.
4. **glTF** (`export/gltf.ts`, `.glb`):
   - **Contenido:** la escena en el instante actual y una animación de todo lo que se mueve: vehículos, volcaduras, restos, personas con sus huesos y el daño (pesos de los morph targets).
   - **Muestreo:** a 30 cuadros por segundo con `graph.update(t)`, que vuelve después al instante actual.
   - **La copia:** se exporta una copia (`SkeletonUtils.clone`), no la escena que se dibuja. Sus materiales de nodos pasan a los clásicos equivalentes, que es lo que entiende `GLTFExporter`. Los grupos de instancias vacíos se ocultan, porque `GLTFExporter` les escribiría accesores vacíos.
   - **La marca:** va en `asset.copyright` y en los `extras` de la escena.
   - **Carga diferida:** el exportador y `SkeletonUtils` se cargan solo al exportar, para no pesar en la carga del visor (E6).
5. **Video:** WebCodecs con Mediabunny (MP4 H.264 y WebM VP9), dibujado cuadro por cuadro con la marca, con MediaRecorder (WebM) como respaldo. Se elige sobre ffmpeg.wasm, que nombra PLAN §7.9:
   - **Licencia:** `@ffmpeg/core` es GPL-2.0-or-later; Mediabunny es MPL-2.0.
   - **Tamaño:** el núcleo pesa unos 31 MB de WASM y tendría que entrar en la precarga sin red (ADR 0030). WebCodecs usa los codificadores del navegador.
   - **Calidad:** dibujar cuadro por cuadro con tiempos exactos da un video sin cuadros perdidos, que no depende de los fps de la máquina. Una grabación en tiempo real con MediaRecorder sí depende.
   - **Lo que no cambia:** se entregan los mismos formatos de PLAN (MP4 y WebM), así que no es un recorte.

## Límites conocidos (glTF)

- **Texturas procedurales:** los efectos TSL (texturas procedurales del asfalto) quedan como su color base.
- **Instancias:** árboles y vidrios van en su lugar del instante actual, porque glTF no anima instancias.
- **Lo que no entra:** el cielo, la lluvia y las luces del visor no se exportan. Son del entorno de dibujo, no de la reconstrucción.

## Pruebas

- **Unitarias (viewer):**
  - PNG: CRC-32 conocido, ida y vuelta de texto UTF-8 con propiedades y detección de chunks alterados.
  - glTF de `volcadura`, reabierto con `GLTFLoader`: marca, duración, traslación, rotación, pesos del daño, vehículos y restos animados, y solo materiales clásicos.
  - glTF de `peaton_cruce`: cuerpo con esqueleto y pistas de sus huesos.
- **e2e** (`exportar.spec.ts`): descarga el PNG a 1280 × 720 y el `.glb` y los abre.
  - **PNG:** tamaño, marca en el texto del archivo, escena dibujada (no en blanco) y franja oscura abajo.
  - **`.glb`:** marca en `asset` y en la escena, vehículos y animación.
