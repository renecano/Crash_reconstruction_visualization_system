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
