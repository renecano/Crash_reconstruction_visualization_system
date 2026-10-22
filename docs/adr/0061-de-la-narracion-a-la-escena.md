# ADR 0061 — De la narración del perito a la escena (R1)

- **Estado:** aceptado (2026-10-21).
- **Contexto:** R1 de `docs/cesvi/PLAN-CESVI.md` (plan v2). El paso «El hecho» del prototipo lee datos sueltos para dos vehículos (A y B, ADR 0055). La versión real necesita la escena completa del contrato 2.0.0 para cualquier caso:
  - N vehículos con clase y masa;
  - M impactos con zonas de contacto;
  - objetos fijos, restos, huellas y posiciones.

  Además, el perito corrige en el mapa y Croquis pregunta solo lo que más cambia la reconstrucción.

## Decisión

- **Lectura con el extractor del corpus (ADR 0058),** no uno nuevo:
  - **Cómo lee:** filas planas que Claude devuelve con salida estructurada, y que Croquis revisa contra el texto (citas y números) y contra el contrato (enumeraciones, esquema y validador semántico).
  - **Prompt propio de la narración** (`SISTEMA_ESCENA`, `escena-narracion-v1`): sin declaraciones, cálculos, criterios ni conclusiones.
  - **Fuente de todo:** `perito`. `expedienteDeSalida` recibe la fuente como parámetro; C0 sigue con `dictamen_importado`.
- **Posiciones:** el contrato las pide con coordenadas y rumbo, y una narración no las da.
  - **Lo que da la narración** es la descripción (`posicion`: fase y descripción, una sección nueva del extractor que solo usa este prompt). Sirve de guía y no va al contrato.
  - **Lo que pone el perito:** coloca a cada vehículo en el mapa con su rumbo. `conPosicion` lo guarda en la versión de la evidencia con fuente `perito`.
  - **Croquis no inventa coordenadas.**
- **Zonas de contacto:** un vehículo que participa en un solo impacto y tiene sus daños en una sola cara (sin contar los previos) aporta esa cara. El tercio y el vértice solo se agregan si todos sus daños coinciden. Si no, se pregunta.
- **Impacto supuesto:** las narraciones de R0 no dicen qué entró en contacto, porque eso es parte de lo que concluye CESVI. Cuando la narración tampoco lo dice, Croquis propone un impacto solo si no hay ambigüedad:
  - dos vehículos, cada uno con sus daños en una sola cara;
  - o un vehículo con sus daños en una sola cara y un solo objeto fijo dañado.

  Va con fuente `supuesto` y una pregunta para confirmarlo. Con más vehículos, caras u objetos, Croquis pregunta qué entró en contacto y en qué orden.

- **Preguntas,** en este orden y todas con «No sé»:
  1. el impacto supuesto o los impactos que faltan;
  2. las zonas de contacto ambiguas;
  3. las masas;
  4. la longitud de los restos;
  5. las posiciones finales.
- **Correcciones del perito** (fuente `perito`): `conMasa`, `conRestos`, `confirmarImpacto` y `conPosicion`.
- **Dónde vive:** una página propia, `/cesvi/caso` («Caso nuevo»). El recorrido de `/cesvi` tiene los dos vehículos del caso de AXA en todo su estado, y generalizarlo ahora pondría en riesgo la demo. La página nueva reutiliza el mapa (MapLibre con OpenFreeMap) y los estilos del recorrido.
- **Ruta:** `POST /api/cesvi/escena` lee con Claude, con el tope de gasto diario y el límite por hora. Sin Claude lo dice, y la página no supone nada.

## E-R1 (`eval/cesvi_r1_escenas.mts` → `eval/results/cesvi_r1_escenas.json`)

- **Muestra:** 10 narraciones de desarrollo de R0, sin fuga, una por modalidad del corpus de C0, en un orden fijo por SHA-256. La prueba congelada no se toca.
- **Grabación:** las respuestas de Claude se graban en `data/cesvi/grabaciones/escenas/` (0.34 USD). Las pruebas y CI las reproducen sin la API.
- **Resultado:** 10 de 10 escenas válidas contra el esquema y el validador semántico.
  - **Impactos:**
    - en 3 la narración dice qué entró en contacto;
    - en 1 Croquis lo supone y pide confirmarlo;
    - en las otras 6 lo pregunta, porque los daños están en varias caras.
  - **Masas:** ninguna narración las trae, así que se preguntan.

## Consecuencias

- **R2 recibe escenas con fuente por dato.** Lo supuesto está marcado y lo que falta, preguntado.
- **El recorrido de ocho pasos se generaliza a N vehículos más adelante,** con lo que deje R2 y R3. Mientras tanto, «Caso nuevo» es la entrada para cualquier caso.
- **Pruebas:**
  - `packages/cesvi/src/escena-narracion.test.ts`: lectura, zonas, impacto supuesto, preguntas, correcciones y las 10 grabaciones;
  - `src/server/escena.test.ts`: tope de gasto y cobro;
  - la e2e `@flujo` de `/cesvi/caso`, de la narración al mapa y a la escena.
