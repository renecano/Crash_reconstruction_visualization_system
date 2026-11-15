# ADR 0133 — Datos personales fuera de las rutas de `/api/cesvi`

- **Fecha:** 2026-11-10
- **Estado:** aceptada
- **Contexto:** `/api/relato` redacta el relato antes de mandarlo a Claude (PLAN §5.1 y §10), pero las cinco rutas de `/api/cesvi` (`escena`, `hecho`, `importar`, `declaracion` y `consideraciones`) mandaban el texto del perito tal cual. Un reporte o una narración puede traer nombres, placas, teléfonos, VIN, folios, pólizas y números de siniestro. René pidió (2026-11-10) redactarlos con el mismo `redact()` de `/relato`, que las citas sigan pasando la revisión literal contra el texto redactado y que las lecturas grabadas sigan siendo válidas.

## Decisiones

1. **Las cinco rutas redactan en el servidor antes de llamar a Claude** (`apps/web/src/lib/redaccion.ts`): el texto, las citas rechazadas de la relectura, la descripción de los vehículos (puede traer la placa) y cada texto de los hechos de las consideraciones, salvo el número de caso.
2. **`redact()` suma cuatro tipos:** `VIN` (17 caracteres sin I, O ni Q, con letras y dígitos, o el valor tras «VIN», «NIV» o «serie»), `FOLIO`, `POLIZA` y `SINIESTRO` (el valor con al menos un dígito tras la palabra, con «número», «no.» o «de» de por medio). Están en `packages/extraction/data/pii.json` (versión 1.2.0), que comparten Python y TS; el golden de paridad lleva casos de los cuatro. Van antes que el teléfono y el número de domicilio: si empatan, gana el tipo con pista. «El siniestro» sin número no se toca.
3. **Las citas se revisan contra el texto que vio Claude.** `redact()` es determinista e idempotente: el navegador redacta igual (`textoParaClaude`) antes de revisar las citas de la escena, de la declaración y del reporte importado. Tras leer la narración, la del caso queda redactada: el perito ve exactamente lo que se mandó, y las citas se ubican en ella. Los casos guardados antes no cambian.
4. **Las lecturas grabadas siguen valiendo sin regrabarlas:** ninguno de sus textos de origen (las diez escenas, la carambola, la declaración, el hecho A2010930, los seis relatos de W2 y el reporte importado) cambia al redactarlo, y el corpus Relatos-MX tampoco (`pipeline.golden.json` queda igual).

## Consecuencias

- Prueba: `apps/web/src/lib/redaccion.test.ts` manda a cada ruta un texto con nombre y placa con un doble del cliente de Anthropic, y revisa que ninguna petición los lleve.
- La redacción por reglas no es perfecta (por ejemplo, un nombre sin pista ni mayúscula que no está en la lista): es la misma cobertura que ya tiene `/relato`.

## Addendum (2026-11-15): las cifras de la narración se conservan

La auditoría del 2026-11-15 (C1) encontró que el patrón de placa escrita con espacios borraba cifras: «con 1450 kg» salía «[PLACA] kg», y «del 2010», «[PLACA]».

- **Decisión:** `redact()` acepta la opción `conservarCifras` (`conservar_cifras` en Python). Con ella, una coincidencia del patrón de placa no se borra si una de sus partes separadas por espacio es una palabra común de `palabras_no_placa` (`pii.json`), si es un año tras un mes, «modelo» o «año», o si es un modelo con forma de placa («Ram 2500»).
- **Para no dejar pasar placas:** la palabra en mayúsculas dentro de un texto en minúsculas sigue contando como placa («otra CON 1450»); con guion o pegada también; y lo que viene tras «placa» o «placas» va por su propio patrón.
- **Quién la usa:** `textoParaClaude` (las cinco rutas de `/api/cesvi` y la revisión de citas en el navegador) y `redactar` del corpus. `/api/relato` y Relatos-MX no: sus grabaciones se indexan por el texto redactado, y por eso la versión de `pii.json` no cambia.
- **Medido:** `eval/results/redactor_cifras.json`. Las placas anotadas a mano en Relatos-MX se borran igual con la opción y sin ella.
