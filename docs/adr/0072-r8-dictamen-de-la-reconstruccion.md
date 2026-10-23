# ADR 0072 — R8: el dictamen de una reconstrucción en PDF y Word

- **Estado:** aceptado (2026-10-23).
- **Contexto:** R8 de `docs/cesvi/PLAN-CESVI.md` pide el dictamen de una reconstrucción de «Caso nuevo» en PDF y Word.
  - **Debe llevar:**
    - la narración del perito;
    - el croquis 2D y cuadros del 3D;
    - los resultados con rangos;
    - la verificación CESVI;
    - la comparación de R7 si se usó;
    - la trazabilidad.
  - **Estructura:** la de los reportes de CESVI cuando el perito la pida.
  - **Lo que había:** el dictamen del prototipo (ADR 0051) está atado al caso de AXA (`CasoCesvi`, vehículos A y B).

## Decisión

- **`lib/dictamen-caso.ts`** arma un solo contenido de pdfmake (`dictamenCasoContenido`) para el PDF (`dictamenCasoPdf`) y el Word (`dictamenCasoWord`, con el convertidor de ADR 0057).
  - **El contenido, con la misma información en los dos órdenes:**
    - modalidad;
    - narración;
    - vehículos y daños;
    - reconstrucción física (velocidad previa con p10–p90, al impacto p10–p50–p90, impactos y lo que no cubre);
    - cuadros del 3D;
    - croquis;
    - verificación CESVI con fórmulas sustituidas y lo que falta;
    - comparación con la declaración;
    - conclusión, validación y trazabilidad.
  - **Por omisión**, el orden de la reconstrucción.
  - **Con «Con la estructura de los reportes de CESVI»**:
    - título «DICTAMEN TÉCNICO DEL HECHO DE TRÁNSITO EN SU MODALIDAD DE …»;
    - después: objetivos, fundamentos, características de los vehículos, observación de daños, lugar de los hechos, consideraciones, conclusiones y validación.
  - **La modalidad del título:** la que narra el perito; si no la dice, la que infiere Croquis (R4b), marcada como inferida y con su motivo.
- **El croquis 2D a escala** (`lib/croquis-caso.ts`) se dibuja con las trayectorias del solver, sin mapa de fondo:
  - el recorrido y el vehículo al inicio, en el impacto y en reposo;
  - el punto del impacto;
  - el norte y una barra de escala.
- **Cuadros del 3D:** antes del impacto, en el impacto y en reposo, capturados con `captureFrame` del visor (`VisorEscena.onExportApi`), solo si el perito abrió el 3D.
- **La conclusión es del perito.**
  - Sin su nombre y su conclusión validados, el documento dice «BORRADOR · Pendiente de validación del perito» y «[el perito debe concluir]».
- **La comparación con la declaración** (R7) entra si el perito la usó: la tabla «Qué cambia entre versiones» y, si la pidió, la sugerencia con su decisión.
- **Trazabilidad:**
  - el método (versión del solver, de la lectura y de la verificación CESVI);
  - la huella de las entradas (SHA-256 del expediente y la narración);
  - quién validó y cuándo.
- **El pie de cada página:** «Elaborado con apoyo de Croquis. El dictamen es responsabilidad del perito que lo firma. Reconstrucción de apoyo.»
- **Pruebas:**
  - **5 unitarias:**
    - los dos órdenes;
    - borrador contra validado;
    - R7 con y sin sugerencia;
    - terminología;
    - que el Word sale.
  - **La e2e `@flujo` de «Caso nuevo»:**
    - valida el dictamen;
    - pide la estructura de CESVI;
    - descarga el PDF (con al menos cuatro imágenes: el croquis y los tres cuadros del 3D) y el Word.

## Límites

- **El croquis no va sobre el mapa:** es el dibujo a escala en metros, sin calles. Las calles de OpenStreetMap del mapa de «Caso nuevo» no se exportan.
- **Consideraciones:** no hay borrador redactado por Claude, como en el prototipo. La conclusión la escribe el perito.
- **La validación no se guarda:** vive en la página. El caso se descarga en JSON aparte.

## Consecuencias

- **De la narración al documento:** el perito sale de «Caso nuevo» con un dictamen que puede revisar, firmar y entregar, con cada número de la reconstrucción y su rango.
