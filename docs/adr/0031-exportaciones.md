# ADR 0031 — Exportaciones: cuadros, glTF, video, informe y croquis (F9)

- **Estado:** aceptado (2026-10-17). Se completa por partes; esta versión cubre cuadros PNG, glTF, video y el croquis 2D.
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
5. **Video** (`export/video.ts`): WebCodecs con Mediabunny 1.61.6 (MP4, primero H.264; WebM, primero VP9), dibujado cuadro por cuadro con la marca en cada cuadro y en los metadatos (`comment` y `description`), con MediaRecorder (WebM) como respaldo. Se elige sobre ffmpeg.wasm, que nombra PLAN §7.9:
   - **Licencia:** `@ffmpeg/core` es GPL-2.0-or-later; Mediabunny es MPL-2.0.
   - **Tamaño:** el núcleo pesa unos 31 MB de WASM y tendría que entrar en la precarga sin red (ADR 0030). WebCodecs usa los codificadores del navegador.
   - **Calidad:** dibujar cuadro por cuadro con tiempos exactos da un video sin cuadros perdidos, que no depende de los fps de la máquina. Una grabación en tiempo real con MediaRecorder sí depende.
   - **Lo que no cambia:** se entregan los mismos formatos de PLAN (MP4 y WebM), así que no es un recorte.
   - **Secuencia:** `captureSequence` cambia el tamaño del lienzo una sola vez, dibuja cada instante (k/fps) y copia el cuadro antes de ceder el hilo.
   - **El respaldo sin WebCodecs:** MediaRecorder graba el lienzo compuesto, con un periodo completo después de cada cuadro (codifica en tiempo real y, con la CPU ocupada, puede soltar cuadros). Después, `retimeWebm` copia sus paquetes, sin recodificar, a un WebM nuevo con el cuadro k en k/fps y la marca en los metadatos. Así, el respaldo dura lo mismo que la reconstrucción aunque la máquina haya dibujado más lento. Si el navegador aun así pierde cuadros, el panel lo dice.
   - **MP4 sin WebCodecs:** no se puede generar, y el panel lo dice.

6. **Croquis 2D** (SVG, PNG y PDF; PLAN §7.7):
   - **El SVG:** `croquisSvg` (`@croquis/croquis-2d/export`) dibuja el mismo componente del editor en modo `standalone`, con `xmlns`, tamaño en píxeles y el fondo como rectángulo (los lectores de SVG y de PDF ignoran el `background` de CSS). No tiene edición y usa `renderToStaticMarkup`, como subruta aparte para no cargar `react-dom/server` en el editor.
   - **Lo que muestra:** el norte y una barra de escala (1-2-5 × 10ⁿ m, hasta una quinta parte del ancho).
   - **La marca:** la marca y los identificadores van en una franja clara abajo, para que se lean sobre el asfalto. La atribución de OSM, cuando aplica.
   - **PNG:** a 2× (20 px por metro), con la marca también en `iTXt`.
   - **PDF:** con pdfmake 0.3.12 (MIT). El croquis va como vector y la marca va al pie de cada página y en los metadatos (`Subject`).
   - **La fuente del PDF:** Roboto 3.014 incrustada (SIL OFL 1.1, registrada en `assets/ASSETS.md`).

## Límites conocidos (glTF)

- **Texturas procedurales:** los efectos TSL (texturas procedurales del asfalto) quedan como su color base.
- **Instancias:** árboles y vidrios van en su lugar del instante actual, porque glTF no anima instancias.
- **Lo que no entra:** el cielo, la lluvia y las luces del visor no se exportan. Son del entorno de dibujo, no de la reconstrucción.

## Pruebas

- **Croquis:**
  - **Unitarias:** SVG válido (`DOMParser`) con `xmlns`, tamaño, fondo y sin estilos ni eventos. Además, la marca, la semilla, el hash, la atribución de OSM, la escala y la barra de escala.
  - **e2e `croquis-exportar.spec.ts`:** abre el SVG en el navegador, lee el PNG (tamaño e `iTXt`) y abre el PDF con pdf.js, que extrae el título, la marca al pie, `Subject` y el texto del croquis vectorial.
  - **Revisión visual:** de la página del PDF dibujada con pdf.js.

- **Unitarias (viewer):**
  - PNG: CRC-32 conocido, ida y vuelta de texto UTF-8 con propiedades y detección de chunks alterados.
  - glTF de `volcadura`, reabierto con `GLTFLoader`: marca, duración, traslación, rotación, pesos del daño, vehículos y restos animados, y solo materiales clásicos.
  - glTF de `peaton_cruce`: cuerpo con esqueleto y pistas de sus huesos.
- **Unitarias del video:** instantes de cada cuadro y orden de los códecs.
- **e2e de video** (`exportar-video.spec.ts`, escena `poste`, 1280 × 720, 24 cuadros por segundo): cada video se abre con Mediabunny.
  - **MP4 y WebM:** 124 cuadros, duración de 124/24 s, tamaño y marca en los metadatos.
  - **WebM, además:** se decodifica un cuadro para ver la escena y la franja.
  - **Respaldo sin `VideoEncoder`:** 124 cuadros refechados con la marca. Se repitió 3 veces en local sin perder cuadros.
- **e2e** (`exportar.spec.ts`): descarga el PNG a 1280 × 720 y el `.glb` y los abre.
  - **PNG:** tamaño, marca en el texto del archivo, escena dibujada (no en blanco) y franja oscura abajo.
  - **`.glb`:** marca en `asset` y en la escena, vehículos y animación.
