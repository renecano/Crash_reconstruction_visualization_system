# ADR 0060 — Narración sin conclusiones y conclusiones de CESVI por dictamen (R0)

- **Estado:** aceptado (2026-10-21).
- **Contexto:** R0 de `docs/cesvi/PLAN-CESVI.md` (plan v2). Para evaluar si Croquis reconstruye lo que CESVI ya analizó (E-R4), a Croquis se le da solo la narración de los hechos, sin conclusiones, y se compara con lo que concluyó CESVI. El corpus de C0 (ADR 0058) no traía ninguno de los dos campos.

## Decisión

- **Una segunda lectura de cada dictamen con Claude Sonnet 5.5,** salida estructurada, el sistema en caché y la API de lotes; la misma infraestructura de C0 (`pedidoLectura` en `server/corpus.ts`).
- **La narración** (`descripcion`) es la que haría el perito antes de analizar el hecho:
  - **Va:** el lugar; los vehículos como «vehículo A», «vehículo B»…; los daños con su zona, altura, dirección, tipo y medidas; las evidencias del lugar.
  - **No va:** velocidades ni energías calculadas, métodos, la modalidad ni la dinámica concluidas, si los daños corresponden, ni la declaración de los conductores.
- **La revisión de fuga** (`fugas`) es automática y nombra lo que saltó:
  - cifras de velocidad (km/h, m/s);
  - cifras de energía (J, kJ, julios);
  - métodos (McHenry, EBS, cantidad de movimiento);
  - frases de conclusión («se concluye», «se determina»), de correspondencia («corresponde», «se sostiene») o de declaración;
  - «modalidad de».

  Una narración con fuga no se usa en E-R4 hasta releerla.

- **Lo que concluyó CESVI** (`conclusiones`): modalidad, zonas de contacto por vehículo, secuencia de impactos, velocidades calculadas y posiciones finales.
  - **Cada dato lleva una cita**, que Croquis busca en el texto.
  - **Cada velocidad debe estar escrita en su cita,** y Croquis la pasa a km/h.
  - **Lo que no pasa la revisión se descarta y se cuenta.**
- **Datos personales:** la narración y las citas se redactan con `redactar` (ADR 0058) antes de versionarse.
- **Caché local:** `data/raw/cesvi/narracion-cache/`, fuera de git.
- **En el repositorio:** `data/cesvi/corpus/narraciones.jsonl` y la medición `eval/results/cesvi_narraciones.json`.

## Consecuencias

- **E-R4 tiene entrada y referencia para los 205 dictámenes de la prueba congelada,** y R1 tiene narraciones de desarrollo para probar la escena.
- **Las cifras del resultado** (fugas, citas, costo) quedan en `eval/results/cesvi_narraciones.json` y en PROGRESS.
