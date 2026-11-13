# ADR 0135 · W8 · T3.2: contacto estable, pivote del rumbo en el punto de impacto y rumbo que la evidencia no fija

- **Estado:** aceptado (René, 2026-11-12). Escrito antes de cambiar el solver, como pidió René: el criterio de la decisión 3 se fija aquí y vale igual para todos los casos.
- **Fecha:** 2026-11-12
- **Frente:** W (W8, T3.2)
- **Relacionados:** ADR 0010 (inversión, identificabilidad por Laplace), ADR 0091 (multiarranque, modos, supuestos declarados), ADR 0100 (hipercubo latino), ADR 0131 (los supuestos del tope en el rango).

## Contexto

En AXA, el rumbo inicial de V2 quedaba en el límite de búsqueda (+20° sobre el que colocó el perito) y V2 salía a 71.56 km/h (p10–p90 68.02–92.81), con los 63.15 km/h de CESVI fuera del rango. El diagnóstico (`docs/progress/W.md`, «T3.2 · Diagnóstico»; `eval/results/t3_2_rumbo_axa.json` y `t3_2_contacto_axa.json`) encontró dos causas:

1. **El contacto salta.** `resolve_contact` busca dónde se tocan las zonas de impacto: proyecta el punto de impacto del evento sobre las dos trayectorias y luego `_refine_pair` minimiza la distancia entre los dos puntos de contacto. Cuando las trayectorias van casi en la misma línea, esa distancia es casi cero a lo largo de muchos metros y el refinamiento corre hasta donde las líneas se cruzan. Con girar 0.01° el rumbo de V1, el contacto se movió 5.76 m del punto del evento; con 1°, 9.29 m. Es un error numérico: los puntos de contacto son el centro de una zona de un tercio de la cara (SAE J224), y a 16 cm uno del otro las zonas ya se tocan.
2. **El rumbo gira alrededor del arranque.** El parámetro del rumbo inicial no declarado gira la pose inicial alrededor de su posición, así que al cambiarlo se mueve el punto donde ocurre el choque. El punto del choque es evidencia: no debe moverse al variar el rumbo.

Con los dos, el costo contra el rumbo de V2 tiene saltos de 0.03 a 15 en 1°, y el ajuste cae en un valle que el límite corta en +20°. René eligió (2026-11-12) los dos arreglos más una regla para el rumbo que la evidencia no fija.

## Decisión

### 1. Contacto estable (error numérico)

- **Tolerancia de la zona:** dos zonas de impacto se tocan si sus puntos de contacto quedan a no más de la suma de la mitad del ancho de cada zona. Cada zona es un tercio de su cara (SAE J224, la misma división que ya usa `contact_offset`): en el frente o la parte trasera, un tercio del ancho del vehículo; en un costado, un tercio del largo. Así la tolerancia de un par es (cara_a + cara_b) / 6. Sale de la definición de la zona, no de un caso.
- **Cuál de los contactos posibles:** si después del refinamiento las zonas se tocan, entre las posiciones donde siguen tocándose se toma la más cercana al punto de impacto del evento. Se busca a lo largo del segmento (en los dos parámetros de trayectoria) entre la solución refinada y la proyección inicial del punto del evento, con bisección: la más cercana al punto del evento cuya distancia entre puntos de contacto no pase de la tolerancia. Es continua: al abrir el ángulo entre las trayectorias, el contacto se aleja del punto del evento poco a poco, sin saltos.
- **Si no se tocan** (la distancia mínima pasa la tolerancia), todo queda como antes: el acercamiento máximo y la bandera `zonas_no_se_tocan`.
- **Alcance:** solo los impactos entre dos vehículos. Contra un objeto o una persona no cambia nada.
- **Por qué no el término del experimento:** la medición de opciones (`eval/t3_2_opciones.patch`) usó un término μ·|punto medio − punto del evento|² con μ = 1e-4. μ no sale de ninguna medida y habría que calibrarlo; la tolerancia de la zona sí sale de la geometría.

### 2. El rumbo gira alrededor del punto de impacto

- El rumbo inicial no declarado de un vehículo gira su pose inicial alrededor del punto de impacto del primer evento de impacto en el que participa, si el evento trae `punto_impacto` (sea cual sea su fuente: es el punto con que se busca el contacto). Así, el rumbo cambia de dónde venía el vehículo, no dónde chocó.
- Sin `punto_impacto`, gira alrededor de su posición inicial, como antes.
- Vale para el ajuste, los reajustes del rango y el sorteo de la decisión 4.

### 3. Cuándo la evidencia no fija un rumbo (criterio general)

Un rumbo inicial no declarado queda **fijado por la evidencia** solo si se cumplen las dos condiciones. Las dos usan constantes que ya estaban antes de AXA y de T3.2:

- **(a) Laplace** (ADR 0010, desde F7): su desviación local es de a lo más `IDENT_MAX["rumbo"]` = 15°.
- **(b) Perfil:** al mover ese rumbo 15° hacia cada lado de su mejor valor, sin salir de los límites de búsqueda (si el límite queda más cerca, hasta el límite), y reajustar todo lo demás, el costo sube al menos `MODE_MARGIN` = 0.5 de cada lado.
  - Con residuos chicos, el costo `soft_l1` es ½ χ², así que 0.5 es un Δχ² de 1. Es lo que el ruido de la evidencia ya no explica: el intervalo del 68 % de un parámetro por verosimilitud de perfil.
  - En palabras: si la evidencia explica casi igual de bien el rumbo 15° más a un lado, no lo fija.
  - Se pide de los dos lados porque basta un lado plano para que el intervalo pase de ±15°.

(b) existe porque Laplace es local y, con un costo irregular, puede dar una curvatura alta en un valle estrecho que la evidencia no prefiere. La regla se aplica igual a todos los vehículos y escenas, y se decide sobre el mejor modo.

### 4. Si no lo fija: el rumbo del perito, como supuesto declarado, en el rango

- **El valor:** el rumbo que colocó el perito (o el de la escena), es decir, el valor inicial del parámetro.
- **El ajuste:** se rehace la búsqueda de modos (multiarranque) sin ese rumbo entre las incógnitas, para que las velocidades no salgan de un reajuste local desde el modo con el rumbo libre.
- **Va como supuesto declarado:** «Rumbo inicial de V2: el que colocó el perito (75.7°); la evidencia no lo fija; ±20° en el rango». Va en la inversión (`rumbo_inicial`, con `identificable: false` y su supuesto) y en la lista única de supuestos (`supuestosDeclarados`, ADR 0091), así que llega a la bitácora, al 3D y al dictamen.
- **Entra al rango.** En cada reajuste con entradas perturbadas (el Monte Carlo del rango de la inversión, de donde salen el p10 y el p90 de las velocidades), el rumbo se sortea uniforme en ±`ANGLE_BOUND_DEG` = ±20° alrededor del del perito, girando alrededor del punto de impacto. ±20° es el rango declarado de este supuesto desde ADR 0010 (el mismo de la búsqueda).
  - El sorteo va en un hipercubo latino aparte, con una semilla derivada de la del caso, como los supuestos del tope (ADR 0131). Una escena sin rumbos no fijados conserva sus sorteos: no cambia ni un decimal por esta regla.
- El Monte Carlo «hacia adelante» (`resultado.incertidumbre`, que muestrea los datos de la escena) no cambia: el rango de la velocidad que ve el perito es el de la inversión.

### 5. Python y TS

Todo va en el solver de referencia (Python) y en el port TS, con paridad E7. Las referencias se regeneran con el código nuevo.

## Consecuencias

- El número de AXA será el que salga de este código, sea cual sea (condición de René). La medición de opciones daba unos 64.6 km/h, pero era un experimento con otro arreglo 1; la cifra final sale de la corrida con este código.
- Antes de fusionar, René recibe el antes y el después de las 14 escenas de referencia (las 13 de antes y `terraceria_topes`, de W5), de los casos de CESVI y del efecto en la E-R4. Si un caso empeora sin una razón física, se detiene.
- Al fusionar, la cifra de AXA cambia a la vez en todas partes: Reconstrucción, Contra CESVI, Presentar, dictamen, README y pruebas.
- El criterio (b) cuesta dos ajustes más por rumbo no declarado, y rehacer los modos cuando un rumbo no queda fijado cuesta otra búsqueda. Se mide el tiempo del resultado completo en el navegador (meta: por debajo de 10 s, T3.1).
