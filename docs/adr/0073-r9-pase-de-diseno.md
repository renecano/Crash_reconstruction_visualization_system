# ADR 0073 — R9: pase de diseño de las pantallas de R0–R8

- **Estado:** aceptado (2026-10-23), pendiente de la revisión visual de René.
- **Contexto:** R9 de `docs/cesvi/PLAN-CESVI.md` pide que todo lo nuevo de R0–R8 lleve el diseño del recorrido de 8 pasos, con el mismo nivel: maquetas de `docs/cesvi/rediseno/`, modo Presentar / Trabajar y tema claro y oscuro.
  - **Capturas del estado de partida (2026-10-23):**
    - «Caso nuevo», «Cargar un reporte» y «Reproducción de reportes» salían en claro fijo (`data-tema="claro"`), sin la barra del sistema, sin modos y sin forma de ir de una pantalla a otra;
    - «Reproducción de reportes» era una tabla de 205 renglones sin jerarquía;
    - el recorrido no tenía 3D.

## Decisión

- **`MarcoCesvi`** (`components/cesvi/marco-cesvi.tsx`) envuelve las pantallas fuera del recorrido:
  - **la barra del recorrido:** la marca y la navegación entre «Recorrido AXA», «Caso nuevo», «Cargar un reporte» y «Reproducción de reportes», con `aria-current`;
  - **Presentar / Trabajar;**
  - **el tema recordado por modo:** `preferencias-cesvi`, ADR 0057; Trabajar es claro y Presentar oscuro por omisión;
  - **la leyenda de reconstrucción de apoyo** al pie.
  - **Comparte el modo y el tema** (`useModoCesvi`); el mapa de «Caso nuevo» cambia de estilo con el tema, como el del recorrido.
- **Presentar fuera del recorrido:**
  - **Clases de CSS:**
    - `.solo-trabajar` (controles de edición) se oculta al presentar;
    - `.solo-presentar` se ve solo al presentar;
    - `.ancho-al-presentar` ocupa la fila entera cuando su panel de edición se oculta.
  - **Las reglas van con `!important`**, porque las utilidades de Tailwind (`flex`, `grid`) van en una capa posterior.
  - **«Caso nuevo»** abre en Trabajar (es la herramienta de trabajo). Al presentar:
    - la narración se ve como texto y el título dice «El hecho, reconstruido»;
    - se ocultan las preguntas, las herramientas del mapa (y el clic ya no coloca), la descarga del JSON, las entradas de la declaración y las del dictamen;
    - quedan los resultados, el 3D, la comparación y las descargas.
- **«Reproducción de reportes»** (sin modos: solo se consulta):
  - **la modalidad contra las dos referencias, lado a lado:** el título del reporte y la etiqueta de R0 (ADR 0071);
  - **los otros ejes**, en tarjetas;
  - **la lista compacta**, con la columna «Título del reporte», filtros por modalidad que concluyó CESVI y por si Croquis coincide, y de 40 en 40.
- **«Cargar un reporte»:** zona para elegir o arrastrar el archivo, en lugar del selector del navegador.
- **El 3D en el recorrido de AXA:**
  - «Ver la reconstrucción en 3D» en el paso 4 abre, a pantalla completa, la versión de la evidencia con el solver;
  - `expedienteDelRecorrido`: los vehículos, daños, masa y restos del reporte, con las posiciones del perito;
  - las mismas piezas que «Caso nuevo» (`especDeExpediente`, Web Worker, `VisorEscena`).
- **Carambolas, comparación y dictamen** viven dentro de «Caso nuevo» y heredan el marco, el tema y los modos.

## Pruebas

- **Unitarias:**
  - el marco (navegación, modos, tema), con 3 pruebas;
  - el caso del recorrido como expediente válido que el solver reconstruye como alcance, con 2 pruebas.
- **e2e `@flujo`:**
  - el recorrido abre y cierra el 3D;
  - «Reproducción de reportes» muestra las dos referencias y filtra;
  - las cinco pasan en Chromium.

## Límites

- **Pendiente:** la revisión visual de René (el plan la pide antes de cerrar R9).
- **El recorrido de AXA conserva su propia barra** (pasos, «Llenar a mano», «Exportar»). Lleva a las otras pantallas por la marca del marco, no al revés: desde el recorrido no hay enlace a «Caso nuevo».
- **Las calles del mapa en el croquis del dictamen** son la primera prioridad después de R9 (`docs/PROGRESS.md`).
