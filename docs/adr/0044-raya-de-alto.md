# ADR 0044 — Raya de alto en los accesos con semáforo o alto (pendiente del ADR 0042, F11)

- **Estado:** aceptado (2026-10-19). Cierra el pendiente de la raya de alto que dejó el ADR 0042.
- **Contexto:**
  - **El hueco:** la NOM-034-SCT2/SEDATU-2022 pide la raya de alto (M-6) con una señal de alto o un semáforo, y Croquis no la dibujaba.
  - **Lo que había que decidir:** qué accesos controla cada dispositivo, porque un dispositivo tiene posición pero no dice a qué acceso aplica.
  - **Lo que ya traía el contrato:** a qué vehículos aplica cada dispositivo, en `aplica_a` y en `fases[].movimiento`.

## Lo que dice la norma (5.8)

- **Medidas:** continua, blanca, de 60 cm de ancho, y cruza todos los carriles del mismo sentido.
- **Con paso peatonal:** se coloca 1.20 m antes de él.
- **Sin paso:** va «en el lugar preciso en el que se deban detener los vehículos», a no menos de 1.20 m ni a más de 5 m de la orilla de la vía que se cruza.

## Decisión

1. **Una sola geometría para el croquis y el visor:** `markings.ts` en `@croquis/croquis-2d`.
   - **Qué reúne:** el paso peatonal (movido del visor, sin cambios) y la raya de alto.
   - **Cómo la usan:** el visor la dibuja en la malla de rayas blancas y el croquis como un rectángulo blanco. Los dos la ponen en el mismo lugar, como las rayas de OSM (ADR 0041).
2. **Qué accesos (`controlledVehicles`):**
   - **Con flujo declarado:** los de los vehículos de `aplica_a` y de las fases.
   - **Semáforo sin flujo declarado:** controla el cruce, así que aplica a todos los vehículos.
   - **Alto sin flujo declarado:** aplica al vehículo más cercano a la señal.
3. **Dónde (`stopLines`):**
   - **Cómo se encuentra el cruce:** se avanza desde la posición inicial del vehículo, en su rumbo, hasta la calzada de la calle que cruza. En las plantillas es otra franja o una glorieta; en el mapa, otra calle con más de 30° (`mapCrossings`).
   - **Posición:** la raya queda a 1.20 m de esa orilla, el mínimo de la norma, o a 1.20 m antes del paso peatonal si lo hay en el camino.
   - **A lo ancho:** los carriles del sentido del vehículo. En doble sentido es la mitad derecha, del camellón a la orilla; en un sentido, todo el ancho de su calzada. En el mapa, solo la calzada por la que llega, no la paralela de una avenida de dos cuerpos.
4. **Sin cruce no se dibuja:**
   - **Por qué:** en una recta no hay vía que se cruce, y la posición del dispositivo es un supuesto de acomodo.
   - **El ejemplo de `alcance`:** el semáforo está 12 m adelante de la camioneta que, según el relato, «se detuvo en el semáforo». Alinear la raya con el poste contradiría la escena. Queda como límite.
5. **Costo:** son unos cuantos rectángulos en la malla de rayas blancas, sin llamadas de dibujo nuevas. En el croquis se calculan con cada edición confirmada, no durante el arrastre.

## Efectos

- **Escenas canónicas con raya:** `lateral_interseccion` (dos accesos de un sentido) e `interseccion_toluca` (dos calzadas del mapa).
- **Escenas sin raya:** `alcance` es una recta. Ninguna otra escena tiene semáforo o alto.
- **Referencias visuales:** cambian las de esas dos escenas. Se regeneran en CI (Linux) y se revisan antes de versionarlas.

## Pruebas

- **`markings.test.ts`:**
  - posición y ancho en `lateral_interseccion`, calculados a mano;
  - ninguna raya en una recta;
  - en el mapa, el ancho de una calzada;
  - el paso peatonal tiene precedencia, y en doble sentido la raya va en la mitad derecha;
  - un alto sin `aplica_a` aplica al vehículo más cercano;
  - **propiedad (fast-check, semilla 44, 100 casos):** la raya queda fuera de la calle que se cruza y dentro de la suya.
- **Visor:** las rayas de alto suman 0.6 m por su largo a la malla blanca.
- **Croquis:** dos rayas en `lateral_interseccion` y ninguna en `alcance`.
