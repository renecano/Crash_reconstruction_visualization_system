# ADR 0118 · Base técnica del tráiler: Remotion, texturas en código y tomas 4K del 3D

- **Fecha:** 2026-11-16
- **Estado:** aceptada
- **Pedido:** René, 2026-11-16: «Base técnica del tráiler (sin decisiones creativas; el storyboard es de Fable)».

## Contexto

René quiere un tráiler de Croquis. El storyboard y las decisiones creativas quedan para después; lo que se pidió es la base técnica:

- un pipeline de render;
- una biblioteca de texturas generadas en código y animables;
- una herramienta para tomar el 3D de Unity a 4K con cámara y tiempo controlados, solo con escenas sintéticas;
- un render de prueba que mida cuánto tarda.

## Decisión

- **Remotion 4.0.539** (`apps/trailer`).
  - Su licencia gratuita cubre «individuos y empresas de hasta 3 personas», con uso comercial (https://www.remotion.dev/docs/license/pricing, consultada el 2026-11-16). El tráiler lo produce René con su equipo de dos personas, así que aplica.
  - **Si el equipo pasa de 3 personas, o si el tráiler lo produce una empresa más grande** (CESVI, una agencia), hace falta la licencia de empresa de Remotion. Si no se quiere pagar, la alternativa es el pipeline de canvas + Playwright + ffmpeg, que no depende de ninguna licencia: Playwright ya está en el repo.
  - La versión tiene más de dos semanas (la regla de edad mínima del repo). `remotion`, `@remotion/cli`, `@remotion/bundler` y `@remotion/renderer` van en la misma versión exacta, como pide Remotion.
- **Texturas en SVG** (`apps/trailer/src/texturas`): papel con grano, papel milimétrico, tinta que se expande y grano de película.
  - Usan filtros `feTurbulence` y patrones: escalan a cualquier resolución y se animan con el cuadro de Remotion.
  - Todo lo aleatorio lleva semilla (CLAUDE.md), así que el mismo cuadro sale igual en cada render.
  - Ningún recurso de terceros: no hacen falta créditos en `assets/ASSETS.md`.
- **Tomas del 3D** (`tools/trailer/tomas-3d.mjs`): reusa el capturador del build web (`tools/unity/capturas.mjs`) a 3840×2160, en PNG y en nivel ultra.
  - Cada toma lleva su cámara (cualquier modo del puente, incluidas «cerca» y «persona») y su instante, o una lista de instantes para una secuencia.
  - Rechaza cualquier escena que no sea sintética de referencia (nada de AXA ni de casos reales).
- **Fuera del repo:** los videos y las tomas van a `D:\Croquis-trailer` (o a la carpeta de `CROQUIS_TRAILER`). En el repo solo va el código y la medición (`eval/results/trailer_render.json`).

## Consecuencias

- El storyboard se arma como composiciones de React en `apps/trailer/src` con estas texturas y tomas.
- La leyenda ilustrativa del 3D va en cada toma, porque la dibuja Unity (PLAN §10).
- El render corre con Chromium (el de Remotion), en serie y con concurrencia 2 en la laptop de 8 GB.
