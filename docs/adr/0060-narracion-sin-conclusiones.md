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

### La revisión de fuga, corregida contra lo que marcó

- **La primera versión marcó 48 de 671 narraciones,** y se revisaron una por una. La mayoría eran falsos positivos:
  - límites de velocidad de los señalamientos del lugar («restrictivo de 40 km/h», «velocidad máxima de 80 km/h»);
  - «corresponde a» con el sentido de «es» («el lugar corresponde a una curva»);
  - «se sostiene por la estructura»;
  - narraciones que dicen que el texto del dictamen solo trae «el apartado de conclusiones».
- **Desde entonces:**
  - **Velocidad:** una cifra no cuenta si un límite señalado va justo antes o después.
  - **Correspondencia:** solo cuenta «no corresponde», «corresponde (en …) con», «en correspondencia», «son consistentes» o «la versión… se sostiene».
  - **Dictámenes sin hechos:** los que solo traen conclusiones se marcan aparte (`solo_conclusiones`), porque no tienen hechos que narrar. No son fuga.
- **Las pruebas unitarias cubren los dos lados:** lo que se dejó de marcar y lo que se sigue marcando.

### Resultado (`eval/results/cesvi_narraciones.json`)

- **Leídos:** 671 de 671.
- **Costo:** 10.2705 USD, del que el lote de 666 fue 10.1293 USD; el estimado previo era de 11.06 USD.
- **Narraciones con fuga: 3,** todas de desarrollo:
  - una lectura del velocímetro;
  - una correspondencia de color;
  - un «no corresponde a un hecho de tránsito».
- **Narraciones de dictámenes que solo traen conclusiones:** 4.
- **Narraciones limpias:** 664.
- **Prueba congelada (205):**
  - **Descripción:** 205 limpias.
  - **Conclusiones:** 193 tienen al menos modalidad, zonas de contacto o secuencia. De las 12 que no:
    - 8 son dictámenes que no concluyen ninguna (informes de valoración, un encabezado sin contenido, o dictámenes que solo dicen que la versión no se sostiene);
    - en 4 las citas no se pueden verificar porque el OCR revolvió las columnas del texto.
- **Citas fuera del texto:** 90 de 2 513, descartadas.
- **Velocidades:** 10 de 97 descartadas, porque su número no está en su cita.
- **Datos personales tras redactar:** 0.

## Consecuencias

- **E-R4 tiene entrada y referencia para los 205 dictámenes de la prueba congelada,** y R1 tiene narraciones de desarrollo para probar la escena.
- **Las cifras del resultado** (fugas, citas, costo) quedan en `eval/results/cesvi_narraciones.json` y en PROGRESS.
