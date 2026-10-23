# ADR 0080 — /cesvi V2: un solo recorrido guiado, con validación por paso y colocar sin arrastrar

- **Estado:** aceptado (2026-10-23). AXA entra a esta misma interfaz en V2-4 (siguiente PR).
- **Contexto:** René (2026-10-23) dejó las maquetas `docs/cesvi/rediseno/V2-Paso1-caso`, `V2-Paso3-lugar` y `V2-Paso3-mapa-expandido`. Pidió aplicarlas a todos los casos por igual, incluido AXA:
  1. el mapa como tarjeta, más grande en el lugar y expandible;
  2. la colocación guiada del paso 3;
  3. una interfaz más visual;
  4. validación por paso;
  5. correcciones (los reportes con «0 impactos», el mapa que abría en la Ciudad de México);
  6. «Entrar a Croquis» en la portada.

## Decisión

1. **La barra** (`recorrido/barra.tsx`):
   - los nombres de los 8 pasos siempre, «← Casos» y la barra de avance;
   - los pasos futuros se desactivan hasta completar lo obligatorio.
2. **Lo obligatorio** (`lib/pasos-caso.ts`, con pruebas):
   - **El caso:** cargar el reporte, solo en un caso importado.
   - **El hecho:** la narración leída.
   - **El lugar:** el punto de cada impacto entre vehículos (en una carambola, cada uno) y dónde quedó cada vehículo.
   - **La reconstrucción:** reconstruir.
   - **Lo opcional nunca bloquea:** masas, posiciones iniciales, restos, huellas y la declaración.
   - **Los botones:** «Siguiente: el hecho →» dice a dónde lleva y, desactivado, qué falta.
3. **El mapa:**
   - una tarjeta lateral en los pasos que no son de mapa;
   - más grande en el lugar y la reconstrucción;
   - «⤢ Expandir» lo lleva a pantalla completa, con el panel flotante de lo que falta, las herramientas al centro y «⤡ Contraer · Esc»;
   - el mapa se queda montado (el dictamen toma el croquis de él) y se ajusta con un `ResizeObserver`.
   - **Dónde abre:** en las posiciones del caso, o en sus coordenadas. Si no hay, en el paso del lugar pide buscarlo (Nominatim de OpenStreetMap: en México, en español y solo al pedirlo).
4. **El paso 3:**
   - **La lista guiada:** el punto de impacto y dónde quedó cada vehículo, con su estado; lo opcional aparte.
   - **El elemento activo** explica qué hacer en dos pasos («Toca el mapa…», «Gira la flecha…»).
   - **El rumbo:** se gira arrastrando la punta de una flecha sobre el mapa; escribir los grados es opcional.
   - **Las herramientas:**
     - «Colocar»: el mapa no se arrastra y Espacio sostenido lo mueve;
     - «Mover mapa»;
     - «Medir»: dos clics dan una distancia, que se usa como longitud de restos o como huella de frenado de un vehículo (`conHuella`).
   - **En el mapa:** las huellas de cada vehículo en su color, acercar, alejar y deshacer.
   - **Del punto de impacto,** Croquis propone la pose de impacto de cada vehículo (`posesDeImpacto` en `@croquis/cesvi`, con pruebas). Es la generalización de `proponerVersiones` de AXA:
     - el primero apunta a donde el perito gira la flecha;
     - el segundo se orienta por las caras de contacto: alcance, mismo rumbo; frontal, contrario; contra un costado, perpendicular;
     - cada uno queda con su cara de contacto en el punto.
   - **En una carambola,** el punto de cada impacto posterior solo coloca al vehículo que entra en él.
5. **Más visual:**
   - tarjetas de vehículo con su silueta vista desde arriba en su color (V1 azul, V2 ámbar, como las maquetas);
   - el anillo de avance;
   - «+ Agregar masa» en lugar de «falta»;
   - el detalle técnico (la validez de la escena contra el contrato) en «Ver detalle».
6. **Los reportes de la reproducción:**
   - **El impacto:** 169 de 205 no tenían, porque la narración sin conclusiones casi nunca lo dice. En el recorrido toman el impacto de las zonas de contacto que concluyó CESVI (fuente `dictamen_importado`). Si solo hay la zona de un vehículo, el impacto entre los dos primeros queda como `supuesto`.
   - **El paso 7** usa la comparación medida en E-R4 (la de la lectura de Croquis sin conclusiones), no una recalculada con ese impacto.
7. **La portada:** el botón principal es «Entrar a Croquis» (`/cesvi`); «Cuenta qué pasó», la versión para el público, queda en segundo plano. El rediseño de la portada queda pendiente.

## Pruebas

- **Unitarias:**
  - lo obligatorio por paso, carambola incluida (6);
  - las poses de impacto y la huella medida (5);
  - el impacto de las conclusiones en los reportes.
- **e2e `@flujo` en Chromium:**
  - **El caso nuevo:**
    - «Siguiente» desactivado con lo que falta y el paso 4 cerrado;
    - el punto de impacto propone las dos poses;
    - en «Colocar», arrastrar no mueve el mapa;
    - el rumbo escrito;
    - expandir y contraer con Esc.
  - **La carambola:** dos puntos de impacto y tres finales.
  - **El importado y la reproducción:** colocan lo que pide la lista antes de reconstruir.
  - **AXA** pasa sin cambios.

## Límites

- **AXA sigue con su propio recorrido** hasta V2-4.
- **Las huellas de frenado medidas** guardan solo la longitud; el contrato no tiene su posición.
- **La búsqueda del lugar** depende de Nominatim, un servicio externo. Si falla, se mueve el mapa a mano.
