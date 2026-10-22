# ADR 0066 — Impactos en secuencia: carambolas (R6)

- **Estado:** aceptado (2026-10-22).
- **Contexto:** R6 de `docs/cesvi/PLAN-CESVI.md` pide impactos en secuencia en el solver (Python y TS, con paridad), en el croquis (X1, X2…), en el 3D y en la línea de tiempo. El solver resolvía un solo impacto, el primero; los demás vehículos seguían su camino sin chocar. En el corpus de C0, 105 expedientes tienen 3 o más vehículos y 74 de ellos traen 2 o más impactos (`eval/results/cesvi_r6_carambolas.json`).

## Decisión

### En el solver

- **Qué es un impacto posterior:** un evento `impacto_vehiculo_vehiculo` o `segundo_impacto` de la escena, con al menos dos vehículos entre sus actores y un orden posterior al del primer impacto. El par son sus dos primeros vehículos.
- **Dónde se resuelve:** en la integración conjunta de la fase posterior (ADR 0063), a la que entran los vehículos del primer impacto y los de los impactos posteriores.
  - **Cuándo ocurre:** la primera vez que los contornos del par se tocan y se acercan en el punto de contacto (`_try_impact` en Python, `tryImpact` en TS).
  - **Cómo se resuelve:** con el impulso del primer impacto, `planar_impact`, con la misma restitución (0.1) y la misma fricción de contacto (0.4).
    - **El punto** es el promedio de las esquinas de cada contorno que quedan dentro del otro.
    - **La normal** es la del menor traslape (teorema del eje separador), de A hacia B.
  - **Después:** el par sigue con el contacto secundario de siempre, con el encaje de ese instante como permitido.
- **Un vehículo que todavía no choca** rueda libre (resistencia a la rodadura) hasta su primer impacto, y desde ahí usa el arrastre posterior al impacto de siempre. Si no, un vehículo en movimiento frenaría antes de que lo tocaran.
- **El mismo par del primer impacto** no se planea otra vez: lo cubre el contacto secundario.
- **Si un impacto declarado no ocurre** (sus trayectorias no se tocan), la bandera `impacto_no_ocurre` lo dice. No se fuerza.
- **El daño:**
  - **El primer impacto de cada vehículo** va en `dano`, con su delta-v, su PDOF y su velocidad de impacto. Para un vehículo que solo está en un impacto posterior, ese es su primero.
  - **Los siguientes** van en `danos_posteriores`, con el evento, el instante, el delta-v y la PDOF.
  - **La energía** se reparte entre los dos como en el primer impacto: inversamente a la rigidez B de la cara golpeada. La cara es la del CDC declarado del evento o, si no lo trae, la que mira hacia el otro vehículo en el contacto.
- **El evento** lleva el instante (t > 0) y el punto de contacto en `detalle.punto_m`.
- **Resultado 1.9.0.**
  - **Cambios:** `danos_posteriores` en el vehículo, `punto_m` en el detalle del evento y la escena canónica nueva `carambola` (un alcance en cadena con tres vehículos, a partir de `alcance`).
  - **Las once escenas canónicas anteriores** solo cambian su versión: en ellas no hay impactos posteriores.

### En «Caso nuevo» (paquete `cesvi` y la web)

- **El adaptador del expediente** pasa los impactos 2..M entre vehículos como eventos `segundo_impacto`, con sus zonas CDC. Los que son contra un objeto, o a los que les falta un vehículo, se dicen como límite.
- **El origen de la escena** es el primer impacto: el promedio de las posiciones de impacto de sus vehículos.
- **Un vehículo que solo está en un impacto posterior** empieza detenido en la posición de impacto que colocó el perito. Es un supuesto y se dice en los límites: así está quien espera en una fila.
- **La interpretación:**
  - lista los impactos que ocurrieron, con su instante y sus vehículos;
  - dice, con los nombres del expediente (V1, V2…), cuál impacto posterior no ocurre.
- **El mapa** marca X1, X2… donde ocurrió cada impacto.
- **La línea de tiempo** los numera («Impacto 1», «Impacto 2»).
- **El 3D:**
  - **Morph targets:** hornea uno por impacto, y cada uno se anima desde el instante de su impacto.
  - **Primer impacto del vehículo:** las bolsas de aire y el parabrisas se animan desde ahí, aunque no sea en t = 0.

## Medición

- **E-R6:** `eval/cesvi_r6_carambolas.mts medir` → `eval/results/cesvi_r6_carambolas.json`.
- **Qué mide:** los 105 expedientes del corpus con 3 o más vehículos, reconstruidos con el solver TS de producción como «Caso nuevo».
- **Sus entradas:** los impactos y las zonas importados del dictamen, sin posiciones del perito.
- **Resultados (2026-10-22):**
  - **Expedientes:** 105, por número de vehículos: 77 con 3, 18 con 4, 5 con 5, 1 con 6, 3 con 7 y 1 con 8.
  - **Escenas válidas, reconstruidas con todos sus vehículos y en 3D** (resultado y escena del visor válidos contra el contrato): 105 de 105.
  - **Impactos posteriores:** 69 expedientes llevan alguno a la escena, 88 en total.
    - **Ocurren:** 7, sin las posiciones del perito.
    - **Los otros 81:** el perito ve que no ocurren. Con la disposición genérica, los vehículos no se encuentran.
  - **Tiempo por escena** (solver completo con Monte Carlo e inversión, en la laptop de desarrollo): mediana de 7,314 ms y máximo de 34,371 ms.

## Límites

- **Solo entre vehículos:** un impacto posterior contra un objeto fijo o una persona no se calcula; se dice como límite.
- **Sin posiciones del perito,** la disposición de los vehículos es la genérica (supuesto), y casi ningún impacto posterior ocurre. La reconstrucción de una carambola necesita que el perito los coloque.
- **El vehículo que espera,** empieza detenido. Si en realidad venía en movimiento, el supuesto no lo representa (la inversión solo ajusta su velocidad).
- **El contorno de un vehículo con daño en dos caras** solo hunde la del primer impacto.
- **La pintura dañada** aparece desde el primer impacto del vehículo, aunque la segunda zona se deforme después.
- **No hay debris** en el punto del segundo impacto.
- **Rendimiento:** la integración conjunta revisa cada par de vehículos en cada paso de 2 ms. En E-R6, una escena con Monte Carlo e inversión tardó hasta 34 s en la laptop de desarrollo (8 vehículos).

## Consecuencias

- **R4** puede evaluar los dictámenes con más de un impacto.
- **E7 y E8** cambian con el resultado 1.9.0 y se regeneran a mano.
- **El visor** carga cualquier resultado 1.9.0. Uno sin `danos_posteriores` se ve igual que antes.
