# ADR 0057 — UI unificada: Presentar / Trabajar, tema claro y oscuro, y exportaciones

- **Estado:** aceptado (2026-10-21).
- **Contexto:** René pidió combinar el rediseño con la «UI unificada». Las maquetas nuevas (`docs/cesvi/rediseno/Paso4Trabajo.html`, `Paso8.html` y `Paso2Claro.html`) son la fuente de verdad visual junto con las anteriores. Quedan fuera el visor 3D, el dictado, los consentimientos y el chat «Preguntar».

## Decisión

- **Dos modos con los mismos datos.** El selector está en la barra superior.
  - **Presentar:** el recorrido de 8 pasos.
  - **Trabajar** (pasos 3 y 4), como en la maqueta Paso4Trabajo:
    - **a la izquierda:** las herramientas de colocación (A y B, punto de impacto, zona de restos, medir distancia) y «Lo que entendió», con su completitud;
    - **al centro:** el croquis, con las vistas Declarada, Evidencia, Superponer y Lado a lado (dos mapas);
    - **a la derecha:** el objeto elegido, con su posición en metros desde el impacto («adelante» en el rumbo de A y «derecha» a 90°), su rumbo y su fuente, todo editable, más «Restablecer posición», deshacer y «Qué cambia entre versiones».
- **La línea de tiempo** marca los eventos (aproximación, impacto y el reposo de cada vehículo) y tiene velocidades de 0.1×, 0.25× y 1×. Sin velocidades en el croquis, el reposo de cada vehículo se ordena con la raíz de lo que se desplaza después del impacto, con la misma desaceleración para los dos (`tiemposDeReposo`). Es tiempo relativo.
- **«Qué cambia entre versiones»** (`compararVersiones`, con pruebas) va en Trabajar y como resumen en el paso 7. Cada fila sale de la geometría de las versiones, de los daños que marcó el perito contra los que dejaría la maniobra declarada (`zonasEsperadasDeclarada`) y del cálculo. Nada está escrito a mano.
- **Paso 2:**
  - bajo cada dato, la frase que lo respalda;
  - un contador de completitud (`completitud`: 9 datos que necesita la reconstrucción) y casillas punteadas para lo que falta;
  - cada pregunta dice «¿Qué falta?» y «por qué importa», y siempre ofrece «No sé», que deja el dato como supuesto.
- **Barra superior:** el estado de la IA (en espera, entendiendo, lista, sin IA o con error) y «Llenar a mano», un formulario con las mismas claves que las preguntas. Lo que llena el perito gana a lo leído; sin ninguna lectura, arma igual las dos versiones.
- **Paso 8:**
  - la vista previa del PDF;
  - exportar a PDF (principal), Word (`docx` 9.13.0, MIT, con el mismo contenido que el PDF), el croquis en PNG (a escala, sin mapa de fondo) y el caso en JSON;
  - casillas de qué incluir: el croquis a escala de ambas versiones, los cálculos con valores sustituidos, la tabla de datos con su fuente y las notas internas;
  - la trazabilidad: método, huella de las entradas (SHA-256 de su JSON, 12 caracteres), sugerencia y quién validó y cuándo;
  - «Antes de firmar», con las notas pendientes: la diferencia de energía, los datos que faltan, la ubicación ilustrativa y la sugerencia sin validar.
- **Tema claro y oscuro:**
  - **El claro** usa la paleta de René, más `claro-senal-texto` (#B8360F). La señal pura no llega a 4.5:1 como texto sobre el fondo claro, así que solo se usa para marcas.
  - **El oscuro** es el de Sistema.
  - **Por defecto:** claro al trabajar y oscuro al presentar. El interruptor guarda la elección por modo en el navegador.
  - **El mapa** cambia de estilo de mosaicos (`positron` en claro) y vuelve a poner sus capas con los colores del tema.
  - **El PDF y el Word** usan los colores del tema claro para A y B, porque son papel.

## Consecuencias

- **La e2e del recorrido** cambia de modo y de tema, prueba Lado a lado, la velocidad y el objeto elegido, y exporta PDF, Word y JSON.
- **Pruebas unitarias:** comparación, completitud, «Llenar a mano», «No sé», eventos y reposos, y el contraste del tema claro.
