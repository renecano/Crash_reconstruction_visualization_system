# ADR 0081 — R10: el lugar real en el 3D de los casos (calles y objetos)

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
4. **Los objetos del lugar:**
   - **La consulta:** `/api/osm?que=objetos` (`overpassQueryObjetos`) trae árboles (`natural=tree`), postes de alumbrado y de luz (`highway=street_lamp`, `power=pole|tower`), y bardas y muros (`barrier=wall|fence|retaining_wall`). Va aparte de la de calles, que comparten los extractos versionados, y tiene su propia clave de caché; la de calles no cambia.
   - **En el 3D** entran como objetos del entorno con fuente «mapa» y la nota de su nodo o vía (`objetosDelMapa`, `conObjetosDelMapa`). Van del más cercano al impacto al más lejano, hasta llenar los 64 que admite el contrato después de los de la escena. Las bardas y los muros van por tramos, con su largo y su rumbo.
   - **Se piden y llegan** como las calles.
5. **CI no consulta la red:** las e2e responden `/api/osm` con una respuesta vacía.

## Evidencia

- **Prueba unitaria:**
  - un cruce norte–oriente queda en el marco de la escena sin girar;
  - la escena con las calles cumple el contrato (`validateEscena`);
  - sin calles cerca, la escena queda igual.
- **Pruebas de los objetos:**
  - la conversión (orden, radio, máximo, tramos de muro con su largo y su rumbo);
  - la consulta;
  - la escena con objetos cumple el contrato;
  - la clave de caché de cada consulta.
- **Cobertura medida con Overpass real (2026-10-23):**
  - AXA (carretera rural): 0 objetos;
  - el cruce de Toluca de F8d: 0;
  - Paseo de la Reforma, CDMX: 2 árboles, 4 muros y 1 barda.
  - En México, OpenStreetMap casi no tiene árboles ni postes mapeados: el 3D muestra lo que hay y no inventa.
- **Captura de AXA con Overpass real:** se ven los dos cuerpos de la carretera Los Mochis–Cd. Obregón (cuota), con los vehículos sobre el suyo y la atribución en la leyenda.

## Límites

- **Las revisiones de consistencia del solver** (un vehículo fuera de la vía) no ven las calles, porque llegan después de reconstruir.
- **Lo que no está en OpenStreetMap no aparece.** Dibujar árboles o postes «típicos» sería inventar el lugar.
