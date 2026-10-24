# ADR 0090 — Colocar en el mapa: bandeja, anillo y fantasmas

- **Estado:** aceptado (2026-10-24).
- **Contexto:**
  - René pidió rehacer cómo se coloca en el mapa del paso del lugar: no era intuitivo, y arrastrar el giro iba muy lento.
  - **El giro era lento** porque la punta de la flecha era un marcador de MapLibre. Cada evento de arrastre cambiaba el expediente, y con él se volvían a dibujar el recorrido, el panel, las huellas y los marcadores del mapa.

## Decisión

1. **Bandeja** (`colocar-mapa.tsx`):
   - lo que falta colocar (X1 y V1, V2…) se arrastra al mapa con captura del puntero;
   - mientras se arrastra, dice a cuántos metros queda del punto de impacto;
   - al soltarlo, el vehículo toma el rumbo de la calle más cercana a 25 m o menos (`rumboDeCalle`, con las calles de los mosaicos del mapa), en el sentido más parecido al de su pose de impacto;
   - «Voltear 180°» lo da vuelta;
   - el clic en el mapa sigue funcionando.
2. **Anillo de giro** alrededor del elegido:
   - el rumbo es atan2 del cursor respecto del centro, absoluto y 1:1, con imán de 15° (Shift lo suelta), con el giro del mapa ya contado;
   - mientras se arrastra, solo cambian los atributos del SVG del anillo y de la silueta, en `requestAnimationFrame`;
   - el expediente cambia una sola vez, al soltar;
   - Q y E giran ±5°, y los botones del panel, ±15° y 180°.
3. **Fantasmas:**
   - las poses de impacto que propone Croquis al marcar el punto quedan con fuente `supuesto` y se ven punteadas;
   - «Aceptar V1» o «Aceptar V2» (en una barra aparte, porque sobre el mapa los botones de dos vehículos juntos se tapaban) las pasa a `perito`, igual que moverlas o girarlas;
   - la reconstrucción las usa igual, porque solo fijan el origen y el arranque, que en la escena ya son supuesto: los números no cambian. Lo que cambia es que el expediente dice honestamente cuáles aceptó el perito.
4. **Guía de 3 pasos** la primera vez, en el panel del paso y no sobre el mapa, para no tapar lo que se coloca:
   - cada paso con su gesto animado (sin animación con «reducir movimiento»);
   - «No volver a mostrar» se guarda en el navegador.

## Evidencia

- **`eval/giro-mapa.mjs` → `eval/results/giro_mapa.json`:** en la laptop de René (Chrome con su Intel UHD, 1440×800 a escala 1.5), contra producción, mientras se gira el anillo con el mouse:
  - la página dibuja 59.9 cuadros por segundo (el tope de la pantalla, contra una meta de ≥ 30);
  - cada actualización del anillo cuesta 0.281 ms.
  - Con el servidor local, antes de desplegar, había dado 59.3 y 0.318.
- **Pruebas:**
  - la lógica: el rumbo del cursor con imán y Shift, los metros por pixel y la calle más cercana;
  - la e2e del caso nuevo: arrastra V2 de la bandeja al mapa (con la distancia en vivo), lo gira con el anillo a 90° y acepta el fantasma de V1;
  - el caso guardado dice qué aceptó el perito y qué sigue como supuesto.

## Límites

- **Sin calles en los mosaicos** (o a más de 25 m), el vehículo conserva el rumbo de su pose de impacto, o 0°.
- **El mapa no se inclina,** así que el anillo no considera inclinación.
