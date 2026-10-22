# ADR 0068 — Cargar un reporte de CESVI (R5)

- **Estado:** aceptado (2026-10-22).
- **Contexto:** R5 de `docs/cesvi/PLAN-CESVI.md` pide cargar un reporte de CESVI en PDF, Markdown o texto. Croquis debe llenar el expediente y la narración con la cita de cada dato, y el perito revisarlo y reconstruirlo. «Reporte» es lo que tiene CESVI; «dictamen» es lo que produce Croquis (glosario de `docs/cesvi/`).

## Decisión

- **`/cesvi/importar`:**
  - **Formatos:** el perito sube un PDF, Markdown o texto.
  - **El texto se saca en su equipo** (`lib/texto-dictamen.ts`): el PDF con pdf.js (`pdfjs-dist`, ya en el proyecto y ahora dependencia de la página), y el Markdown y el texto, tal cual.
  - **El worker de pdf.js** se publica en `public/pdfjs/` en cada build (`scripts/pdfjs-worker.mjs`), como el de MapLibre (ADR 0050).
  - **El archivo no sale del equipo,** y el texto no se guarda.
  - **Un PDF escaneado** (solo imágenes) no trae texto, y la página lo dice.
- **`POST /api/cesvi/importar`** (`leerDictamenImportado`): Claude lee el texto dos veces, en paralelo y con el tope de gasto diario y el límite por hora de siempre.
  - **La lectura de C0** (`corpus-cesvi-v3`): el expediente completo con la cita de cada dato.
  - **La de R0** (`narracion-cesvi-v1`): la narración sin conclusiones y lo que concluyó CESVI.
- **En el navegador** (`importarDictamen`):
  - **Cada cita y cada número** se revisan contra el texto (`expedienteDeSalida`, con fuente «dictamen_importado»). Lo que no está se descarta y se cuenta.
  - **La escena sale igual que en «Caso nuevo»** (`escenaDeConversion`, separada de `escenaDeNarracion`): zonas de contacto, impacto que se puede suponer y preguntas.
- **El perito revisa y reconstruye:**
  - **«Caso nuevo» abre con el expediente importado** (`inicial`): mapa, preguntas, reconstrucción, 3D y verificación CESVI con las medidas del reporte.
  - **Al final:** lo que concluyó CESVI, con sus citas, para comparar.
- **Ejemplo y prueba:**
  - **El reporte del caso A2010930 de AXA**, de desarrollo y redactado. `redactar` y, además, los nombres después de un título («ING. [NOMBRE]»), que `redactar` no reconoce.
  - **Sus dos lecturas grabadas** (0.1206 USD) en `data/cesvi/grabaciones/importar/`.
  - **La e2e** genera el PDF con Chromium, lo sube, saca el texto con pdf.js en el navegador e importa. La verificación CESVI reproduce la EBS de la Tacoma, 63.90 km/h, junto a los 63.15 km/h que concluyó CESVI.

## Medición (E-R5, `eval/cesvi_r5_importar.mts` → `eval/results/cesvi_r5_importar.json`)

- **Cómo se mide:** la importación de la página es la misma lectura que armó el corpus de C0, así que E-R5 mide los 205 reportes de la prueba congelada con esas lecturas, sin API.
- **Listos para reconstruir:** 204 de 205. Los 205 expedientes y las 205 escenas son válidos, con mediana de 340 ms. El que falta no trae vehículos en su lectura.
- **Citas en el texto:** 98.4 % (76 fuera de 4,844, descartadas).
- **Números en su cita:** 94.1 % (54 fuera de 913, descartados).
- **Cobertura por campo:**

  | Campo                   | Cobertura |
  | ----------------------- | --------- |
  | Reportes con daños      | 97.1 %    |
  | Reportes con impactos   | 92.2 %    |
  | Reportes con modalidad  | 97.6 %    |
  | Reportes con cálculos   | 22.9 %    |
  | Vehículos con clase     | 22.4 %    |
  | Vehículos con masa      | 2.4 %     |
  | Vehículos con rigidez   | 0 %       |
  | Daños con medidas C y L | 0 %       |

- **Exactitud de los campos de cálculo:** con los datos que imprimen los reportes de la prueba, el motor de Croquis reproduce 18 de 23 cálculos a 0.5 % o menos (E-C1).

## Límites

- **Las entradas de los cálculos** de CESVI (masas, C y L, rigidez) casi nunca quedan en los campos del vehículo y del daño: en todo el corpus, 1 de 3,312 daños trae C y L (el de AXA) y 31 de 1,326 vehículos su masa. Se quedan en la sección de cálculos.
  - **Consecuencia:** la verificación CESVI y la inversión no las usan.
  - **Pendiente:** pasar las entradas de los cálculos a esos campos.
- **La exactitud contra los PDF originales** (texto sacado de imágenes y fórmulas) espera a que René consiga esos PDF.
- **Un PDF escaneado** necesitaría OCR; no está incluido.

## Consecuencias

- **El perito puede reconstruir un reporte que ya tiene** y compararlo con lo que concluyó CESVI, con el mismo flujo que una narración.
