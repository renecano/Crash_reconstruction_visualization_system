# ADR 0050 — El croquis sobre el mapa para CESVI (Hito 2)

- **Estado:** aceptado (2026-10-21).
- **Contexto:** `docs/cesvi/PROTOTIPO.md` pide un mapa con MapLibre GL y mosaicos vectoriales gratuitos. Sobre él van el croquis a escala con la versión declarada y la de la evidencia, y herramientas para que el perito mueva, gire, marque y mida. La separación de los restos que mide el perito alimenta el cálculo 2.

## Decisión

- **Mapa:**
  - **Motor:** MapLibre GL 6.15.0 (BSD-3).
  - **Mosaicos:** el estilo oscuro de OpenFreeMap. Es gratuito, sin llave ni límite de vistas, y la atribución (OpenFreeMap, OpenMapTiles y OpenStreetMap) la pone MapLibre.
  - **Carga:** solo en el navegador, con `next/dynamic` y fuera del JavaScript inicial.
  - **El worker:** MapLibre lo busca junto a su módulo y Turbopack no lo copia, así que `scripts/maplibre-worker.mjs` lo publica en `public/maplibre/` antes de cada build, con su versión en el nombre, y la página lo indica con `setWorkerUrl`. La copia no se versiona.
- **El punto:**
  - **Ubicarlo:** el perito busca el lugar con Nominatim (abre con el municipio y el estado del caso) o escribe coordenadas, y toca el punto de impacto. El dictamen no da coordenadas del km 47+800, y Croquis no las supone.
- **Las calles:**
  - **Importación:** `/api/osm`, como en el croquis (ADR 0040). De la vía más cercana al punto se toma el rumbo, en el sentido sur a norte del caso.
  - **Si OSM no tiene calles a 250 m:** la página lo dice y usa el norte.
- **Las dos versiones** (`packages/cesvi/src/versiones.ts`, con pruebas) solo usan lo que dice el dictamen:
  - **En el impacto:** la parte posterior de A y el frente de B tocan el punto.
  - **Versión de la evidencia:** A termina a la separación de los restos (15.89 m) y los restos van del impacto a ahí.
  - **Versión declarada:** A retrocede «unos metros» (3 m dibujados, que el perito cambia) y no hay desplazamiento después del impacto.
  - **Lo que el dictamen no da** queda como supuesto escrito en la página: las posiciones iniciales de la evidencia, la final de B y la medida de la reversa.
- **Fuentes:** cada posición dice si viene del dictamen, la propuso Croquis o la movió el perito.
- **Medidas de los vehículos:** las típicas de la clase pickup de `vehicle_classes.json` (fichas de fabricante de modelos actuales), dichas así en la página; el dictamen no da las de la Silverado 2007 ni la Tacoma 1997.
- **Herramientas:**
  - **Marcas que se arrastran:** el vehículo y la fase elegidos, el punto de impacto (la X naranja de la marca, porque es evidencia) y los extremos de la zona de restos.
  - **Además:** un campo de rumbo, una herramienta para medir distancias y un botón que lleva la separación medida al cálculo 2.

## Consecuencias

- **Pruebas:** la e2e `@flujo` de `/cesvi` usa un estilo de mapa vacío y una vía sintética en lugar de OpenFreeMap y Overpass, así que no depende de la red externa.
- **Lo que depende de servicios públicos:**
  - **Overpass** tarda o falla a ratos (ADR 0040). La página avisa y sigue con el norte.
  - **Nominatim** pide uso moderado: una búsqueda por clic.
- **Pospuesto** («Endurecimiento pendiente»): mosaicos propios con privacidad completa y la ubicación exacta del km 47+800 (preguntada a CESVI).
