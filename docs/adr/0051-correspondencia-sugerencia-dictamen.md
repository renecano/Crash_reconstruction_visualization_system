# ADR 0051 — Correspondencia, sugerencia de Croquis y dictamen exportable (Hito 3)

- **Estado:** aceptado (2026-10-21).
- **Contexto:** el Hito 3 de `docs/cesvi/PROTOTIPO.md` pide:
  - los criterios de correspondencia de CESVI por vehículo;
  - un diagrama de zonas de daño;
  - una sugerencia de Croquis sobre la versión declarada, que el perito valida;
  - un borrador de las consideraciones redactado con Claude;
  - el dictamen en PDF con la estructura de CESVI.

## Decisión

- **Criterios** (`packages/cesvi/src/correspondencia.ts`): los siete de la especificación. Cada uno se marca como «Corresponde», «No corresponde» o «No se puede determinar», con una nota.
- **Zonas de daño:** el vehículo visto desde arriba, en una cuadrícula de botones (accesible con teclado y lector de pantalla). Abre con las zonas que dice el dictamen: A posterior izquierda y B frontal derecha.
- **La sugerencia** usa los tres argumentos con que el dictamen A2010930 decide, cada uno ligado a su evidencia:
  - **Velocidades:** si difieren de forma significativa, con el umbral del perito.
  - **Desplazamiento:** si los restos tienen separación. La versión declarada espera 0 m. Croquis no inventa un umbral de «mínimo»: lo dice y deja ese juicio al perito.
  - **Ubicación de los daños:** una acentuación lateral en ambos vehículos va contra la reversa; daños centrados en ambos, a su favor.
  - **La regla, escrita en la página:** dos razones en contra, «no se sostiene»; dos a favor, «se sostiene»; si no, «no concluyente».
- **Validación:** el perito acepta, edita o rechaza; queda quién validó (el nombre que escribe), la decisión y la fecha. El nombre no se guarda en ningún lado fuera de la sesión y del PDF.
- **Borrador de las consideraciones con Claude** (`@croquis/cesvi/server`, `POST /api/cesvi/consideraciones`):
  - **Lo que recibe Claude:** los números ya calculados y lo que marcó el perito. Redacta en el estilo de los dictámenes de CESVI y no calcula nada.
  - **Revisión de cifras:** al volver, Croquis busca cada número del texto y avisa de los que no venían en los datos.
  - **Modelo y límites:** el mismo de la extracción del relato (`CROQUIS_LLM_MODEL`, Sonnet 5.5 con respaldo del servidor), el mismo tope de gasto diario y el mismo límite de peticiones.
  - **Acceso:** la ruta va detrás de la protección de `/cesvi`.
  - **En las pruebas:** cliente falso y ruta simulada en la e2e; CI no llama a la API.
- **PDF** (`apps/web/src/lib/dictamen-cesvi.ts`, pdfmake):
  - **Estructura:** título con la modalidad, objetivos, fundamentos, características de los vehículos (placas omitidas), observación de daños con las zonas, lugar con el croquis sobre el mapa, consideraciones, conclusiones numeradas y validación del perito con línea de firma.
  - **Consideraciones:** la declaración, las fórmulas sustituidas, la tabla de reproducción, los criterios y el texto revisado por el perito.
  - **El croquis:** la imagen se copia del lienzo de MapLibre (`preserveDrawingBuffer`).
  - **Sin validar:** sale marcado «BORRADOR».
  - **Pie de cada página:** «Elaborado con apoyo de Croquis. El dictamen es responsabilidad del perito que lo firma.»

## Consecuencias

- **Pruebas:** unitarias de la sugerencia, del borrador (cliente falso, tope de gasto y rechazos) y del contenido del PDF, y la e2e `@flujo` hasta la descarga del PDF.
- **Siguiente:** René pidió convertir `/cesvi` en un recorrido guiado de 8 pasos («Recorrido del perito» en `docs/cesvi/PROTOTIPO.md`). Estos módulos se reusan dentro de los pasos.
