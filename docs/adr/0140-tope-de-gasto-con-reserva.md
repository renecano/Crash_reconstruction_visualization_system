# ADR 0140 · Tanda 4 · El tope de gasto de Claude es un tope de verdad

- **Estado:** aceptado (2026-11-15)
- **Fecha:** 2026-11-15
- **Frente:** W (rutas de `/api`, `packages/extraction`, `packages/cesvi`)
- **Relacionados:** auditoría del 2026-11-15 (hallazgo I1, punto 14 del plan), ADR 0133 (redacción en las rutas de CESVI), `PLAN.md` §16.4 (tope diario)

## Contexto

El tope de gasto diario de la API de Claude era blando. Cada ruta revisaba lo gastado, llamaba y cobraba al final, sin apartar nada: varias peticiones a la vez pasaban juntas la revisión. Una llamada que la API cobraba pero que no servía (negativa, respuesta truncada en `max_tokens`, JSON inválido) no se cobraba al tope. El día cortaba a la medianoche de UTC, las 18:00 del centro de México. Las rutas aceptaban cualquier `Content-Type` y cualquier origen, y compartían un solo límite de 20 peticiones por hora entre todas.

## Decisión

1. **Reserva antes de llamar** (`conReserva`, `packages/extraction/src/server/budget.ts`). Antes de cada llamada se suma al gasto del día lo más que puede costar; si con eso se pasa del tope, se devuelve y la lectura se niega. Al terminar se deja cobrado lo que costó. Lo usan los seis puntos que llaman a Claude: el relato, la escena, la declaración, las dos lecturas de importar (cada una por separado), el hecho y las consideraciones.
2. **La reserva es una cota, no una estimación** (`costoMaximoUsd`). Entrada: los bytes de lo que se manda (un token ocupa al menos un byte), al precio más caro de entrada, más un margen de 1,000 tokens por lo que la API agrega. Salida: `max_tokens` completo. No se cuenta con la API de conteo: agregaría una llamada de red antes de cada lectura y la salida, que es la parte grande de la reserva, no cambiaría.
3. **Lo que se pagó se cobra aunque no sirva.** El error de una negativa, de una respuesta truncada o de un JSON inválido lleva su costo (`LLMError.costoUsd`) y queda cobrado. Si la llamada falla sin costo conocido (la red, un error de la API), la reserva se devuelve.
4. **El día corta a la medianoche del centro de México** (`America/Mexico_City`).
5. **Las rutas que gastan revisan la petición** (`rechazoDePedido`, `apps/web/src/server/pedido.ts`): `Content-Type: application/json` (415 si no) y, si el navegador manda `Origin` o `Sec-Fetch-Site`, que sea del propio sitio (403 si no).
6. **Un límite por hora por ruta**, cada una con su cuenta; importar tiene la mitad del límite configurado.
7. **Importar acepta hasta 100,000 caracteres** (antes 200,000). Los 671 reportes de CESVI caben: el más largo tiene 77,430.

## Consecuencias

- **El gasto real ya no pasa del tope por peticiones simultáneas.** Queda un caso: si el respaldo del servidor atiende con un modelo más caro que el pedido, el cobro real puede pasar de la reserva de esa llamada.
- **Una lectura se niega antes de que el tope se agote**, cuando lo que queda no cubre su reserva. Medido (`eval/reserva_tope.mts` → `eval/results/reserva_tope.json`, con el modelo por omisión): importar un reporte reserva 0.77 USD de mediana y 1.09 USD el más largo de los 671; una narración del tamaño máximo, 0.37 USD. El tope diario tiene que dejar ese margen por encima del gasto esperado; decidirlo es de René (variable `CROQUIS_LLM_DAILY_BUDGET_USD` en Vercel).
- **La revisión de origen no detiene a un programa** que arme sus propios encabezados. Impide que otra página gaste el tope desde el navegador de quien la visita; de lo demás se encargan el tope y el límite por hora.
- **El límite por hora sigue siendo por IP.** Varios peritos detrás de la misma salida a internet comparten la cuenta de cada ruta.

## Lo que no se hizo

- La referencia en Python (`extraction/croquis_extraction`) sigue cobrando al final. No corre en producción: se usa en la laptop para grabar respuestas.
- `/api/cesvi/hecho` y `/api/cesvi/consideraciones` no las llama ninguna pantalla. Quedan con las mismas protecciones; retirarlas es una decisión aparte.
