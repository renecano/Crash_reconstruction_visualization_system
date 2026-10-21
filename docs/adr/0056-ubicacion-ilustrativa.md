# ADR 0056 — Ubicación ilustrativa del km 47+800 y maqueta de «El hecho»

- **Estado:** aceptado (2026-10-21).
- **Contexto:** el dictamen A2010930 no da coordenadas del km 47+800, René no las tiene y OpenStreetMap no marca los kilómetros del tramo. René pidió inventar unas de esa carretera, para mostrar a CESVI que el recorrido funciona con coordenadas. También pidió que la maqueta del paso 2 la guardara Croquis, porque la versión actualizada no estaba en el disco.

## Decisión

- **Una ubicación ilustrativa, reproducible y marcada como tal** (`data/cesvi/scripts/ubicacion-ilustrativa.mjs` → `data/cesvi/casos/A2010930-ubicacion.json`):
  - **Cómo se elige:** el script toma los tramos de la carretera federal 15 (libre o de cuota) del tramo precargado de OSM, solo los del arroyo que va hacia el norte (el sentido del caso), y se queda con el punto medio de segmento más cercano a 47.8 km en línea recta del centro de Los Mochis.
  - **El resultado:** 26.20915, −109.05970, sobre la MEX 15D, a 47.0 km de Los Mochis. La MEX 15 libre del tramo no pasa de unos 21 km, por eso entra la de cuota.
- **Dónde se dice que es ilustrativa:**
  - **En el paso 3:** la ubicación aparece con la insignia «supuesto» y el aviso «El dictamen no da coordenadas: es un punto de la carretera federal 15 para mostrar el recorrido. No es el lugar real». Se usa con «Usar esta ubicación».
  - **Al marcarla:** el punto lleva la insignia «ilustrativa» y el aviso. Si el perito lo mueve, la insignia cambia a «perito».
  - **En el PDF:** el pie del croquis da el punto de impacto y, si es la ubicación ilustrativa, dice que no es el lugar real.
  - **Lo que no cambia:** las coordenadas a mano y el clic en el mapa siguen igual.
- **La maqueta de «El hecho»:** `docs/cesvi/rediseno/Paso2.html` se reescribió con el mismo formato y los mismos estilos que las demás maquetas, y muestra la pantalla que ya hace el recorrido (ADR 0055) con el ejemplo del caso AXA. La maqueta anterior, la de la narración del conductor, queda en el historial de git.

## Consecuencias

- **La pregunta sigue abierta:** la ubicación real del hecho continúa en las preguntas para CESVI. Cuando llegue, se reemplaza el archivo de la ubicación y se quita la marca de ilustrativa.
- **La e2e** marca la ubicación ilustrativa y comprueba su aviso. Luego mueve el punto a otro lugar de la misma carretera escribiendo coordenadas, y comprueba que deja de ser ilustrativa.
