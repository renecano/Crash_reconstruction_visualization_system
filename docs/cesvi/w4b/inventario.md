# W4b · Menos ruido visual: inventario por pantalla

Regla (René, 2026-11-09; PLAN-CESVI §3.4): a primera vista, cada pantalla muestra solo lo que aparece en un dictamen de CESVI o lo que el perito necesita para decidir ahí. Lo demás va a un «Ver detalle» plegado: nada se borra y todo sigue disponible para el dictamen. Un número por cantidad.

Capturas del caso de AXA, de día y de noche: `antes/` y `despues/` (`e2e/capturas-w4b.spec.ts`).

## Inicio (`0-casos`)

- **Se queda:** la lista de casos, «Caso nuevo» y la búsqueda.
- **Se pliega:** nada.

## El hecho (`1-hecho`)

- **Se queda:**
  - la narración con lo leído resaltado;
  - los dos vehículos con su masa y de dónde sale;
  - la modalidad, el sentido y la vía.
- **Se pliega:** nada nuevo («Ver lo leído en detalle» ya estaba plegado).

## La escena (`2-escena`)

- **Se queda:** el mapa, la pregunta en curso y el avance.
- **Se pliega:** nada nuevo («Más herramientas» ya estaba plegado).

## Reconstrucción (`3-reconstruccion`)

- **Se queda:**
  - la velocidad antes del impacto del vehículo que importa, con su rango;
  - de qué método sale;
  - la velocidad del otro vehículo;
  - qué evidencia la fija.
- **Se pliega** en «Cómo se reparten las simulaciones»:
  - el histograma;
  - los percentiles p10, p50 y p90, que repetían el rango (p10 y p90 son sus extremos);
  - la mediana, que repetía al p50;
  - la pista «Pasa el puntero…».
- **Se pliega** en el detalle de la reconstrucción: «Solver resuelto · N mensajes» (la bitácora ya estaba ahí).

## Análisis (`4-analisis`)

- **Se queda:**
  - los daños por vehículo;
  - los criterios de correspondencia del método de CESVI, con su nota;
  - cada supuesto con su valor y la barra de su rango.
- **Se pliega** en «Por qué», dentro de cada supuesto: su justificación y su incertidumbre (dos párrafos por tarjeta).

## Contra CESVI (`5-contraste`)

- **Se queda:**
  - el conteo (coinciden, difieren, sin dato);
  - las dos lecturas con la cifra de Croquis, su rango, la diferencia en km/h y en % y la regla;
  - los criterios, el lado a lado y de dónde sale cada dato.
- **Un número por cantidad:** la velocidad de B del reporte de CESVI salía dos veces (63.15 en cada lectura). Ahora sale una vez, arriba de las dos lecturas, y cada lectura se compara contra ella.
- **Se pliega** en «Por qué difieren»:
  - la explicación del método;
  - «Por restos, con los mismos datos…».

## Dictamen (`6-dictamen`)

- **Se queda:** todo. Es el dictamen y sus controles.
