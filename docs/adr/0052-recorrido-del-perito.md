# ADR 0052 — El recorrido del perito en /cesvi

- **Estado:** aceptado (2026-10-21).
- **Contexto:** René pidió convertir `/cesvi` en un recorrido guiado, más demo y menos texto («Recorrido del perito» en `docs/cesvi/PROTOTIPO.md`): ocho pasos, una pantalla por paso, el mapa o el dibujo a casi toda la pantalla, una frase corta por paso y el detalle en un panel. Los hitos 1 a 3 ya estaban construidos como una página larga.

## Decisión

- **Una sola página de pantalla completa** (`components/cesvi/recorrido/`):
  - **Arriba:** la barra de pasos.
  - **Al centro:** el escenario.
  - **Abajo:** la frase del paso, «Ver detalle» (o «Ver cálculo») y el avance.
  - **Navegación:** se avanza con los botones, la barra o el teclado (← →, salvo mientras se escribe en un campo). Todos los cambios de paso pasan por una sola función, que también dispara lo que hace cada paso al entrar (leer la declaración, animar las versiones, armar el PDF).
- **Un solo mapa para todos los pasos** (`mapa-recorrido.tsx`): la cámara vuela entre pasos. En los pasos que no son del mapa queda detrás, atenuado.
  - **La versión a la vista:** se anima de la posición inicial al impacto y del impacto a la final, y la zona de restos crece con el desplazamiento.
  - **Movimiento reducido:** sin vuelos ni animaciones; los números aparecen directo.
- **Paso 2, lo que entiende la IA** (`packages/cesvi/src/declaracion.ts`, con pruebas):
  - **La lectura:** reúsa la extracción de «Cuenta qué pasó» (`/api/relato/extraer`, con Claude si hay llave y tope de gasto, y si no, con reglas).
  - **Lo que el contrato no guarda:** el sentido de circulación, el orden de los hechos y quién impacta a quién salen de detectores escritos para declaraciones de dictamen.
  - **Cada dato:** lleva su frase subrayada, su fuente (declaración, expediente, perito o supuesto) y quién lo entendió (IA, reglas o perito).
  - **Lo que no sabe, lo pregunta:** «unos metros» no es un número, así que pregunta «¿Cuántos metros de reversa?». La respuesta del perito mueve la versión declarada en el mapa.
  - **Lo que no pregunta:** ni velocidades (salen de los cálculos) ni zonas de golpe (las da la observación de daños del dictamen).
  - **Respuesta grabada:** se grabó una respuesta real de Claude para la declaración (`data/cesvi/grabaciones/declaracion-A2010930.ndjson`, 0.0214 USD). La usan la e2e y las pruebas unitarias; CI no llama a la API.
- **Paso 3, el lugar:**
  - **Sin coordenadas:** el dictamen no da coordenadas del km 47+800, y OpenStreetMap no tiene marcas de kilómetro en el tramo (se consultaron con Overpass: ninguna).
  - **Lo que hace el mapa:** vuela al tramo Los Mochis–Navojoa (Nominatim), y el perito marca el punto o escribe las coordenadas.
- **Paso 4, las versiones:** B se dibuja dos largos de vehículo atrás antes del impacto, para que se vea llegar. Es un supuesto ilustrativo, escrito como tal y movible.
- **Lo que se reúsa de los hitos 1 a 3:** el módulo de cálculo y el panel de cálculos (siempre montado, porque sus resultados los usan los pasos 6 a 8), la tabla de reproducción, las versiones, la sugerencia, los criterios de CESVI, el borrador con Claude y el PDF del dictamen.
- **Lo que se retira:** la página larga (`caso-interactivo.tsx`, `mapa.tsx` y el cuerpo de `correspondencia.tsx`). Todas sus funciones están dentro de los pasos.

## Consecuencias

- **La e2e de `/cesvi`:** una sola, en Chromium, que recorre los ocho pasos con el teclado y los botones, edita en los pasos 2, 4, 6 y 7, pide el borrador (simulado) y descarga el PDF. No usa red externa.
- **Vista previa del PDF:** se muestra en un `iframe` con el visor del navegador. En Chrome, Edge y Safari de escritorio funciona; Chromium sin interfaz no trae visor, y por eso la prueba revisa el archivo descargado.
