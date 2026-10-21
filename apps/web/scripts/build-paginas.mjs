/**
 * Datos de las páginas de historia y del recorrido técnico (PLAN §11, F11), generados desde
 * `eval/results/`: las páginas no escriben ningún número a mano (CLAUDE.md, regla 3).
 *
 * Uso: `node scripts/build-paginas.mjs` → `src/data/historia.json` y `src/data/recorrido.json`;
 * con `--check` falla si no están al día (CI).
 *
 * Los textos van en los dos idiomas del sitio como `{ es, en }` (ADR 0045); las cifras son las
 * mismas para los dos.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = resolve(ROOT, "apps/web/src/data");
const REPO = "https://github.com/renecano/Crash_reconstruction_visualization_system/blob/main";

const results = {};
function R(name) {
  results[name] ??= JSON.parse(readFileSync(resolve(ROOT, `eval/results/${name}.json`), "utf-8"));
  return results[name];
}
const src = (name) => ({
  archivo: `eval/results/${name}.json`,
  url: `${REPO}/eval/results/${name}.json`,
});
/** Un texto en los dos idiomas. */
const L = (es, en) => ({ es, en });
/** Nombres de los métodos y referencias, en los dos idiomas (los nombres propios no cambian). */
const NOMBRES = {
  Croquis: "Croquis",
  "Claude Sonnet": "Claude Sonnet",
  "Claude Haiku": "Claude Haiku",
  WinSMASH: "WinSMASH",
  Wood: "Wood",
  Reglas: "Rules",
  "Recta global": "Global line",
  "Regla de Emori": "Emori's rule",
  "Respaldo genérico": "Generic fallback",
  "Searle sola": "Searle alone",
  Uniforme: "Uniform",
  "Lineal simple": "Simple linear",
  "Calidad baja": "Low quality",
  "Calidad media": "Medium quality",
};
const bar = (etiqueta, valor, croquis = false) => {
  if (!(etiqueta in NOMBRES)) throw new Error(`Falta la traducción de ${etiqueta}`);
  return { etiqueta: L(etiqueta, NOMBRES[etiqueta]), valor, croquis };
};
/** Tipos de ATUS (INEGI) en inglés. */
const TIPOS_ATUS = {
  "Colisión con vehículo automotor": "Collision with a motor vehicle",
  "Colisión con motocicleta": "Collision with a motorcycle",
  "Colisión con objeto fijo": "Collision with a fixed object",
  Volcadura: "Rollover",
  "Colisión con peatón (atropellamiento)": "Collision with a pedestrian",
  "Colisión con ciclista": "Collision with a cyclist",
  "Salida del camino": "Run-off-road",
  "Colisión con animal": "Collision with an animal",
  "Colisión con ferrocarril": "Collision with a train",
  "Caída de pasajero": "Passenger fall",
  Incendio: "Fire",
  Otro: "Other",
};
/** Conteo con separador de miles, como en el README (1,316). */
const n = (x) => x.toLocaleString("es-MX");

function historia() {
  const a = R("atus_summary");
  const tipos = a.distribucion_tipo_ultimo_anio.slice(0, 5).map((t) => {
    if (!(t.tipo in TIPOS_ATUS)) throw new Error(`Falta la traducción del tipo de ATUS ${t.tipo}`);
    return {
      tipo: L(t.tipo, TIPOS_ATUS[t.tipo]),
      accidentes: t.accidentes,
      participacion: t.participacion,
    };
  });
  return {
    fuente: {
      ...a.fuente,
      nombre_en:
        `INEGI, Road Traffic Incidents in Urban and Suburban Areas (ATUS), open data ${a.fuente.nombre.match(/\d{4}.\d{4}$/)?.[0] ?? ""}`.trim(),
      nota_en:
        "Records marked 'Certificado cero' (no incidents reported) are excluded. 'Deaths' are people who died at the scene, as ATUS defines them.",
      archivo: src("atus_summary").archivo,
      url_resultado: src("atus_summary").url,
    },
    anio: a.ultimo_anio.anio,
    nacional: {
      accidentes: a.ultimo_anio.accidentes,
      muertos: a.ultimo_anio.muertos,
      heridos: a.ultimo_anio.heridos,
    },
    estado_de_mexico: {
      lugar_por_muertos: a.estado_de_mexico.lugar_por_muertos_ultimo_anio,
      muertos: a.estado_de_mexico.muertos_ultimo_anio,
      accidentes: a.estado_de_mexico.accidentes_ultimo_anio,
    },
    tipos,
    serie: a.serie_anual.map((s) => ({ anio: s.anio, accidentes: s.accidentes })),
  };
}

function e5Tipo(fuente, metrica) {
  const r = R("e5").resumen[fuente];
  const nombres = {
    frontal: L("Frontal", "Frontal"),
    frontal_desplazado: L("Desplazado", "Offset"),
    lateral: L("Lateral", "Side"),
    alcance: L("Alcance", "Rear-end"),
    poste: L("Poste", "Pole"),
  };
  return Object.entries(nombres)
    .filter(([t]) => r[t]?.[metrica]?.croquis)
    .map(([t, nombre]) => ({
      grupo: L(`${nombre.es} (${n(r[t][metrica].n)})`, `${nombre.en} (${n(r[t][metrica].n)})`),
      barras: [
        bar("Croquis", r[t][metrica].croquis.mediana, true),
        bar("Uniforme", r[t][metrica].uniforme.mediana),
        bar("Lineal simple", r[t][metrica].lineal.mediana),
      ],
    }));
}

function recorrido() {
  const e1 = R("e1_extraction_v3").metodos;
  const e1c = R("e1_extraction_ciss_v3").metodos;
  const e2 = R("e2_barrier").global;
  const mdb = R("e2_mdb").zonas;
  const e3 = R("e3_ciss").test.comparacion.todos;
  const e4 = R("e4_pedestrian").resumen;
  const e5 = R("e5").resumen;
  const e6 = R("e6_performance");
  const e7 = R("e7_parity");
  const e8 = R("e8_determinism");
  const cpu = e6.maquina.cpu.replace(/\(R\)|\(TM\)|CPU @.*$/g, "").trim();
  const f1 = (m) => [
    bar("Claude Sonnet", m["claude-sonnet-5-5"].f1_micro, true),
    bar("Claude Haiku", m["claude-haiku-5-5"].f1_micro, true),
    bar("Reglas", m.reglas.f1_micro),
  ];
  return [
    {
      id: "E1",
      titulo: L("La IA entiende el relato", "The AI understands the narrative"),
      pregunta: L(
        "¿Qué tan bien convierte el relato en datos, campo por campo?",
        "How well does it turn the narrative into data, field by field?",
      ),
      graficas: [
        {
          tipo: "barras",
          titulo: L(
            `Test congelado de Relatos-MX (${e1.reglas.relatos} relatos)`,
            `Frozen Relatos-MX test (${e1.reglas.relatos} narratives)`,
          ),
          metrica: L("F1 micro", "F1 micro"),
          mejor: "mayor",
          unidad: "",
          barras: f1(e1),
        },
        {
          tipo: "barras",
          titulo: L(
            `Test CISS: verdad de los campos codificados de NHTSA (${e1c.reglas.relatos} relatos)`,
            `CISS test: ground truth from NHTSA coded fields (${e1c.reglas.relatos} narratives)`,
          ),
          metrica: L("F1 micro", "F1 micro"),
          mejor: "mayor",
          unidad: "",
          barras: f1(e1c),
        },
      ],
      fuentes: [src("e1_extraction_v3"), src("e1_extraction_ciss_v3")],
      nota: L(
        "Los relatos del primer test los escribieron agentes de IA: mide español escrito por un modelo. E9 lo contrastará con personas.",
        "The narratives in the first test were written by AI agents: it measures Spanish written by a model. E9 will contrast it with people.",
      ),
    },
    {
      id: "E2",
      titulo: L("La rigidez de cada clase de vehículo", "The stiffness of each vehicle class"),
      pregunta: L(
        "¿Qué tan bien estima la velocidad a partir del aplastamiento en pruebas de choque reales?",
        "How well does it estimate speed from crush in real crash tests?",
      ),
      graficas: [
        {
          tipo: "barras",
          titulo: L(
            `Barrera frontal rígida, dejar uno fuera (${n(e2.n_evaluadas)} pruebas de NHTSA)`,
            `Rigid frontal barrier, leave one out (${n(e2.n_evaluadas)} NHTSA tests)`,
          ),
          metrica: L("Error absoluto medio", "Mean absolute error"),
          mejor: "menor",
          unidad: "km/h",
          barras: [
            bar("Croquis", e2.mae_velocidad_kmh, true),
            bar("Recta global", e2.linea_base_mae_velocidad_kmh),
            bar("Regla de Emori", e2.emori_mae_velocidad_kmh),
          ],
        },
        {
          tipo: "grupos",
          titulo: L(
            "Barrera móvil y trasera: ΔV de cada prueba con la rigidez de las demás de su clase",
            "Moving and rear barrier: ΔV of each test with the stiffness of the rest of its class",
          ),
          metrica: L("Error absoluto medio", "Mean absolute error"),
          mejor: "menor",
          unidad: "km/h",
          grupos: [
            {
              grupo: L(
                `Lateral (${n(mdb.lateral.global.n_evaluadas)})`,
                `Side (${n(mdb.lateral.global.n_evaluadas)})`,
              ),
              barras: [
                bar("Croquis", mdb.lateral.global.mae_dv_kmh, true),
                bar("Respaldo genérico", mdb.lateral.global.respaldo_mae_dv_kmh),
              ],
            },
            {
              grupo: L(
                `Trasera (${mdb.trasera.global.n_evaluadas})`,
                `Rear (${mdb.trasera.global.n_evaluadas})`,
              ),
              barras: [
                bar("Croquis", mdb.trasera.global.mae_dv_kmh, true),
                bar("Respaldo genérico", mdb.trasera.global.respaldo_mae_dv_kmh),
              ],
            },
          ],
        },
      ],
      fuentes: [src("e2_barrier"), src("e2_mdb")],
      nota: L(
        "La dispersión de rigidez dentro de cada clase domina el error; por eso Croquis reporta rangos.",
        "The spread of stiffness within each class dominates the error; that is why Croquis reports ranges.",
      ),
    },
    {
      id: "E3",
      titulo: L("ΔV contra la caja negra del auto", "ΔV against the car's black box"),
      pregunta: L(
        "¿Qué tan cerca queda el ΔV estimado desde el daño del que registró el EDR en choques reales?",
        "How close is the ΔV estimated from the damage to the one the EDR recorded in real crashes?",
      ),
      graficas: [
        {
          tipo: "barras",
          titulo: L(
            `Test CISS 2022–2024 (${n(e3.croquis.n)} vehículos)`,
            `CISS 2022–2024 test (${n(e3.croquis.n)} vehicles)`,
          ),
          metrica: L("Error absoluto medio", "Mean absolute error"),
          mejor: "menor",
          unidad: "km/h",
          barras: [
            bar("Croquis", e3.croquis.error_absoluto_medio_kmh, true),
            bar("WinSMASH", e3.winsmash.error_absoluto_medio_kmh),
          ],
        },
      ],
      fuentes: [src("e3_ciss")],
      nota: L(
        "WinSMASH, el programa con el que la propia NHTSA reconstruye estos casos, se equivoca un poco menos en promedio; Croquis tiene menos sesgo.",
        "WinSMASH, the program NHTSA itself uses to reconstruct these cases, errs a little less on average; Croquis has less bias.",
      ),
    },
    {
      id: "E4",
      titulo: L(
        "Atropellamiento: velocidad desde la distancia de proyección",
        "Pedestrian impact: speed from throw distance",
      ),
      pregunta: L(
        "¿Qué tan bien recupera la velocidad del vehículo a partir de dónde quedó el peatón?",
        "How well does it recover the vehicle's speed from where the pedestrian ended up?",
      ),
      graficas: [
        {
          tipo: "barras",
          titulo: L(
            `Casos publicados en el dominio del modelo (${R("e4_pedestrian").resumen.casos_en_dominio})`,
            `Published cases within the model's domain (${R("e4_pedestrian").resumen.casos_en_dominio})`,
          ),
          metrica: L("Error absoluto medio", "Mean absolute error"),
          mejor: "menor",
          unidad: "km/h",
          barras: [
            bar("Croquis", e4.velocidad_desde_distancia_kmh.croquis.mae, true),
            bar("Searle sola", e4.velocidad_desde_distancia_kmh.searle_sola.mae),
            bar("Wood", e4.velocidad_desde_distancia_kmh.wood.mae),
          ],
        },
      ],
      fuentes: [src("e4_pedestrian")],
      nota: L(
        "Muestra pequeña: los intervalos importan más que el promedio.",
        "Small sample: the intervals matter more than the average.",
      ),
    },
    {
      id: "E5",
      titulo: L("La deformación contra autos reales", "Deformation against real cars"),
      pregunta: L(
        "¿Se parece la malla deformada del visor al aplastamiento medido en el auto real?",
        "Does the viewer's deformed mesh look like the crush measured on the real car?",
      ),
      graficas: [
        {
          tipo: "grupos",
          titulo: L(
            "Test CISS: error por punto, por tipo de impacto (casos con el orden de los puntos conocido)",
            "CISS test: error per point, by impact type (cases with the point order known)",
          ),
          metrica: L("Error por punto, mediana", "Error per point, median"),
          mejor: "menor",
          unidad: "cm",
          grupos: e5Tipo("ciss", "punto"),
        },
        {
          tipo: "grupos",
          titulo: L("Profundidad máxima, todos los tipos", "Maximum depth, all types"),
          metrica: L("Error, mediana", "Error, median"),
          mejor: "menor",
          unidad: "cm",
          grupos: ["ciss", "nhtsa"].map((f) => ({
            grupo: L(
              `${f === "ciss" ? "CISS" : "NHTSA"} (${n(e5[f].todos.maximo.n)})`,
              `${f === "ciss" ? "CISS" : "NHTSA"} (${n(e5[f].todos.maximo.n)})`,
            ),
            barras: [
              bar("Croquis", e5[f].todos.maximo.croquis.mediana, true),
              bar("Uniforme", e5[f].todos.maximo.uniforme.mediana),
              bar("Lineal simple", e5[f].todos.maximo.lineal.mediana),
            ],
          })),
        },
      ],
      fuentes: [
        src("e5"),
        { archivo: "docs/galeria-e5/README.md", url: `${REPO}/docs/galeria-e5/README.md` },
      ],
      nota: L(
        "Croquis gana en el perfil punto por punto, pero el perfil triangular predice mejor la profundidad máxima y el ancho. El test se corrió una sola vez.",
        "Croquis wins on the point-by-point profile, but the triangular profile predicts maximum depth and width better. The test was run only once.",
      ),
    },
    {
      id: "E6",
      titulo: L("Rendimiento en una laptop de 8 GB", "Performance on an 8 GB laptop"),
      pregunta: L(
        "¿Cuántos cuadros por segundo da el visor en la escena más lenta?",
        "How many frames per second does the viewer reach in the slowest scene?",
      ),
      graficas: [
        {
          tipo: "barras",
          titulo: L(`Modo automático, 1920×1080, ${cpu}`, `Automatic mode, 1920×1080, ${cpu}`),
          metrica: L("fps mínimo entre escenas", "minimum fps across scenes"),
          mejor: "mayor",
          unidad: "fps",
          barras: [
            bar("Calidad baja", e6.modo_automatico.baja.fps_min_entre_escenas, true),
            bar("Calidad media", e6.modo_automatico.media.fps_min_entre_escenas, true),
          ],
          metas: [
            { etiqueta: L("Meta baja", "Low target"), valor: e6.presupuesto.fpsBaja },
            { etiqueta: L("Meta media", "Medium target"), valor: e6.presupuesto.fpsMedia },
          ],
        },
      ],
      fuentes: [src("e6_performance")],
      nota: L(
        "Alta y ultra se miden en la computadora de demo (pendiente).",
        "High and ultra are measured on the demo computer (pending).",
      ),
    },
    {
      id: "E7",
      titulo: L(
        "El solver del navegador es el de referencia",
        "The browser solver is the reference solver",
      ),
      pregunta: L(
        "¿Da lo mismo el solver TS de producción que la referencia en Python?",
        "Does the production TS solver give the same as the Python reference?",
      ),
      graficas: [
        {
          tipo: "cifras",
          cifras: [
            {
              etiqueta: L("Números comparados", "Numbers compared"),
              valor: e7.numeros_comparados,
              formato: "entero",
            },
            {
              etiqueta: L("Diferencia máxima", "Maximum difference"),
              valor: e7.max_abs,
              formato: "cientifico",
            },
            {
              etiqueta: L("Diferencias de estructura o texto", "Structure or text differences"),
              valor: e7.diferencias_de_estructura_o_texto,
              formato: "entero",
            },
          ],
        },
      ],
      fuentes: [src("e7_parity")],
      nota: L(
        "Las 11 escenas canónicas, completas: trayectorias, daño, personas, visibilidad, Monte Carlo, inversión y consistencia.",
        "The 11 canonical scenes, in full: trajectories, damage, people, visibility, Monte Carlo, inversion and consistency.",
      ),
    },
    {
      id: "E8",
      titulo: L("El mismo resultado en todos los navegadores", "The same result in every browser"),
      pregunta: L(
        "¿Sale idéntico, bit a bit, en Chromium, Firefox y WebKit?",
        "Is it identical, bit for bit, in Chromium, Firefox and WebKit?",
      ),
      graficas: [
        {
          tipo: "cifras",
          cifras: [
            {
              etiqueta: L("Escenas del solver idénticas", "Identical solver scenes"),
              valor: L(
                `${e8.escenas_identicas} de ${e8.escenas_total}`,
                `${e8.escenas_identicas} of ${e8.escenas_total}`,
              ),
              formato: "texto",
            },
            {
              etiqueta: L("Horneados con Rapier idénticos", "Identical Rapier bakes"),
              valor: L(
                `${e8.horneados_identicos} de ${e8.escenas_total}`,
                `${e8.horneados_identicos} of ${e8.escenas_total}`,
              ),
              formato: "texto",
            },
            {
              etiqueta: L("Navegadores", "Browsers"),
              valor: Object.keys(e8.navegadores).length,
              formato: "entero",
            },
          ],
        },
      ],
      fuentes: [src("e8_determinism")],
      nota: L(
        "Con funciones matemáticas propias (fdlibm en TypeScript), porque Math.sin y compañía cambian entre motores.",
        "With our own math functions (fdlibm in TypeScript), because Math.sin and friends change between engines.",
      ),
    },
    {
      id: "E9",
      titulo: L("Personas reales", "Real people"),
      pregunta: L(
        "¿Cuánto tarda alguien en llegar a su primera reconstrucción y qué tan usable le resulta?",
        "How long does it take someone to reach their first reconstruction, and how usable do they find it?",
      ),
      graficas: [],
      fuentes: [],
      nota: L(
        "Pendiente: necesita a cinco o más personas reales (F11).",
        "Pending: it needs five or more real people (F11).",
      ),
    },
  ];
}

const files = {
  "historia.json": historia(),
  "recorrido.json": { evaluaciones: recorrido(), resultados: Object.keys(results).sort() },
};
const check = process.argv.includes("--check");
let stale = false;
for (const [name, data] of Object.entries(files)) {
  const path = resolve(OUT, name);
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if (check) {
    let current = "";
    try {
      current = readFileSync(path, "utf-8");
    } catch {
      current = "";
    }
    if (current !== text) {
      console.error(`${path} no está al día: corre node scripts/build-paginas.mjs`);
      stale = true;
    }
  } else {
    writeFileSync(path, text, "utf-8");
    console.log(path);
  }
}
if (stale) process.exit(1);
