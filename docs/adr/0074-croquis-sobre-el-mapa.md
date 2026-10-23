# ADR 0074 — El croquis del dictamen sobre las calles del mapa

- **Estado:** aceptado (2026-10-23).
- **Contexto:** René (2026-10-23) puso como primera prioridad después de R9 que el croquis del dictamen lleve las calles del mapa: el lugar de los hechos es central para los peritos. El croquis de R8 (ADR 0072) era el dibujo a escala, sin calles.

## Decisión

- **Las trayectorias vuelven al mapa:** `trayectoriasEnMapa` (`packages/cesvi/src/reconstruccion.ts`) lleva las trayectorias del solver (metros desde el primer impacto) a longitud y latitud. Da el recorrido de cada vehículo y su contorno al inicio, en el primer impacto y en reposo.
- **El croquis se dibuja sobre el mapa de «Caso nuevo»** (`apps/web/src/lib/croquis-mapa.ts`):
  - el mapa se encuadra en las trayectorias, sin giro ni inclinación;
  - el cuadro se copia en el evento `render`, mientras el búfer es válido, sin activar `preserveDrawingBuffer` en el mapa del perito;
  - encima van el recorrido punteado, los tres contornos, el nombre con halo, los impactos (X1, X2…), el norte, la barra de escala y la atribución de OpenStreetMap, OpenFreeMap y OpenMapTiles (licencia ODbL).
- **El dictamen se imprime:** si el perito está en el tema oscuro, el croquis se toma con el estilo claro (Positron).
- **El mapa del perito queda como estaba:** su estilo, su encuadre y su giro se restauran aunque falle la captura.
- **Sin mapa no hay calles:** si el caso no tiene posiciones en el mapa, o la captura falla, queda el croquis a escala de ADR 0072.
- **El pie del croquis dice cuál de los dos es.**

## Pruebas

- **Unitarias:**
  - el contorno en el impacto queda a menos de 6 m de donde el perito colocó al vehículo;
  - sin mapa no hay trayectorias;
  - el pie del croquis en el dictamen.
- **e2e `@flujo` de «Caso nuevo»:** el dictamen descargado declara `data-croquis="mapa"`.
  - En CI los mosaicos se sustituyen por un fondo liso.
  - Con mosaicos reales y en los dos temas se revisó a mano: el croquis sale sobre las calles con el estilo claro.

## Límites

- **El croquis tiene la forma del mapa en pantalla** (en escritorio, más ancho que alto).
- **Las calles dependen de que los mosaicos de OpenFreeMap carguen;** si no cargan en 8 s, el croquis sale con lo que haya.
