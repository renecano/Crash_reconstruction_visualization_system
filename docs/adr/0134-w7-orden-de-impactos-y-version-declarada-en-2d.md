# ADR 0134 — W7: orden de impactos a mano y versión declarada en el croquis 2D

- **Fecha:** 2026-11-11
- **Estado:** aceptada
- **Contexto:** El plan v4 (§3.4, W7) cierra tres pendientes que un perito sí nota: T6.2, la versión declarada del conductor solo se veía en el 3D y en la tabla; T6.3, en una carambola no se podía declarar a mano el orden de los impactos; T6.4, los agentes (las hipótesis de los conductores) no respetaban ese orden. T6.4 estaba a medias en `fix/agentes-orden-impactos`, sin pruebas.

## Decisiones

1. **T6.4 · Los agentes no buscan antes del primer impacto el contacto de los pares que el hecho narra después.** En una fila detenida, C queda colocado tocando a B: sin la regla, el «primer contacto» de los agentes era el de B con C, antes del alcance y entre dos vehículos detenidos. Un par que el hecho no narra sí se busca: una hipótesis puede crear un contacto nuevo. Cuando la regla aplica, se dice en los supuestos. Python y TS con paridad; escena nueva `agentes/carambola_orden`.
2. **T6.3 · El solver no fuerza el orden de los impactos posteriores; avisa si sale otro.** Cada impacto ocurre cuando sus contornos se tocan: hacer que un par «se atraviese» hasta que le toque sería inventar física. Si el orden reconstruido no es el declarado, el aviso `orden_impactos_distinto` trae los dos órdenes, con los vehículos por su letra. Declarar otro orden no cambia las posiciones finales. Escena de paridad `c1/carambola_cuatro` (`eval/w7_fixtures.py`).
3. **T6.3 · La pregunta del orden se hace solo si la narración no lo dice.** `ordenNarrado` busca palabras de secuencia («primero», «después», «luego») o de consecuencia («a su vez», «lo proyectó», «por el impacto»). Sin ninguna, en una carambola de dos o tres impactos entre vehículos, Croquis pregunta «¿Cuál fue?» con las formas de ordenarlos; la primera es el orden leído. Con cuatro o más impactos no se pregunta (serían 24 opciones o más): queda el orden leído.
4. **T6.3 · Sin cambio de contrato.** El expediente es estricto y no tiene dónde marcar «orden declarado». El orden declarado se guarda en lo que ya existe: cada impacto conserva sus vehículos, zonas, punto en el mapa y cita, cambia de `orden` y queda con fuente `perito`. La pregunta, ya contestada (o con «No sé», que deja el orden leído), se quita de la lista de preguntas que se guarda con el caso (`sinPregunta`).
5. **T6.3 · Los choques contra objetos (C1) no se reordenan:** conservan su lugar entre los impactos.
6. **T6.2 · La versión declarada va en los dos croquis 2D.** En la maqueta, el camino y la silueta de cada vehículo en esa versión, punteados sobre la reconstrucción, con su nombre y una línea en la leyenda. En el croquis del mapa, un marcador hueco y punteado por vehículo. Las dos versiones se alinean por su impacto, y lo que coincide (menos de 0.5 m) no se dibuja dos veces. Sigue siendo un complemento opcional, sin culpas: el texto dice «versión declarada (V2)» y nada más.

## Consecuencias

- Pruebas unitarias: `solver/tests/test_agents.py` y `test_orden_impactos.py`; `packages/solver-ts/src/agents.test.ts` y `orden-impactos.test.ts`; `packages/cesvi/src/orden-impactos.test.ts` y `declarada-croquis.test.ts`; `apps/web/src/lib/maqueta.test.ts`.
- e2e: `apps/web/e2e/orden-impactos.spec.ts` (sin `@flujo`) y una comprobación de la maqueta en el flujo principal (`cesvi-caso.spec.ts`).
- Al regenerar las escenas de agentes (`croquis-solver agent-fixtures`), `axa_agentes.json` cambia: sus velocidades salen de la inversión de AXA, que cambió después de escribirla. No es de W7 y no se tocó; queda anotado en «Endurecimiento pendiente».
