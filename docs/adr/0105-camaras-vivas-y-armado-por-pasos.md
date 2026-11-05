# ADR 0105 — Cámaras tras el #161 y armado del grafo por pasos

- Fecha: 2026-11-04
- Estado: aceptado
- Origen: René, 2026-11-04, MacBook M1 tras el #161 (WebGPU, media, dpr 1.5, 60 fps, precompilado
  listo: el congelamiento quedó resuelto, pero las cámaras fallaron).

## Contexto

René reportó cinco cosas:

1. «Conductor A» y «Conductor B» no se ponían en los ojos del conductor (en AXA se veía la pickup
   desde afuera y arriba; en lateral_interseccion, desde atrás, con la línea verde flotando).
2. A veces el botón de cámara se marcaba y la vista no cambiaba.
3. En la cinematográfica de lateral_interseccion el poste del semáforo tapaba el impacto.
4. En la cámara del conductor la línea de visión se veía como una raya suelta.
5. `?diag=1` mostraba tareas largas «sin marca» de 337 ms (AXA) y 194 ms (el cruce).

Causas:

1–2. La «cámara viva» del #161 (el botón escribe la cámara en una referencia que el siguiente
cuadro usa sin esperar a React) guardaba el valor del botón tal cual. Para el conductor ese valor es
`conductor-<id>`, que no es un modo de cámara: ninguna rama de la pose lo atendía, la cámara se
quedaba donde estaba, y como la referencia solo se limpiaba cuando coincidía con la propiedad
`camera` («conductor»), se quedaba atascada.

5. Las marcas del diagnóstico se ponían _dentro_ de la tarea (p. ej. «armando el grafo», en el
   `useMemo` del armado) y la causa solo se buscaba _antes_ de la tarea: salían «sin marca». Con la
   marca bien atribuida, las tareas eran el armado del grafo: el provisional (mientras llegan los
   modelos) y el definitivo; dentro, el daño de los vehículos (130–430 ms en la laptop de
   referencia) y el mapa de desgaste de las rayas (200–340 ms). El provisional nunca se muestra (el
   precompilado espera a los modelos desde el #161), así que todo su costo era trabajo tirado.

## Decisión

1. **La cámara viva lleva modo y vehículo** (`CameraChoice`, `cameraFromButton`, `sameCamera` en
   `packages/viewer/src/cameras.ts`, con pruebas). El cuadro resuelve el conductor de la elección
   viva, ajusta el plano cercano y empieza la transición cuando cambia de verdad la elección (modo o
   conductor), no cuando llega la propiedad.
2. **La cinematográfica esquiva obstáculos** (`chooseCinematicAdjust`, `CINEMATIC_ADJUSTS`):
   con el grafo listo se lanza un rayo de la cámara al punto de impacto (a 1 m de altura) un segundo
   antes, en el impacto y un segundo después, contra todo lo que no es piso ni parte de la acción, y
   se elige el menor giro de la órbita (±12° a ±70°) o subida (1.5 o 3 m) que deja la vista
   despejada. Se calcula una vez por escena.
3. **La línea de visión se dibuja solo en la cenital y la libre** (todas las de la escena), con su
   leyenda en pantalla («línea de visión: se veía · algo la tapaba»); nunca en la cámara del
   conductor.
4. **Diagnóstico**: se guardan las últimas 40 marcas; la causa de una tarea larga es la marca
   puesta dentro de ella, si la hay, o la última antes (hasta 4 s). El precompilado marca cada
   objeto. El panel muestra «armado del grafo» con lo que tardó cada parte (`graph.tiempos`).
5. **Armado por pasos**: el grafo provisional va sin vehículos, sin daño y sin desgaste (nunca se
   muestra); el definitivo deja pendientes el desgaste de las rayas y el daño de cada vehículo
   (`diferirDanos`, `graph.aplicarPaso()`), que el visor aplica uno por tarea antes de precompilar;
   restos y personas esperan a que terminen (los restos leen el daño). El mapa de desgaste se
   calcula recorriendo solo los texeles al alcance de cada carril (mismo resultado bit a bit,
   probado contra la versión anterior) y queda en caché para el segundo armado.
6. **Si los modelos no cargan**, el grafo se arma con los paramétricos (antes el precompilado los
   esperaba para siempre).

## Consecuencias

- `apps/web/e2e/camaras.spec.ts` (no bloquea el merge: necesita GPU real) pulsa los seis botones en
  AXA y en lateral_interseccion, con WebGPU y con WebGL, con el reloj en pausa: la pose cambia en
  cada clic, cada botón dibuja su cámara, «Conductor A/B» queda dentro de la cabina de su vehículo y
  ahí no hay línea de visión. Las capturas quedan en `docs/cesvi/t1/camaras/`.
- Tareas largas que quedan al cargar (laptop de referencia, WebGPU; en la M1, la mitad o menos):
  la llegada del HDRI (≈ 210–290 ms: decodificación y prefiltrado), el armado con los modelos
  (≈ 200–380 ms: carrocerías de los modelos y entorno) y el daño de cada vehículo (≈ 110–250 ms).
  Ya tienen nombre en `?diag=1`; partirlas más (el daño por impacto, la carrocería por vehículo)
  queda en «Endurecimiento pendiente».
