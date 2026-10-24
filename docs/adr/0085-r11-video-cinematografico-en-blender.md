# ADR 0085 — R11: el video cinematográfico en Blender

- **Estado:** aceptado (2026-10-23).
- **Contexto:** PLAN-CESVI R11 pide «Exportar a Blender» desde el visor y un script de Blender que arme la escena y renderice el video con la leyenda de reconstrucción de apoyo.
  - **Lo que había:** el visor ya exportaba la escena en glTF con la animación del solver, el daño y la leyenda (F9). Le faltaban las cámaras y la luz del lugar.
  - **El video que hace el navegador** (F9) es el del visor en tiempo real. La calidad de cine (trazado de rayos, desenfoque de movimiento, más muestras) necesita un renderizador fuera de línea.
  - **El render final** es en la computadora de la demo (René). En la laptop solo se prueba, con renders cortos y de baja resolución, sin que Blender pase del 70 % de la RAM.

## Decisión

1. **«Exportar a Blender» es el botón de la escena glTF del panel «Exportar» del visor**, en `/visor` y en el 3D de los casos de `/cesvi`. Es el mismo archivo para todo, en un solo lugar.
   - Al lado está el enlace «Script de Blender». En «Ver detalle», el comando para hacer el video.
2. **La escena lleva lo que el video necesita** (`packages/viewer/src/export/gltf.ts`):
   - **Cámaras:** todas las del visor, animadas con las mismas poses que en pantalla (`exportCameras`): la cinematográfica (la principal), la cenital, la del daño, la de cada conductor y, si hay personas, la que las sigue.
   - **Ambiente:** en los `extras` de la escena va lo que calcula el visor: el sol del lugar y la hora, la noche, la niebla, el piso mojado, el alumbrado. Las direcciones van en el marco del solver, que es el de Blender al importar.
3. **El script** (`tools/blender/croquis_render.py`, Blender 5.2 o posterior):
   - **Qué hace:**
     - importa la escena;
     - elige la cámara (por omisión, la principal);
     - pone el cielo físico (`MULTIPLE_SCATTERING`) con el sol del visor, y una lámpara de sol para las sombras (de noche, la luna y el cielo oscuro);
     - si la visibilidad es baja, pone la niebla como un volumen, con la misma visibilidad que en el visor;
     - renderiza con EEVEE o Cycles, con desenfoque de movimiento;
     - sale en MP4 H.264 o en PNG cuadro por cuadro.
   - **La leyenda** de reconstrucción de apoyo va impresa en cada cuadro con el sello de Blender (la nota), con la semilla y la atribución de OpenStreetMap.
   - **El API se verificó en Blender 5.2.3 mismo,** no de memoria:
     - las propiedades se leyeron por introspección (`bl_rna`);
     - la salida de video usa `media_type = "VIDEO"`, que es lo de la versión 5.
   - **La convención del sol del cielo se midió:** `sun_rotation` va desde el norte hacia el este, igual que el azimut del visor.
     - Medidos 0°, 89° y 269° para 0°, 90° y −90° (`tools/blender/calibrar_cielo.py`, `eval/results/r11_cielo_blender.json`).
   - **La parte que no usa Blender** (leer el `.glb`, las opciones, el tramo de cuadros, la cámara, el sol, la niebla) tiene pruebas en `tools/blender/tests`, que corren en CI con pytest.
4. **Lo que encontró el render de verdad,** arreglado en la exportación y no en el script:
   - **Colores en blanco.** Los materiales que pintan con nodos (`colorNode`: asfalto, llantas, pintura con daño, vidrio, cuerpos) se exportaban en blanco: glTF solo lleva el color plano.
     - Ahora cada uno guarda su color plano en `color`, que three ignora al dibujar si hay `colorNode` (`NodeMaterial.js`, `setupDiffuseColor`). El visor no cambia.
   - **Restos como cubos de un metro.** Los restos son instancias que se mueven por su matriz, y la exportación solo animaba objetos.
     - Además, `Matrix4.decompose` devuelve escala 1 para una matriz de escala cero (los restos ocultos antes de desprenderse). Así, salían como cubos de un metro, inmóviles, en el punto de impacto.
     - Ahora las instancias que se mueven salen como una malla por pieza, con su animación (escala cero mientras está oculta) y su color. Las que no se mueven (árboles) siguen como instancias.
   - **Manchas negras en Cycles.** En Cycles salían manchas negras en la calzada. Los tramos y las uniones redondas de la calzada se enciman en el mismo plano, y la luz que sale de una cara choca con su gemela.
     - Se comprobó quitando el sol: las manchas seguían. Se quitaban todas cuando la calzada dejaba de estar en los rayos secundarios.
     - Las superficies a ras del piso (planas y bajo 20 cm) reciben sombras, pero no las proyectan ni salen en los rayos secundarios. En EEVEE y en el visor no pasaba.
5. **El script se publica** en `/blender/croquis_render.py`: lo copia `apps/web/scripts/blender-script.mjs` en cada build, y el original está en `tools/blender/`.

## Evidencia

- **Pruebas:**
  - las cámaras que se exportan son las del visor;
  - la cinematográfica, cargada del glTF, queda a menos de 5 cm de la pose del visor en cada instante probado;
  - el ambiente va en los extras;
  - el asfalto, las llantas y los restos no salen blancos;
  - los restos son mallas animadas con escala cero antes de desprenderse;
  - la parte pura del script tiene 12 pruebas.
- **Render en la laptop** (`eval/r11_render_laptop.mjs`, `eval/results/r11_render_laptop.json`): la escena de AXA exportada desde la app, en EEVEE y en Cycles, con la memoria de Blender y de la máquina. Los números están en `docs/PROGRESS.md`.

## Límites

- **La textura procedural del asfalto** (grano y manchas) y el piso mojado del visor salen como color plano. El video se ve más liso que el visor en esos detalles.
- **Las luces del alumbrado del visor no se exportan.** De noche, el video tiene la luna y el cielo oscuro, sin los focos de la calle.
- **La profundidad de campo** de la cámara cinematográfica del visor no se exporta: el video la lleva sin desenfoque de foco.
- **Los vehículos son los modelos del visor.** Los realistas esperan a R10 (la cuenta de Sketchfab).
- **El render final en calidad completa** y su aprobación son de René, en la computadora de la demo.
