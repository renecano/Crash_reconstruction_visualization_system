# ADR 0122 · «Descargar video» del 3D, cuadro por cuadro

- **Fecha:** 2026-11-18
- **Estado:** aceptada
- **Pedido:** René, ronda 4, B7. Un botón visible junto al visor graba la reproducción completa con la cámara elegida, en 1080p, con la leyenda ilustrativa y el logo, en MP4. Debe funcionar en Chrome y Edge y decir cuánto falta mientras graba.

## Decisión

- **Cuadro por cuadro, no en tiempo real.** Para cada instante, a 30 fps, la web lleva Unity a ese tiempo (`fijarTiempo`, con la reproducción en pausa), espera dos cuadros nuevos del lienzo (`captureStream` y `MediaStreamTrackProcessor`) y toma el último. Así el video sale fluido aunque la máquina no llegue a 30 fps.
  - Con `MediaRecorder` en tiempo real, una laptop que dibuja a 20 fps daría un video a saltos.
  - No hace falta un build nuevo de Unity: `fijarTiempo` ya es parte del puente.
- **1920×1080 reales.** Mientras graba, el lienzo cambia a 1920×1080 píxeles físicos, divididos entre `devicePixelRatio`. La caja del visor lo recorta, así que la página no se mueve. Al terminar, todo vuelve a como estaba: el tamaño, el minimapa y el instante.
- **Lo que lleva cada cuadro:**
  - **La leyenda ilustrativa** la dibuja Unity en el lienzo.
  - **El logo** blanco de Croquis, arriba a la derecha.
  - **La leyenda en los metadatos** del MP4 (`LEYENDA_3D`).
  - **Sin minimapa** mientras graba.
- **H.264 en MP4** con WebCodecs y Mediabunny (MPL-2.0, ya en el stack por el video del visor three.js, ADR 0031), en la versión del catálogo: 1.61.6. Chrome y Edge tienen las dos cosas. En otro navegador, el botón dice que use Chrome o Edge.
- **Mientras graba,** un panel sobre la escena dice el porcentaje, cuánto falta (calculado con lo que llevan los cuadros hechos) y tiene «Cancelar». Esc también cancela.

## Consecuencias

- **La e2e `visor-video.spec.ts`** corre con el Unity de mentira, que ahora dibuja un color por instante. Comprueba que el MP4 sea H.264 de 1920×1080 a 30 fps y que Unity recibió todos los instantes. Que se cancela con Esc lo comprueba en el panel. No corre en CI.
- **Con el Unity real, en Chrome y en Edge,** lo prueba la tanda «r4» del colaborador (`demo-local.ps1 -Despues video-3d`). En la laptop de René no se carga Unity sin que él lo pida.
