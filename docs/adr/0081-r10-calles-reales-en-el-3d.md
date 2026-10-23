# ADR 0081 — R10: las calles reales del lugar en el 3D de los casos

- **Estado:** aceptado (2026-10-23).
- **Contexto:** R10 pide un escenario «según el lugar real del mapa».
  - En los casos de expediente (nuevo, importado, reproducción, guardado y AXA), el 3D dibujaba la vía de la plantilla: una recta este–oeste por el origen.
  - Los vehículos, colocados sobre la calle real del mapa, corrían junto a ella sobre el pasto. En AXA la carretera va casi de sur a norte.
  - El contrato y el visor ya sabían dibujar las calles de OpenStreetMap (`lugar.ubicacion_real` y `lugar.red_vial`, ADR 0023 y 0040), pero `especDeExpediente` no las llenaba.

## Decisión

1. **Las calles van en el marco de la escena del caso** (`lib/calles-del-mapa.ts`):
   - origen en el primer impacto, x al oriente, y al norte, sin girar;
   - se proyectan con `redVialFrom` de `@croquis/croquis-2d` (radio de 150 m) y se guardan en `lugar.red_vial`, para que la escena sea determinista y funcione sin red;
   - `ubicacion_real` lleva el punto de impacto que marcó el perito.
   - **No se usa `applyMap`:** pone el cruce más cercano en el origen y gira la escena, como en el flujo para el público; aquí rompería las posiciones medidas desde el impacto.
2. **La física no espera a las calles:**
   - **Medido:** en local, sin la caché de Redis, la primera consulta de un lugar a Overpass tardó 42.7 s.
   - **La consulta** (`/api/osm`) se pide en cuanto hay punto de impacto (al marcarlo o al abrir un caso que ya lo tiene), una vez por lugar (~110 m), con un límite de 60 s.
   - **El solver no las usa para la física** (solo en sus revisiones de consistencia). Se reconstruye sin esperarlas y el 3D las agrega cuando llegan (`Visor3dCaso`).
   - **Si no llegan,** el 3D queda con la plantilla, como antes.
3. **La atribución de OpenStreetMap (ODbL)** aparece en la leyenda del 3D cuando la escena trae las calles.
4. **CI no consulta la red:** las e2e responden `/api/osm` con una respuesta vacía.

## Evidencia

- **Prueba unitaria:**
  - un cruce norte–oriente queda en el marco de la escena sin girar;
  - la escena con las calles cumple el contrato (`validateEscena`);
  - sin calles cerca, la escena queda igual.
- **Captura de AXA con Overpass real:** se ven los dos cuerpos de la carretera Los Mochis–Cd. Obregón (cuota), con los vehículos sobre el suyo y la atribución en la leyenda.

## Límites

- **Las revisiones de consistencia del solver** (un vehículo fuera de la vía) no ven las calles, porque llegan después de reconstruir.
- **Solo hay calles:** árboles, postes y bardas de OpenStreetMap como objetos del entorno quedan pendientes.
