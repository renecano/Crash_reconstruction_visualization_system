# ADR 0130 — C1: punto inicial, choques intermedios y puntos de paso

- **Fecha:** 2026-11-09
- **Estado:** aceptada
- **Contexto:** CESVI pidió (C1, plan v4 §1 y §3.4, fase W3) que el perito pueda marcar el punto inicial del choque, los choques intermedios contra objetos y puntos por donde pasó un vehículo, y que la reconstrucción los use. Antes de W3 el contrato ya tenía `vehiculos[].puntos_paso`, pero nadie lo leía salvo el visor; el punto de impacto solo guiaba la geometría del contacto, y un impacto posterior contra un objeto se descartaba con un límite («la reconstrucción no lo calcula»).

## Decisiones

1. **Los puntos de paso entran a la inversión como residuo** (`inversion.py` y `inversion.ts`).
   - Por cada punto: lo que le falta a la trayectoria para tocarlo, en x y en y, entre su `precision_m` (o 1 m, la incertidumbre de una posición medida, si no la trae). Son dos componentes y no una distancia para que el residuo pase por cero sin quiebre.
   - Si trae `t_s`, además la posición del vehículo en ese instante contra el punto.
   - Solo cuentan los declarados (`relato` o `usuario`). Un punto supuesto no es evidencia.
   - Etiqueta de evidencia: `paso:<id del punto>`.
   - `rumbo_deg` del punto de paso no se usa todavía (ver límites).
2. **El punto inicial del choque es evidencia medida solo si lo marcó el perito.**
   - Cuenta el `punto_impacto` del primer evento de impacto cuando su `procedencia.fuente` es `usuario`. Su residuo es la diferencia con el punto de impacto que da la reconstrucción, entre 1 m. Etiqueta: `punto_inicial:<id del evento>`.
   - El `punto_impacto` que sale del relato sigue como antes: guía la geometría, no es una medición. Así ninguna escena existente cambia: los 36 puntos de impacto de los fixtures y de los casos guardados traen `relato` o `default`.
3. **Con esta evidencia también se ajustan los rumbos de llegada** de quien no los tiene declarados (antes solo con posiciones finales), y una escena que solo tiene puntos de paso ya no se salta el ajuste.
4. **La incertidumbre sortea cada punto dentro de su precisión,** después de todo lo que ya se sorteaba: una escena sin C1 conserva la misma secuencia de números al azar, en Python y en TS.
5. **Un choque intermedio contra un objeto ocurre contra el objeto marcado** (`reconstruct.py` y `reconstruct.ts`).
   - Es un evento `impacto_vehiculo_objeto` (o `segundo_impacto`) posterior al primero, con un vehículo y un objeto de `entorno.objetos` entre sus actores.
   - El objeto entra a la integración conjunta de después del impacto (la de las carambolas, ADR 0066) como un cuerpo inmóvil: su caja en planta, sin velocidad y con masa de 10⁹ kg. El impacto ocurre la primera vez que el contorno del vehículo lo toca acercándose, con el mismo impulso de `planar_impact`.
   - Deja su evento con el instante y el punto, y su daño en el vehículo. Toda la energía disipada va al vehículo (el objeto se toma rígido): es una cota superior de su deformación.
   - Si la trayectoria no llega al objeto, sale el aviso `impacto_no_ocurre` con el objeto. Nunca se pierde en silencio.
6. **En el expediente** (`packages/cesvi`): el primer golpe va en `impactos[1].punto`; cada choque intermedio es un impacto con un vehículo, `objeto_fijo` y `punto`; los puntos de paso van en `versiones[evidencia].puntos_paso` (contrato, PR #191).
   - El objeto se coloca donde lo marcó el perito, con medidas típicas declaradas como supuesto; un muro, una barda, una barrera o una guarnición van atravesados al avance desde el primer golpe.
   - El lugar de cada choque intermedio va también como punto de paso de ese vehículo, con precisión de 2 m (medio vehículo): así la inversión lleva la trayectoria hasta ahí.
7. **En la escena fácil,** después de colocar los vehículos, una pregunta a la vez: «¿Dónde fue el primer golpe?», «¿Chocó contra algo más?» y «¿Sabes por dónde pasó?».
   - La pregunta del principio, «¿Dónde fue el choque?», se queda: ubica la escena y propone las posiciones de impacto. La del primer golpe afina el punto del primer contacto y ofrece «Ahí mismo, donde marqué el choque» y «No sé».
   - Ninguna de las tres bloquea «Siguiente»: la lista de lo que falta del lugar no cambió.
   - Una escena que llega completa (un dictamen importado, un caso guardado) no las pregunta sola; quedan en el avance para marcar algo.
8. **Contrato sin cambio de versión.** Las etiquetas nuevas en `resultado.schema.json` y `puntos_paso` en el expediente son aditivos: siguen 2.3.0 y 1.14.0, y ningún fixture existente cambia.

## Evidencia

- **Escena de paridad `fixtures/inversion/lateral_puntos_paso.json`** (sintética; la arma `eval/w3_fixtures.py`): la colisión lateral con dos puntos de paso con hora por vehículo y el punto inicial marcado, tomados de la reconstrucción con 55 y 35 km/h. Arrancando de las velocidades del relato (45 y 40), la referencia de Python estima 55.0 y 35.02 km/h, con todos los residuos de C1 por debajo de 0.01 σ. El port de TS da lo mismo (`puntos-paso.test.ts`).
- **Escena de paridad `fixtures/c1/alcance_muro.json`:** el alcance con un muro marcado en el camino del vehículo golpeado. El choque intermedio ocurre a los 1.374 s contra ese muro, y la reconstrucción de TS coincide con la de Python (`choque-intermedio.test.ts`).
- **Pruebas:** `solver/tests/test_puntos_paso.py` (7), `solver/tests/test_choque_intermedio.py` (4), `packages/cesvi/src/reconstruccion-c1.test.ts` (9), `apps/web/src/lib/escena-facil-c1.test.ts` (11) y la e2e `apps/web/e2e/escena-c1.spec.ts`.

## Límites

- **Un solo punto de paso sin hora fija por dónde pasó, no a qué velocidad.** Con la hora, o con varios puntos, la velocidad queda más determinada; cuánto, lo dice la incertidumbre de la inversión.
- **El `rumbo_deg` de un punto de paso no entra todavía a la inversión.**
- **El objeto de un choque intermedio se toma rígido e inmóvil,** también un poste o un árbol: no se rompe ni cede. Sus medidas son típicas, no medidas en el lugar.
- **El orden de los choques intermedios es el físico:** ocurre primero el que el vehículo toca primero. Si el perito los declaró en otro orden, la reconstrucción no lo fuerza.
- **Las respuestas «No sé» y «No» de las tres preguntas no se guardan con el caso:** lo que sí se guarda es lo marcado, que está en el expediente. Al reabrir un caso guardado a medias, las que no tienen nada marcado se vuelven a preguntar.
