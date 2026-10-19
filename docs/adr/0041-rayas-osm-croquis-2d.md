# ADR 0041 — Rayas de las calles de OpenStreetMap en el croquis 2D (F8, pendiente cerrado en F11)

- **Estado:** aceptado (2026-10-19). Completa el ADR 0039, que puso las rayas de OSM solo en el visor.
- **Contexto:** desde el ADR 0039, las calles de OSM llevan rayas en el visor 3D, pero el croquis 2D seguía dibujando solo la calzada. Las plantillas sí tienen rayas de carril en el croquis, así que una escena con calles reales se veía más pobre en 2D que una con plantilla, y el croquis no coincidía con el visor (ADR 0006).

## Decisión

1. **Una sola geometría para los dos:**
   - **Qué se movió:** el cálculo de dónde van las rayas de una calle de OSM y dónde la cruza otra calle salió del visor y quedó en `@croquis/croquis-2d` (`map-roads.ts`). Incluye `MapVia`, `stripLineOffsets`, `mapCrossings` y `mapLaneLines`.
   - **Uso:** el visor convierte esa geometría en triángulos y el croquis en trazos, así que los dos cortan las rayas en el mismo lugar.
   - **Sin cambios en el visor:** el cambio es un traslado sin cambios de comportamiento, y todas sus pruebas siguen en verde.
2. **Qué dibuja el croquis:**
   - **Qué rayas:** las interiores, como en las plantillas del croquis. Es una sola raya en el eje para doble sentido, en lugar de la doble amarilla, más las de carril, en las mismas posiciones que el visor.
   - **Orillas:** no se dibujan, porque las plantillas del croquis tampoco las llevan.
   - **Estilo:** el trazo discontinuo de las plantillas.
3. **Lo que no viene en los datos no se inventa:** igual que en el visor, una calle sin `lanes` en OSM no lleva rayas.
4. **Cruces:**
   - **Dónde se cortan:** las rayas se cortan donde otra calle cruza con más de 30°, con 0.5 m de margen, igual que en el visor.
   - **Continuaciones:** una calle que sigue en otra vía de OSM, casi en línea, no se corta.
   - **Pasos peatonales:** el croquis no corta en ellos, igual que con las plantillas.
5. **Costo:** las rayas se calculan una vez por escena (`useMemo` sobre el mapa). Las ediciones no cambian el mapa, así que arrastrar un vehículo no las recalcula.

## Pruebas

- **`map-roads.test.ts`:**
  - sin `lanes` no hay rayas;
  - posiciones en doble sentido y en un sentido;
  - en un cruce, el eje queda en dos tramos, uno a cada lado de la otra calzada;
  - una continuación en línea no se corta;
  - **propiedad (fast-check, semilla 41, 200 casos):** ningún tramo pasa por la calzada de una calle que lo cruza.
- **`Croquis.test.tsx`:** con la red real de Toluca, las calles con `lanes` llevan rayas y las demás ninguna.
- **Exportaciones:** el SVG, el PNG y el PDF del croquis salen del mismo componente, así que también las llevan.
