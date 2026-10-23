# ADR 0075 — El caso guardado con la validación del perito

- **Estado:** aceptado (2026-10-23). Resuelve el límite de ADR 0072 («la validación no se guarda: vive en la página»).
- **Contexto:** René (2026-10-23) puso como segunda prioridad después de R9 que la validación del perito se guarde con el caso. «Caso nuevo» solo descargaba la escena en JSON y no la volvía a abrir; la validación se perdía al cerrar la página.

## Decisión

- **Un archivo de caso** (`apps/web/src/lib/caso-guardado.ts`, formato `croquis-caso` versión 1). «Guardar el caso» descarga `caso-croquis.json` con:
  - la narración;
  - la escena leída (posiciones descritas, preguntas, conteos);
  - el expediente con lo que marcó el perito;
  - la conclusión del perito.
- **La validación va en los campos que el contrato ya tenía:** `resultado.validado_por`, `fecha_validacion` y `huella_entradas`.
  - **El contrato no cambia** (sigue en 2.0.0). Cambiar su versión reescribiría los datos congelados de Relatos-MX.
  - La conclusión en texto libre no tiene campo en el contrato (`resultado.conclusion` es el veredicto sobre una versión declarada), así que va junto al expediente, en `conclusion_perito`.
- **La validación se ata a sus entradas:**
  - **la huella** se calcula sobre la narración y el expediente sin su resultado (`huellaDelCaso`);
  - **si el perito cambia la narración o lo que marcó después de validar,** la validación ya no vale: el dictamen dice de quién era, sale como borrador y no se guarda con el caso.
- **«Abrir un caso guardado»** (en Trabajar) devuelve:
  - la narración, la escena, las posiciones y la validación;
  - el expediente se revisa contra el contrato antes de abrirlo;
  - para descargar el dictamen se reconstruye de nuevo (el solver es determinista).
- **La validación vive en «Caso nuevo»,** no en el panel del dictamen, para poder guardarla y restaurarla.
- **El archivo se queda en el equipo del perito:** no hay base de datos ni cuentas. Lo guarda donde guarda sus expedientes.

## Pruebas

- **Unitarias (4):**
  - la validación queda en los campos del contrato y el expediente sigue siendo válido;
  - ida y vuelta completa;
  - cambiar las entradas invalida la validación y ya no se guarda;
  - un archivo ajeno o con un expediente inválido se rechaza con su motivo.
- **e2e `@flujo` de «Caso nuevo»:**
  1. valida y guarda el caso;
  2. comprueba `validado_por` y la conclusión en el archivo;
  3. lo vuelve a abrir en otra visita, con la narración, las 4 posiciones y «Validó Perito de prueba».

## Límites

- **Lo de al lado no se guarda.** Un reporte importado (R5) se guarda como un caso más, sin lo que concluyó CESVI que se muestra al lado.
- **La declaración del conductor (R7)** tampoco se guarda en el caso.
