# Extractos de OpenStreetMap

Contiene información de OpenStreetMap, disponible en [openstreetmap.org](https://www.openstreetmap.org/copyright) bajo la [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). © colaboradores de OpenStreetMap.

- **Contenido:** cada `<nombre>.overpass.json` es la respuesta cruda de Overpass para una escena con `ubicacion_real`: las calles con etiqueta `highway` a menos del radio indicado, con sus nodos.
- **Manifiesto:** `manifest.json` registra la consulta, la fecha de los datos de OSM, la fecha de descarga y el SHA-256 de cada extracto.
- **Comandos:** se descargan con `uv run croquis-data osm download --nombre <nombre>` y se verifican con `uv run croquis-data osm check`.
- **Licencia de lo derivado:** la red vial que se guarda en una escena (`lugar.red_vial`) es una base de datos derivada de estos datos y queda bajo la misma licencia ODbL. Por eso cada escena guarda la atribución y la licencia, y el visor las muestra junto al dibujo (ADR 0023).
