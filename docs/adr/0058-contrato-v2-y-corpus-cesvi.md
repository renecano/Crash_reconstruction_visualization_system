# ADR 0058 — Contrato v2 (expediente de CESVI) y corpus estructurado de los dictámenes

- **Estado:** aceptado (2026-10-21).
- **Contexto:** C0 de `docs/cesvi/PLAN-CESVI.md`. El plan pide ampliar el contrato con el expediente (§4) y convertir los 671 dictámenes de CESVI en registros estructurados (§3), validados contra el esquema, con una partición de prueba congelada y las etiquetas de la conclusión revisadas en una muestra.

## Decisión

### Contrato 2.0.0

- **`escena.schema.json` agrega `expediente`, opcional.** Lleva `$defs/Expediente`: caso, vehículos 1..N, daños (zona en el diagrama estándar, altura mínima y máxima, dirección, magnitud con C1–C6 y L, intercambio de material, daño previo, fotos), impactos 1..M con orden, versiones (la de la evidencia y una por declaración, con posiciones por fase), evidencias del lugar, cálculos, criterios y resultado.
- **Fuente por dato:** perito, conductor, expediente, dictamen importado, supuesto o mapa (`FuenteExpediente`), con su cita cuando aplica.
- **Por qué es mayor (2.0.0) y no menor:** la regla de versiones del contrato aceptaría 1.4.0 para un campo opcional. Aun así, el plan nombra el expediente «contrato v2», y la escena deja de ser solo la del relato.
  - **La migración 1.3.0 → 2.0.0 es la identidad**, en TS y en Python.
  - **Una escena guardada en 1.x** se migra antes de validarla (`escena-propia.ts`).
- **Relatos-MX conserva sus escenas en 1.3.0.** El test congelado no se modifica (CLAUDE.md). `relatos_mx.py` las construye con `VERSION_CONGELADA` y las valida ya migradas.
- **Validador semántico del expediente** (`check-expediente.ts` y `check.py`, X001–X009), con casos de paridad en `fixtures/semantic/cases.json`:
  - vehículo repetido o inexistente;
  - orden de impactos repetido o fuera de 1..M;
  - impacto sin dos participantes (dos vehículos, o uno y un objeto fijo);
  - más de una versión de la evidencia, o una versión declarada sin declarante;
  - altura mínima mayor que la máxima;
  - tercio que no corresponde a la cara;
  - McHenry con un número de medidas C distinto de 2, 4 o 6 (advertencia).
- **`expedienteErrors`** valida un expediente suelto contra `$defs/Expediente`, como lo usa el corpus.

### Corpus

- **Lectura con Claude Sonnet 5.5** (salida estructurada, `effort: medium`). El sistema (reglas y glosario de los 671 dictámenes) va en caché.
- **La salida es una lista plana de filas:** sección, n, vehículo, campo, valor y cita.
  - **Medido:** un esquema con una estructura por sección pasó el límite de gramática de la API («compiled grammar is too large»), aun sin enumeraciones ni uniones.
  - **Sondeo:** cada sección sola cabía, pero todas juntas no. Quitar campos sueltos o convertir los arreglos anidados en texto no bastó.
  - **La lista plana cabe** (817 tokens de esquema) sin importar cuántas secciones tenga.
  - **Croquis revisa los valores cerrados** contra las enumeraciones del contrato (`VALORES`): el valor que no está en su lista se descarta y se cuenta.
- **Lo que Croquis revisa al volver** (`expedienteDeSalida`):
  - **Citas:** cada una debe estar en el dictamen (sin distinguir acentos, mayúsculas ni espacios).
  - **Números:** cada uno debe estar escrito en una cita encontrada de su grupo. El modelo los copia como texto, tal como están escritos, y Croquis los lee (coma de miles o decimal).
  - **Conversiones:** C y L de cm a m, y la altura de m a cm, las hace el código.
  - **Datos personales:** las citas y los textos libres se redactan con el módulo de `@croquis/extraction`.
    - Un «nombre» justo después de «marca» es la marca del vehículo («Mercedes Benz»), y se conserva.
    - La marca y el modelo no se redactan.
  - **Vehículos solo referidos:** un vehículo que solo aparece en un impacto o un cálculo se agrega sin datos. No es un dato inventado: el dictamen lo menciona.
- **Ids de los registros:** `cesvi-` más 10 caracteres del SHA-256 del nombre del archivo. El nombre no se guarda en el repositorio.
- **Caché local:** `data/raw/cesvi/corpus-cache/`, fuera de git, porque guarda las citas sin redactar. En el repositorio quedan:
  - `data/cesvi/corpus/expedientes.jsonl`, con citas redactadas;
  - `data/cesvi/corpus/particion.json`;
  - `eval/results/cesvi_corpus_extraccion.json`.
- **Partición:**
  - **Prueba:** 30 %, estratificada por modalidad principal y conclusión, con semilla 20261021. Dentro de cada estrato se ordena por el SHA-256 de `semilla:id`.
  - **Se congela** la primera vez que el corpus está completo. La huella va en el archivo, y el script no la reescribe.
- **Costo:**
  - **Piloto de 5 dictámenes** con la API normal: 0.26 USD.
  - **Los 666 restantes** van con la API de lotes (mitad de precio). El estimado de 18.29 USD sale de la razón salida/entrada del piloto y del conteo de tokens de entrada (7 948 773, gratis); está por debajo del tope de 30 USD que puso René.
  - **El costo real** queda en el resultado y en PROGRESS.

## Consecuencias

- **Pruebas en CI:**
  - **`packages/cesvi/src/corpus.test.ts`:** esquema, números escritos, descartes, conversión, redacción, partición. Corren sin la API.
  - **Paridad TS/Python** del validador del expediente.
- **Reproducir el corpus** necesita los lotes crudos y la llave. Los comandos están en el encabezado de `data/cesvi/scripts/corpus.mts`.
