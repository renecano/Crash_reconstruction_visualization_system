# ADR 0148 · El video del 3D, rápido: un cuadro por instante y el modo medido antes de grabar

- **Fecha:** 2026-11-28
- **Estado:** aceptada.
- **Pedido:** René: «13 min por video es demasiado para un perito (y para la demo)… que la grabación no tenga que ir al ritmo del reloj… modo por omisión "Rápido" (1080p, con antialiasing solo si la tarjeta aguanta) y modo opcional "Máxima calidad". Meta: un video de ~10 s del choque en 1–2 min en una laptop normal, y la estimación correcta antes de empezar».

## En qué se iba el tiempo (medido en la Mac M1, `eval/results/video_medicion.jsonl`)

- Componer cada cuadro (el logo y los letreros) costaba ~2 ms, nada.
- Codificar parecía costar 476 ms por cuadro, pero no era el codificador. Se leían **todos** los cuadros que dibujaba Unity (`captureStream()` sin tope, unos 60 por segundo). Cada lectura es una copia del cuadro desde la tarjeta de video, y eso frenaba al propio Unity. Con la captura bajo pedido, codificar quedó en **4 ms por cuadro**.
- El resto era Unity: dos cuadros completos de espera por instante. Además, en automático Unity bajaba el nivel y la resolución por los fps bajos del cuadro por cuadro. En la Mac (DPR 2), `media` se dibujaba a la mitad de resolución y el video salía con bordes dentados.

## Decisión

1. **Un cuadro por instante, bajo pedido** (`apps/web/src/lib/visor-unity/video.ts`). `captureStream(0)` no entrega nada hasta que se pide con `requestFrame`. Se fija el instante, se deja pasar un cuadro del navegador y se toma el siguiente que se pinte. Nada va al ritmo del reloj. Un cuadro que no llega en 10 s cuenta como «el 3D no dibuja».
2. **Nivel y resolución fijos mientras se graba.** El mensaje `calidad` del puente acepta `escala` (#416). Se graba con `escala: 1` y al terminar se devuelve a la automática.
3. **El modo se mide antes de grabar**, con 5 cuadros de cada candidato, y se elige con una meta de tiempo. El nombre de la tarjeta no basta: en laptops híbridas Chrome reporta la NVIDIA y dibuja en la Intel.
   - **«Rápido»** (por omisión): `alta` (MSAA ×4) si el video completo cabe en 2 min; si no, `media` (FXAA); si ninguno cabe, el más rápido.
   - **«Máxima calidad»**: el doble en `ultra` (supermuestreo), 1× en `ultra` o 1× en `alta`, el primero que termine en 10 min; si ninguno, el más rápido. Con tarjeta integrada, igual que «Rápido» (a 2× la laptop de 8 GB no dibujó ningún cuadro, 2026-11-26).
4. **La estimación, antes del primer cuadro.** Con lo medido (ms por cuadro × cuadros del video), si pasa de 2 min se pregunta antes de empezar. El diálogo muestra «Tarda ~N min en esta computadora» con lo que tardó cada cuadro la última vez en esa computadora y en esa calidad.

## Medido (Mac M1, AXA, cámara automática con cámara lenta: 13.23 s de video, 397 cuadros)

|                                                        | Modo                                                           | Tiempo                                 |
| ------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------- |
| Antes, en producción (moto-cruce, 11.5 s, 345 cuadros) | 2× `ultra`, lectura continua                                   | 998 s (16.6 min)                       |
| Antes, local                                           | 1× `alta`, lectura continua                                    | 379 s de grabación (954 ms por cuadro) |
| **Después, «Rápido»**                                  | 1× `media` (medidos: `alta` 371 ms, `media` 313 ms por cuadro) | **124 s de grabación, 131 s en total** |
| **Después, «Máxima calidad»**                          | 1× `ultra` (2× `ultra` medido a 1.5 s por cuadro)              | **443 s (7.4 min)**                    |

Para un choque de ~10 s (~300 cuadros), «Rápido» en esta Mac da ~94 s, dentro de la meta. La tarjeta integrada todavía no está medida: la prueba está lista (`apps/web/e2e/video-medicion.spec.ts`, se corre con la demo local) y queda en «Endurecimiento pendiente».

## Lo que se acepta

- En la Mac, «Rápido» graba en `media` (FXAA) y no en `alta` (MSAA), porque `alta` no cabe en 2 min para este video. Se ve limpio y a resolución completa, mejor que antes en automático, que dibujaba `media` a la mitad.
- La meta es por video: un choque corto puede salir en `alta`.
