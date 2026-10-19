/**
 * Datos de las páginas de historia y del recorrido técnico (PLAN §11, F11), generados desde
 * `eval/results/`: las páginas no escriben ningún número a mano (CLAUDE.md, regla 3).
 *
 * Uso: `node scripts/build-paginas.mjs` → `src/data/historia.json` y `src/data/recorrido.json`;
 * con `--check` falla si no están al día (CI).
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
const bar = (etiqueta, valor, croquis = false) => ({ etiqueta, valor, croquis });
/** Conteo con separador de miles, como en el README (1,316). */
const n = (x) => x.toLocaleString("es-MX");

function historia() {
  const a = R("atus_summary");
  const tipos = a.distribucion_tipo_ultimo_anio.slice(0, 5).map((t) => ({
    tipo: t.tipo,
    accidentes: t.accidentes,
    participacion: t.participacion,
  }));
  return {
    fuente: {
      ...a.fuente,
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
    frontal: "Frontal",
    frontal_desplazado: "Desplazado",
    lateral: "Lateral",
    alcance: "Alcance",
    poste: "Poste",
  };
  return Object.entries(nombres)
    .filter(([t]) => r[t]?.[metrica]?.croquis)
    .map(([t, nombre]) => ({
      grupo: `${nombre} (${n(r[t][metrica].n)})`,
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
  const f1 = (m) => [
    bar("Claude Sonnet", m["claude-sonnet-5-5"].f1_micro, true),
    bar("Claude Haiku", m["claude-haiku-5-5"].f1_micro, true),
    bar("Reglas", m.reglas.f1_micro),
  ];
  return [
    {
      id: "E1",
      titulo: "La IA entiende el relato",
      pregunta: "¿Qué tan bien convierte el relato en datos, campo por campo?",
      graficas: [
        {
          tipo: "barras",
          titulo: `Test congelado de Relatos-MX (${e1.reglas.relatos} relatos)`,
          metrica: "F1 micro",
          mejor: "mayor",
          unidad: "",
          barras: f1(e1),
        },
        {
          tipo: "barras",
          titulo: `Test CISS: verdad de los campos codificados de NHTSA (${e1c.reglas.relatos} relatos)`,
          metrica: "F1 micro",
          mejor: "mayor",
          unidad: "",
          barras: f1(e1c),
        },
      ],
      fuentes: [src("e1_extraction_v3"), src("e1_extraction_ciss_v3")],
      nota: "Los relatos del primer test los escribieron agentes de IA: mide español escrito por un modelo. E9 lo contrastará con personas.",
    },
    {
      id: "E2",
      titulo: "La rigidez de cada clase de vehículo",
      pregunta:
        "¿Qué tan bien estima la velocidad a partir del aplastamiento en pruebas de choque reales?",
      graficas: [
        {
          tipo: "barras",
          titulo: `Barrera frontal rígida, dejar uno fuera (${n(e2.n_evaluadas)} pruebas de NHTSA)`,
          metrica: "Error absoluto medio",
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
          titulo:
            "Barrera móvil y trasera: ΔV de cada prueba con la rigidez de las demás de su clase",
          metrica: "Error absoluto medio",
          mejor: "menor",
          unidad: "km/h",
          grupos: [
            {
              grupo: `Lateral (${n(mdb.lateral.global.n_evaluadas)})`,
              barras: [
                bar("Croquis", mdb.lateral.global.mae_dv_kmh, true),
                bar("Respaldo genérico", mdb.lateral.global.respaldo_mae_dv_kmh),
              ],
            },
            {
              grupo: `Trasera (${mdb.trasera.global.n_evaluadas})`,
              barras: [
                bar("Croquis", mdb.trasera.global.mae_dv_kmh, true),
                bar("Respaldo genérico", mdb.trasera.global.respaldo_mae_dv_kmh),
              ],
            },
          ],
        },
      ],
      fuentes: [src("e2_barrier"), src("e2_mdb")],
      nota: "La dispersión de rigidez dentro de cada clase domina el error; por eso Croquis reporta rangos.",
    },
    {
      id: "E3",
      titulo: "ΔV contra la caja negra del auto",
      pregunta:
        "¿Qué tan cerca queda el ΔV estimado desde el daño del que registró el EDR en choques reales?",
      graficas: [
        {
          tipo: "barras",
          titulo: `Test CISS 2022–2024 (${n(e3.croquis.n)} vehículos)`,
          metrica: "Error absoluto medio",
          mejor: "menor",
          unidad: "km/h",
          barras: [
            bar("Croquis", e3.croquis.error_absoluto_medio_kmh, true),
            bar("WinSMASH", e3.winsmash.error_absoluto_medio_kmh),
          ],
        },
      ],
      fuentes: [src("e3_ciss")],
      nota: "WinSMASH, el programa con el que la propia NHTSA reconstruye estos casos, se equivoca un poco menos en promedio; Croquis tiene menos sesgo.",
    },
    {
      id: "E4",
      titulo: "Atropellamiento: velocidad desde la distancia de proyección",
      pregunta:
        "¿Qué tan bien recupera la velocidad del vehículo a partir de dónde quedó el peatón?",
      graficas: [
        {
          tipo: "barras",
          titulo: `Casos publicados en el dominio del modelo (${R("e4_pedestrian").resumen.casos_en_dominio})`,
          metrica: "Error absoluto medio",
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
      nota: "Muestra pequeña: los intervalos importan más que el promedio.",
    },
    {
      id: "E5",
      titulo: "La deformación contra autos reales",
      pregunta: "¿Se parece la malla deformada del visor al aplastamiento medido en el auto real?",
      graficas: [
        {
          tipo: "grupos",
          titulo:
            "Test CISS: error por punto, por tipo de impacto (casos con el orden de los puntos conocido)",
          metrica: "Error por punto, mediana",
          mejor: "menor",
          unidad: "cm",
          grupos: e5Tipo("ciss", "punto"),
        },
        {
          tipo: "grupos",
          titulo: "Profundidad máxima, todos los tipos",
          metrica: "Error, mediana",
          mejor: "menor",
          unidad: "cm",
          grupos: ["ciss", "nhtsa"].map((f) => ({
            grupo: `${f === "ciss" ? "CISS" : "NHTSA"} (${n(e5[f].todos.maximo.n)})`,
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
      nota: "Croquis gana en el perfil punto por punto, pero el perfil triangular predice mejor la profundidad máxima y el ancho. El test se corrió una sola vez.",
    },
    {
      id: "E6",
      titulo: "Rendimiento en una laptop de 8 GB",
      pregunta: "¿Cuántos cuadros por segundo da el visor en la escena más lenta?",
      graficas: [
        {
          tipo: "barras",
          titulo: `Modo automático, 1920×1080, ${e6.maquina.cpu.replace(/\(R\)|\(TM\)|CPU @.*$/g, "").trim()}`,
          metrica: "fps mínimo entre escenas",
          mejor: "mayor",
          unidad: "fps",
          barras: [
            bar("Calidad baja", e6.modo_automatico.baja.fps_min_entre_escenas, true),
            bar("Calidad media", e6.modo_automatico.media.fps_min_entre_escenas, true),
          ],
          metas: [
            { etiqueta: "Meta baja", valor: e6.presupuesto.fpsBaja },
            { etiqueta: "Meta media", valor: e6.presupuesto.fpsMedia },
          ],
        },
      ],
      fuentes: [src("e6_performance")],
      nota: "Alta y ultra se miden en la computadora de demo (pendiente).",
    },
    {
      id: "E7",
      titulo: "El solver del navegador es el de referencia",
      pregunta: "¿Da lo mismo el solver TS de producción que la referencia en Python?",
      graficas: [
        {
          tipo: "cifras",
          cifras: [
            { etiqueta: "Números comparados", valor: e7.numeros_comparados, formato: "entero" },
            { etiqueta: "Diferencia máxima", valor: e7.max_abs, formato: "cientifico" },
            {
              etiqueta: "Diferencias de estructura o texto",
              valor: e7.diferencias_de_estructura_o_texto,
              formato: "entero",
            },
          ],
        },
      ],
      fuentes: [src("e7_parity")],
      nota: "Las 11 escenas canónicas, completas: trayectorias, daño, personas, visibilidad, Monte Carlo, inversión y consistencia.",
    },
    {
      id: "E8",
      titulo: "El mismo resultado en todos los navegadores",
      pregunta: "¿Sale idéntico, bit a bit, en Chromium, Firefox y WebKit?",
      graficas: [
        {
          tipo: "cifras",
          cifras: [
            {
              etiqueta: "Escenas del solver idénticas",
              valor: `${e8.escenas_identicas} de ${e8.escenas_total}`,
              formato: "texto",
            },
            {
              etiqueta: "Horneados con Rapier idénticos",
              valor: `${e8.horneados_identicos} de ${e8.escenas_total}`,
              formato: "texto",
            },
            {
              etiqueta: "Navegadores",
              valor: Object.keys(e8.navegadores).length,
              formato: "entero",
            },
          ],
        },
      ],
      fuentes: [src("e8_determinism")],
      nota: "Con funciones matemáticas propias (fdlibm en TypeScript), porque Math.sin y compañía cambian entre motores.",
    },
    {
      id: "E9",
      titulo: "Personas reales",
      pregunta:
        "¿Cuánto tarda alguien en llegar a su primera reconstrucción y qué tan usable le resulta?",
      graficas: [],
      fuentes: [],
      nota: "Pendiente: necesita a cinco o más personas reales (F11).",
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
