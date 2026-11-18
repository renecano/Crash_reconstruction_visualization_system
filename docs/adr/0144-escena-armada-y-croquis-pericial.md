# ADR 0144 · La escena ya armada y el 2D como croquis de perito

- **Fecha:** 2026-11-18
- **Estado:** aceptada.
- **Pedido:** René, ronda 4, «Mis decisiones». La escena: propuesta 1, con cambios (`docs/cesvi/ronda-4/propuestas-escena.md`). El 2D: propuesta 2, con la 1 como fondo opcional (`docs/cesvi/ronda-4/propuestas-2d.md`).

## Decisión

### 1. La escena llega armada y se revisa en una lista

- **`proponerEscena`** arma la escena con lo que leyó Croquis: el cruce o la calle más cercana, el choque pegado a la vía y por dónde venía cada vehículo.
- **`listaDeLaEscena`** dice qué está propuesto, qué está listo y qué falta, cada cosa con su «Por qué» concreto: por qué calle y en qué sentido venía, y en qué daño se apoya. Las calles salen de las teselas del mapa mientras Overpass contesta (`overpassDeTeselas`).
- **Lo que falta** abre su pregunta en el mapa y, al contestarla, vuelve a la lista.
- **Sin la barra de seis pasos.** «Ver la reconstrucción» va dentro del panel y se activa al completar.
- **Las herramientas, arriba y con su tecla:**
  - girar (Q/E), «Alinear con la calle» (A) y «Voltear 180°» (F);
  - deshacer y rehacer;
  - acercar y alejar;
  - medir (M).

  Alinear y voltear sirven para cualquier vehículo, persona u objeto seleccionado. Alinear solo actúa si la cosa está sobre una calle.

- **El flujo anterior sigue disponible** (una pregunta a la vez) con `?escena=anterior`, o con `localStorage croquis.escena=anterior`. Las e2e de siempre lo usan; el nuevo tiene la suya, `escena-lista.spec.ts`.

### 2. El 2D de Reconstrucción es un croquis de perito

- **`croquisPericial`** (`apps/web/src/lib/croquis-pericial.ts`) es una función pura que arma el SVG. Lo usan la pantalla y el dictamen: es el mismo dibujo.
- **Lo que dibuja:**
  - **Giro:** el que deja horizontal la vía donde fue el choque. Entre varias vías, gana la de más jerarquía. El norte gira con el dibujo, y nada queda de cabeza (giro entre −90° y 90°).
  - **Encuadre:** la zona del choque. «Ver todo», en la barra de reproducción, muestra los recorridos completos.
  - **La vía:** sus bordes y carriles en negro, sobre papel blanco.
  - **Los vehículos:** cada uno en tres posiciones, con su etiqueta:
    - 1, antes del impacto (punteado);
    - 2, en el impacto;
    - 3, en reposo (gris).

    Las personas a pie o en bicicleta llevan P1, P2 y P3. Las etiquetas (A1, B2…) nunca se enciman: cada una toma el primer lugar libre alrededor de su objeto y se une a él con una línea guía.

  - **El recorrido:** punteado en negro, o con el interruptor «Color por velocidad», del azul (lento) al naranja (rápido).
- **Las referencias** van plegables, bajo el dibujo; nunca lo tapan.
- **Los fondos:** «Sin fondo» (de omisión), «Mapa» (el mapa real, tenue) y «Foto» (la foto satelital, con su ajuste de 0.5 m por paso). Los fondos salen del mismo `usePisoMapaReal` que el piso de Unity.
- **El dictamen:** el croquis es el mismo SVG convertido a PNG (`svgAPng`). Si eso falla, usa el croquis de antes (sobre el mapa o a escala). `data-croquis` dice cuál se usó.
- **Dónde sigue la maqueta:** en «Versiones», porque dibuja el fantasma de la versión; en Presentar; y con `?croquis=maqueta` o `localStorage croquis.2d=maqueta`. Las e2e base fijan la maqueta, y el croquis tiene su propia e2e, `croquis-pericial.spec.ts`.

## Consecuencias

- **Ninguna cifra cambia.** El croquis solo dibuja el `Resultado` del solver: las posiciones 2 son las del instante de impacto (`tImpacto`), y las 3, el último punto de la trayectoria.
- **Pruebas:**
  - `croquis-pericial.test.ts`: el giro (incluida la vía del choque contra una avenida cercana), las tres posiciones, P1 a P3 con el atropello, etiquetas sin encimarse, color opcional y la escala redonda.
  - Las e2e: `croquis-pericial.spec.ts`, `escena-lista.spec.ts` y `cesvi-caso.spec.ts` (el dictamen lleva el croquis pericial).
- **Capturas:** `docs/cesvi/ronda-4/evidencia/2d/` (antes y después, AXA y cf708) y `evidencia/escena/`.
