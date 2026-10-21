/**
 * C0 (docs/cesvi/PLAN-CESVI.md §2): qué analizan los dictámenes de CESVI, medido sobre los lotes
 * crudos de `data/raw/cesvi/` por patrones de palabras. Cada métrica cuenta en cuántos dictámenes
 * aparece su patrón (al menos una vez); el patrón va en el resultado para que se pueda revisar.
 *
 * Es una medición por palabras clave: dice si el dictamen *menciona* el tema, no si lo analiza a
 * fondo. Cuando el corpus estructurado exista (C0), las métricas que dependan de la estructura
 * (cuántos vehículos, qué cálculo con qué valores) se miden también desde ahí.
 *
 * Uso: `node eval/cesvi_corpus.mjs` → `eval/results/cesvi_corpus.json`
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CRUDOS = join(RAIZ, "data/raw/cesvi");

/** Sin acentos y en minúsculas. */
const plano = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const documentos = readdirSync(CRUDOS)
  .filter((f) => /^crash_reports_batch_\d+\.md$/.test(f))
  .sort()
  .flatMap((f) => readFileSync(join(CRUDOS, f), "utf8").split("# Document:").slice(1))
  .map(plano);

/** Métricas: [clave, descripción, patrón (sobre texto sin acentos), todas las que deben aparecer]. */
const METRICAS = [
  ["correspondencia", "Analiza la correspondencia de daños", [/correspondencia/]],
  [
    "direccion_del_dano",
    "Describe la dirección de la deformación («de atrás hacia adelante», «dirección de izquierda a derecha»…)",
    [
      /direccion de (adelante|atras|izquierda|derecha|arriba|abajo)|de (adelante|atras) hacia (atras|adelante|delante)|de (izquierda|derecha) (a|hacia) (la )?(derecha|izquierda)/,
    ],
  ],
  [
    "forma_del_dano",
    "Relaciona la forma con el daño o el objeto que lo causó",
    [
      /\bforma\b[^.]{0,60}(dano|deformacion|hundimiento|contacto|objeto|defensa)|(dano|deformacion|hundimiento)[^.]{0,60}\bforma\b|correspondencia de caracteristicas/,
    ],
  ],
  [
    "direccion_y_forma",
    "Describe la dirección y relaciona la forma (las dos de arriba)",
    [
      /direccion de (adelante|atras|izquierda|derecha|arriba|abajo)|de (adelante|atras) hacia (atras|adelante|delante)|de (izquierda|derecha) (a|hacia) (la )?(derecha|izquierda)/,
      /\bforma\b[^.]{0,60}(dano|deformacion|hundimiento|contacto|objeto|defensa)|(dano|deformacion|hundimiento)[^.]{0,60}\bforma\b|correspondencia de caracteristicas/,
    ],
  ],
  [
    "magnitud_del_dano",
    "Relaciona la magnitud con el daño o la deformación",
    [
      /\bmagnitud[^.]{0,80}(dano|deformacion|impacto)|(dano|deformacion|impacto)[^.]{0,80}\bmagnitud/,
    ],
  ],
  [
    "altura_del_dano",
    "Mide o compara la altura de los daños (respecto al piso, en cm)",
    [/altura[^.]{0,80}(piso|suelo|cm\b|centimetros)|(piso|suelo|cm\b|centimetros)[^.]{0,80}altura/],
  ],
  ["intercambio_material", "Menciona el intercambio de material(es)", [/intercambio de material/]],
  [
    "dano_previo_u_oxido",
    "Revisa daño previo u óxido",
    [/dano(s)? previo|danos? anterior|\boxid|corrosion/],
  ],
  ["bolsas_de_aire", "Menciona bolsas de aire", [/bolsas? de aire/]],
  ["fotografias", "Usa fotografías", [/fotografi/]],
  ["calculo_mchenry", "Cálculo de energía por McHenry", [/mchenry/]],
  [
    "calculo_ebs",
    "Velocidad equivalente de barrera (EBS)",
    [/velocidad equivalente de barrera|\bebs\b/],
  ],
  [
    "calculo_cantidad_movimiento",
    "Cantidad de movimiento",
    [/cantidad de movimiento|conservacion del momento/],
  ],
  ["calculo_huellas_frenado", "Huellas de frenado", [/huellas? de frenado/]],
  ["velocidad_en_kmh", "Escribe una velocidad en km/h", [/\d+(?:[.,]\d+)?\s*km\/h/]],
  // La mención de la palabra, sin más: para comparar con las métricas de arriba.
  ["mencion_direccion", "Menciona la palabra «dirección» (cualquier uso)", [/\bdireccion\b/]],
  ["mencion_forma", "Menciona la palabra «forma» (cualquier uso)", [/\bforma\b/]],
  ["mencion_magnitud", "Menciona la palabra «magnitud» (cualquier uso)", [/\bmagnitud/]],
  [
    "mencion_altura",
    "Menciona la palabra «altura» (cualquier uso, incluida «a la altura del km»)",
    [/\baltura/],
  ],
];

const n = documentos.length;
const metricas = METRICAS.map(([clave, descripcion, patrones]) => {
  const dictamenes = documentos.filter((d) => patrones.every((p) => p.test(d))).length;
  return {
    clave,
    descripcion,
    patrones: patrones.map(String),
    dictamenes,
    proporcion: Number((dictamenes / n).toFixed(4)),
  };
});

// Cuántos vehículos describe cada dictamen: las parejas distintas de marca y tipo en los
// encabezados «VEHÍCULO MARCA X, TIPO Y» (un proxy: el corpus estructurado lo medirá con precisión).
const vehiculos = documentos.map(
  (d) =>
    new Set(
      [...d.matchAll(/vehiculo marca ([a-z0-9 .-]{2,30}?),\s*tipo ([a-z0-9 .-]{1,30}?),/g)].map(
        (m) => `${m[1].trim()}|${m[2].trim()}`,
      ),
    ).size,
);
const conTresOMas = vehiculos.filter((v) => v >= 3).length;

const resultado = {
  fecha: new Date().toISOString(),
  corpus: `${n} dictámenes (data/raw/cesvi/, por patrones de palabras; ver cada patrón)`,
  dictamenes: n,
  metricas,
  vehiculos_por_encabezado: {
    descripcion:
      "Dictámenes con 3 o más parejas distintas de marca y tipo en «VEHÍCULO MARCA X, TIPO Y» (proxy de 3 o más vehículos; el corpus estructurado lo medirá con precisión)",
    tres_o_mas: conTresOMas,
    proporcion: Number((conTresOMas / n).toFixed(4)),
    sin_encabezado: vehiculos.filter((v) => v === 0).length,
    distribucion: Object.fromEntries(
      [...new Set(vehiculos)]
        .sort((a, b) => a - b)
        .map((k) => [k, vehiculos.filter((v) => v === k).length]),
    ),
  },
};
writeFileSync(
  join(RAIZ, "eval/results/cesvi_corpus.json"),
  `${JSON.stringify(resultado, null, 2)}\n`,
);
for (const m of metricas) {
  console.log(
    `${m.clave.padEnd(30)} ${String(m.dictamenes).padStart(4)}  ${(m.proporcion * 100).toFixed(1)} %`,
  );
}
console.log(
  `3+ vehículos (proxy)             ${String(conTresOMas).padStart(4)}  ${((conTresOMas / n) * 100).toFixed(1)} %`,
);
