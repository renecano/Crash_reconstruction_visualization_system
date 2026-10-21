# ADR 0055 — El hecho (descripción técnica y declaración) y el punto de impacto editable

- **Estado:** aceptado (2026-10-21).
- **Contexto:** René pidió dos cambios al recorrido de `/cesvi`.
  - **El paso 2 deja de ser el relato de un conductor:** ahora es «El hecho». El texto principal es la descripción técnica del perito y la declaración del conductor es secundaria. Cada una arma su versión, con lenguaje técnico de CESVI.
  - **En el paso 3, el perito corrige el punto del choque:** lo cambia de lugar o lo quita, y en los pasos 3 y 4 deshace y rehace.

## Decisión

### El hecho

- **Dos entradas y dos lecturas separadas:**
  - la «Descripción técnica del hecho», del perito (principal), arma la versión de la evidencia;
  - la «Versión declarada a analizar», la cita literal del conductor (secundaria), arma la versión declarada.
- **Lectura con Claude** (`packages/cesvi/src/server/hecho.ts`, ruta `POST /api/cesvi/hecho`):
  - **Prompt nuevo:** en lenguaje técnico de CESVI. Pide la modalidad; el sentido y el carril; la zona de contacto de cada vehículo con su acentuación y vértice; la dirección de la fuerza; las maniobras en orden; los restos y las huellas; las posiciones finales; y las condiciones de la vía.
  - **Salida estructurada:** una lista plana de datos (campo, vehículo, valor, cita) más las preguntas. La API rechazó primero un esquema por vehículo con campos anulables: admite a lo más 16 parámetros con unión, y luego dijo que la gramática era demasiado grande. La lista plana deja una sola unión (los metros), y el código la convierte en la lectura por vehículo (`lecturaDeSalida`).
  - **Sin Claude:** si no hay llave o se alcanzó el tope de gasto, la ruta lee con reglas sobre el mismo glosario (`hecho-reglas.ts`) y dice por qué.
- **El glosario** (`data/cesvi/glosario.json`, de `data/cesvi/scripts/glosario.mjs`):
  - **Qué es:** 114 términos en 10 categorías, cada uno con en cuántos de los 671 dictámenes de `data/raw/cesvi/` aparece. Va en el prompt.
  - **Cómo se armó:** la lista de términos es cerrada. Se eligió revisando los n-gramas más frecuentes del corpus, que traen nombres de peritos, por eso no se guardan.
  - **Qué se sube:** el glosario sí, con términos y conteos; el texto de los dictámenes no.
- **La IA no produce números** (`validarLectura`, en el navegador):
  - cada dato trae su cita literal; si la cita no está en el texto, el dato se descarta y se cuenta;
  - un número que no está escrito en su cita se quita;
  - «unos metros» queda sin número y se pregunta.
- **Fuente por dato:**
  - perito, para lo que dice la descripción o lo que contesta el perito;
  - conductor, para lo que dice la declaración;
  - expediente, para los vehículos;
  - supuesto, para lo que se dibuja sin dato.

  También se dice quién lo leyó: la IA, las reglas o el perito.

- **Preguntas técnicas:**
  - **Las de Croquis**, cuando falta lo que la versión necesita: «¿Carril de A al momento del impacto?», «¿Sentido de circulación de A?», «¿Longitud de la zona de restos, en metros?» y «¿Cuántos metros de reversa?».
  - **Las del modelo:** hasta 4, solo sobre la descripción técnica. Las de la declaración preguntaban lo que la descripción ya dice.
  - **Al contestar:** las contestadas se quedan para poder cambiarlas, y la respuesta entra como dato del perito.
- **Las versiones del paso 4:** la versión de la evidencia toma el sentido y la longitud de los restos de la descripción técnica; la declarada toma el sentido y los metros de reversa de la declaración (o de lo que contesta el perito). `proponerVersiones` acepta ahora un rumbo por versión. Si una lectura o una respuesta cambia los parámetros de una versión, se vuelve a armar solo esa; la otra conserva lo que movió el perito.
- **Sin la versión para el público:** en `/cesvi` no quedan «relato», «Cuenta qué pasó» ni «tu dispositivo». El recorrido ya no usa la extracción del relato ni su ruta.
- **Para CI:** Croquis escribió con palabras propias una descripción técnica del caso AXA (`data/cesvi/casos/A2010930-hecho.json`). No copia el dictamen y no dice el carril, porque el dictamen no lo da: así el recorrido lo pregunta. Su lectura y la de la declaración se grabaron con Claude (`data/cesvi/grabaciones/hecho-A2010930.json`, con `data/cesvi/scripts/grabar-hecho.mjs`). La usan las pruebas y la e2e.

### El punto de impacto editable

- **«Cambiar ubicación»:** el punto se mueve arrastrando la ✕, tocando el mapa o escribiendo las coordenadas.
  - **Los vehículos van con él** (`trasladarVersion`): cada posición conserva su distancia y su ángulo respecto al punto, y todo gira lo que gira la vía del lugar nuevo (`giroEntreVias`, el giro más chico sin voltear el sentido).
  - **Las calles se traen al instante,** del tramo precargado y de los mosaicos (ADR 0053), sin esperar a Overpass.
- **«Quitar punto»:** borra el punto y las versiones, y se vuelve a marcar desde cero.
- **«Restablecer posiciones»:** vuelve a armar las dos versiones en el punto actual, con los parámetros del hecho.
- **Deshacer y rehacer** (`historial.ts`, con pruebas): una pila de estados de las versiones, con botones y con Ctrl+Z, Ctrl+Shift+Z y Ctrl+Y en los pasos 3 y 4, mientras no se escribe en un campo. Cubre marcar, mover, quitar y restablecer el punto, mover marcas, girar vehículos y los cambios que llegan del paso 2. Guarda hasta 100 pasos atrás.

## Consecuencias

- **Gasto:** grabar las lecturas costó 0.0527 USD (dos corridas; la primera no se guardó porque faltaba la carpeta).
- **La e2e del recorrido:**
  - llena la descripción técnica y la lee;
  - contesta el carril y los metros de reversa;
  - marca el punto, lo mueve, deshace y rehace con botones y con el teclado;
  - lo quita, deshace y restablece.
- **El módulo de la declaración del Hito 4** (`declaracion.ts`) y su grabación se retiraron: «El hecho» los reemplaza.
