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

### 2. El rumbo gira alrededor del punto de impacto (solo si lo dio el perito)

**Corrección del 2026-11-13 (René), después de medir:** el punto del choque se fija (el pivote del rumbo) **solo cuando lo dio el perito**: lo marcó en el mapa (`procedencia.fuente = usuario`, C1) o sale de las posiciones de impacto que colocó en el flujo de CESVI (el punto del evento que arma `especDeExpediente`). Cuando viene del relato (`relato`), es una estimación con su incertidumbre: el rumbo gira desde el arranque, como antes de W8, y solo se corrige el error numérico del contacto (decisión 1). Motivo: en `interseccion_toluca`, `lateral_interseccion` y `glorieta` el punto viene del relato, y con el pivote en él las posiciones finales cabían peor (Toluca, costo de 1.51 a 8.10), porque el solver de `main` corría el choque de 2.6 a 5.4 m del punto del relato para explicarlas. Un punto que el relato estima no tiene por qué ganarle a las posiciones finales.

**Pero no se mueve en silencio:** si en el mejor ajuste el choque queda a más de 2 m del punto que da el relato (el doble de la σ de una posición medida, `SIGMA_POSITION_M` = 1 m), la reconstrucción lo lista entre sus límites, en el paso de Reconstrucción y en el dictamen: «El choque quedó a X m del punto que da el relato: el relato lo estima y la evidencia lo lleva ahí.» (`choqueLejosDelRelato`, `packages/cesvi`).

Lo que sigue de esta sección vale para el punto que dio el perito:

- El rumbo inicial no declarado de un vehículo gira su pose inicial alrededor del punto de impacto del primer evento de impacto en el que participa, si el evento trae `punto_impacto` (sea cual sea su fuente: es el punto con que se busca el contacto). Así, el rumbo cambia de dónde venía el vehículo, no dónde chocó.
- Sin `punto_impacto`, gira alrededor de su posición inicial, como antes.
- Vale para el ajuste, los reajustes del rango y el sorteo de la decisión 4.

### 3. Cuándo la evidencia no fija un rumbo (criterio general)

**Versión 1** (la que se escribió antes de cambiar el solver, el 2026-11-12; la versión 2, la que vale, está más abajo). Un rumbo inicial no declarado queda **fijado por la evidencia** solo si se cumplen las dos condiciones. Las dos usan constantes que ya estaban antes de AXA y de T3.2:

- **(a) Laplace** (ADR 0010, desde F7): su desviación local es de a lo más `IDENT_MAX["rumbo"]` = 15°.
- **(b) Perfil:** al mover ese rumbo 15° hacia cada lado de su mejor valor, sin salir de los límites de búsqueda (si el límite queda más cerca, hasta el límite), y reajustar todo lo demás, el costo sube al menos `MODE_MARGIN` = 0.5 de cada lado.
  - Con residuos chicos, el costo `soft_l1` es ½ χ², así que 0.5 es un Δχ² de 1. Es lo que el ruido de la evidencia ya no explica: el intervalo del 68 % de un parámetro por verosimilitud de perfil.
  - En palabras: si la evidencia explica casi igual de bien el rumbo 15° más a un lado, no lo fija.
  - Se pide de los dos lados porque basta un lado plano para que el intervalo pase de ±15°.

(b) existe porque Laplace es local y, con un costo irregular, puede dar una curvatura alta en un valle estrecho que la evidencia no prefiere. La regla se aplica igual a todos los vehículos y escenas, y se decide sobre el mejor modo.

**Qué falló de la versión 1** (medido con el código, `eval/results/w8/referencias.json` del commit `3c8935ff`; René lo vio el 2026-11-12). La versión 1 devolvía al del perito todo rumbo que no fijara la evidencia, sin preguntar si la evidencia aceptaba el valor del perito. En tres escenas de referencia el resultado empeoró sin razón física:

- **`interseccion_toluca` (rumbos ligados):** probados uno por uno, con el otro libre, cada uno de los dos rumbos parecía no fijado, porque el otro lo compensaba. Pero devolver los dos a la vez al valor del perito empeoró la evidencia: el reposo de A pasó de menos de 0.3σ a −3.47σ, y el de B, de −0.68σ a −2.18σ.
- **`motociclista` (el límite contado como plano):** el mejor rumbo de A estaba en el límite (+20°). El lado de afuera no tenía espacio y, medido «hasta el límite», el costo no subía, así que contó como no fijado. Al volver al del perito, A quedó en 0 km/h (en el límite) y las marcas de B pasaron de −0.30σ a −3.94σ. La evidencia sí decía algo, y era que el rumbo iba más allá del límite.
- **`lateral_interseccion`:** al volver el rumbo de A al del perito, la velocidad de A pasó de «no se fija» a 84.92 km/h (el relato dice 45), y el rumbo final de B, de 1.34σ a 3.54σ.

**Versión 2** (René, 2026-11-12, después de ver estos resultados). Los candidatos son los mismos de la versión 1 (los que (a) o (b) dicen no fijados), pero un candidato **vuelve al del perito solo si la evidencia explica ese valor casi igual de bien**:

- **Prueba de razón de verosimilitudes en el valor del perito:** con ese rumbo fijo en el valor del perito (y los que ya volvieron, también en el suyo) y todo lo demás reajustado, el costo sube menos de Δχ² = 1 (`HEADING_LR_MARGIN` = `MODE_MARGIN` = 0.5) sobre el mejor ajuste.
- **De uno en uno:** primero se mide esa subida para cada candidato solo; se prueban del que menos sube al que más, cada uno junto con los que ya volvieron, y se para en el primero que no pasa. Así, dos rumbos ligados no vuelven juntos si juntos la evidencia ya no cabe.
- **Un candidato que no pasa se queda con su mejor ajuste.** Si ese ajuste está en el límite de ±20°, el perito ve el aviso «la evidencia empuja el rumbo fuera del rango permitido» (decisión 6), no un número callado.

**Por qué no es un ajuste para AXA:** la versión 2 cambia la pregunta, no un número. Usa la misma constante de antes (Δχ² = 1, de ADR 0091, anterior a AXA y a T3.2). Las escenas que la motivaron son de referencia (Toluca, la moto y el lateral), no AXA. Y no se eligió por cómo deja a AXA: en AXA, la versión 1 ya devolvía el rumbo de V2 al del perito, y la versión 2 hace lo mismo si la evidencia lo acepta. **Se cambió después de ver resultados, y por eso se deja escrita la versión 1 con lo que falló.**

**Prueba de robustez, no ajuste:** con Δχ² = 2.71 (el 90 % de un parámetro) en lugar de 1 se informa qué casos cambiarían (`eval/w8_robustez.py`). El criterio se queda en 1.

### 4. Si no lo fija: el rumbo del perito, como supuesto declarado, en el rango

- **El valor:** el rumbo que colocó el perito (o el de la escena), es decir, el valor inicial del parámetro.
- **El ajuste:** se rehace la búsqueda de modos (multiarranque) sin ese rumbo entre las incógnitas, para que las velocidades no salgan de un reajuste local desde el modo con el rumbo libre.
- **Va como supuesto declarado:** «Rumbo inicial de V2: el que colocó el perito (75.7°); la evidencia no lo fija; ±20° en el rango». Va en la inversión (`rumbo_inicial`, con `identificable: false` y su supuesto) y en la lista única de supuestos (`supuestosDeclarados`, ADR 0091), así que llega a la bitácora, al 3D y al dictamen.
- **Entra al rango.** En cada reajuste con entradas perturbadas (el Monte Carlo del rango de la inversión, de donde salen el p10 y el p90 de las velocidades), el rumbo se sortea uniforme en ±`ANGLE_BOUND_DEG` = ±20° alrededor del del perito, girando alrededor del punto de impacto. ±20° es el rango declarado de este supuesto desde ADR 0010 (el mismo de la búsqueda).
  - El sorteo va en un hipercubo latino aparte, así que una escena sin rumbos no fijados conserva sus sorteos: no cambia ni un decimal por esta regla. Su semilla es **de diseño, fija** (como la del rango, T3.1, ADR 0100), no la del caso: la primera versión usaba una derivada de la del caso, como los supuestos del tope, y con ella el rango de V2 en AXA se movía con la semilla (p10 de 53.97 a 55.77 y p90 de 76.82 a 80.26 en 20 semillas, `axa_rango_estable`), contra la meta de T3.1 de que no se mueva.
- El Monte Carlo «hacia adelante» (`resultado.incertidumbre`, que muestrea los datos de la escena) no cambia: el rango de la velocidad que ve el perito es el de la inversión.

### 5. El aviso de «las zonas no se tocan»

La bandera `zonas_no_se_tocan` avisa solo si la distancia entre los puntos de contacto pasa de la tolerancia de la zona (decisión 1) y de los 0.5 m de siempre: dentro de la tolerancia, las zonas sí se tocan. Con la versión 1 salía en `nocturno_lluvia` aunque las zonas se tocaban.

### 6. El rumbo en el límite se le dice al perito

Si en el resultado el mejor rumbo inicial de un vehículo queda en el límite de ±20° (`en_limite`), la reconstrucción del caso lo lista entre sus límites, visible en el paso de Reconstrucción y en el dictamen: «V2: la evidencia empuja el rumbo fuera del rango permitido (±20° sobre el que se colocó en el mapa). El mejor ajuste queda en el límite, …°, así que no cabe bien con lo demás: conviene revisar las posiciones y el rumbo de llegada.»

### 7. Python y TS

Todo va en el solver de referencia (Python) y en el port TS, con paridad E7. Las referencias se regeneran con el código nuevo.

### 8. AXA pasa a dos hipótesis (René, 2026-11-13)

Con el choque donde lo puso el perito, el daño medido deja a V2 a 3.9 m de su reposo supuesto (el del método de restos), y la consistencia pide las dos hipótesis de ADR 0091:

- **Cuadra con el daño medido**: V2 a 56.87 km/h (54.79–78.39). Es la que se ve sin elegir, porque es la medición.
- **Cuadra con el reposo supuesto**: V2 a 34.44 km/h (30.07–44.44). Va como alternativa, marcada como supuesto, igual en Reconstrucción, Contra CESVI, Presentar y el dictamen.

**Por qué antes había una sola:** la hipótesis única de antes salía del choque corrido 12 m. El contacto saltaba (decisión 1) y el rumbo en el límite movía el choque. Con eso, el daño y el reposo supuesto cabían juntos a 71.56 km/h. No era una solución de la evidencia en el lugar del choque que colocó el perito (`eval/results/w8/discrepancia_axa_*.json`).

### 9. El tiempo del resultado completo

El criterio, la búsqueda rehecha y ahora la segunda hipótesis de AXA cuestan tiempo. Se recortó sin cambiar ningún número (paridad E7 en diferencia 0 y el resultado completo idéntico byte por byte en tres escenas):

- el criterio se decide antes del sorteo del rango, así que si un rumbo vuelve al del perito, el sorteo de la primera pasada ya no se hace;
- en el navegador, el Monte Carlo y la hipótesis del reposo supuesto corren en otro worker al mismo tiempo que la inversión (`enParalelo`; `fullResult` con `enOtroWorker`);
- `axisOverlaps` y `pyRound`, los más calientes del perfil, sin arreglos intermedios ni la expansión decimal larga salvo en un posible empate.

## Consecuencias

- El número de AXA será el que salga de este código, sea cual sea (condición de René). La medición de opciones daba unos 64.6 km/h, pero era un experimento con otro arreglo 1; la cifra final sale de la corrida con este código.
- Antes de fusionar, René recibe el antes y el después de las 14 escenas de referencia (las 13 de antes y `terraceria_topes`, de W5), de los casos de CESVI y del efecto en la E-R4. Si un caso empeora sin una razón física, se detiene.
- Al fusionar, la cifra de AXA cambia a la vez en todas partes: Reconstrucción, Contra CESVI, Presentar, dictamen, README y pruebas.
- El criterio (b) cuesta dos ajustes más por rumbo no declarado, y rehacer los modos cuando un rumbo no queda fijado cuesta otra búsqueda. Se mide el tiempo del resultado completo en el navegador (meta: por debajo de 10 s, T3.1).
