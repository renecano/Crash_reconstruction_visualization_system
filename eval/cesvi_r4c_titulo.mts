/**
 * E-R4 contra el título del reporte (ADR 0071): una segunda medición de la modalidad, al lado de la
 * de la etiqueta de R0, sin quitarla.
 *
 * La etiqueta de R0 es lo que Claude leyó en las conclusiones de cada reporte; la auditoría de R4b
 * (`eval/results/cesvi_r4b_auditoria_otra.json`) mostró que su «otra» mezcla hechos sin choque con
 * choques que el propio título nombra. Aquí la modalidad de referencia es la que CESVI escribió en el
 * título, leída con la regla de `packages/cesvi/src/titulo-reporte.ts`, que se fijó con desarrollo y
 * se congeló en un commit antes de mirar la prueba. Las predicciones de Croquis son las ya medidas
 * (v1: ADR 0067; v2: ADR 0069, congeladas en 29b67ab): esta medición no cambia ninguna regla de
 * Croquis, solo la referencia.
 *
 * Los textos crudos están fuera de git (`data/raw/cesvi/`); el resultado guarda la frase del título
 * de cada reporte y su modalidad.
 *
 * Uso (desde packages/cesvi):
 *   pnpm exec tsx ../../eval/cesvi_r4c_titulo.mts revisar           frases de desarrollo sin modalidad
 *   pnpm exec tsx ../../eval/cesvi_r4c_titulo.mts medir <desarrollo|prueba>
 *     → eval/results/cesvi_r4c_titulo_<particion>.json
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dividirLote } from "../packages/cesvi/src/corpus";
import {
  lineasBase,
  resumen,
  type ComparacionDictamen,
  type Conclusiones,
} from "../packages/cesvi/src/dictamenes-r4";
import { modalidadDelTitulo } from "../packages/cesvi/src/titulo-reporte";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CRUDOS = join(RAIZ, "data/raw/cesvi");
type Particion = "desarrollo" | "prueba";

interface Fila {
  id: string;
  comparacion: ComparacionDictamen;
}
interface Narracion {
  id: string;
  fugas: string[];
  solo_conclusiones: boolean;
  conclusiones: Conclusiones;
}

const prueba = new Set(
  (
    JSON.parse(readFileSync(join(RAIZ, "data/cesvi/corpus/particion.json"), "utf8")) as {
      prueba: string[];
    }
  ).prueba,
);
const narraciones = new Map(
  readFileSync(join(RAIZ, "data/cesvi/corpus/narraciones.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Narracion)
    .map((n) => [n.id, n]),
);

/** La frase y la modalidad del título de cada reporte de una partición. */
function titulos(p: Particion): Map<string, { frase: string | null; modalidad: string | null }> {
  const out = new Map<string, { frase: string | null; modalidad: string | null }>();
  for (const f of readdirSync(CRUDOS)
    .filter((x) => /^crash_reports_batch_\d+\.md$/.test(x))
    .sort()) {
    for (const d of dividirLote(readFileSync(join(CRUDOS, f), "utf8"))) {
      if ((p === "prueba") !== prueba.has(d.id)) continue;
      out.set(d.id, modalidadDelTitulo(d.texto));
    }
  }
  return out;
}

const leer = (f: string) =>
  JSON.parse(readFileSync(join(RAIZ, "eval/results", f), "utf8")) as {
    detalle: Fila[];
    resumen: ReturnType<typeof resumen>;
  };

function revisar() {
  const t = titulos("desarrollo");
  const sin = new Map<string, number>();
  const por = new Map<string, number>();
  for (const [id, x] of t) {
    if (!narraciones.has(id)) continue;
    if (x.modalidad) por.set(x.modalidad, (por.get(x.modalidad) ?? 0) + 1);
    else sin.set(x.frase ?? "(sin título)", (sin.get(x.frase ?? "(sin título)") ?? 0) + 1);
  }
  console.log("Con modalidad:", Object.fromEntries([...por].sort((a, b) => b[1] - a[1])));
  console.log(
    "Sin modalidad:",
    [...sin].sort((a, b) => b[1] - a[1]),
  );
}

function medir(p: Particion) {
  const t = titulos(p);
  // Las líneas base de la referencia del título, con desarrollo (como las de R0).
  const dev = titulos("desarrollo");
  const conTitulo = (c: Conclusiones, id: string, mapa = t): Conclusiones => ({
    ...c,
    modalidad: mapa.get(id)?.modalidad ?? null,
  });
  const devConclusiones = [...narraciones.values()]
    .filter((n) => !prueba.has(n.id) && !n.solo_conclusiones)
    .map((n) => conTitulo(n.conclusiones, n.id, dev));
  const base = lineasBase(devConclusiones);
  const versiones: [string, string][] =
    p === "prueba"
      ? [
          ["v1", "cesvi_r4_reproduccion_prueba.json"],
          ["v2", "cesvi_r4b_reproduccion_prueba.json"],
        ]
      : [["v2", "cesvi_r4b_reproduccion_desarrollo.json"]];
  const out: Record<string, unknown> = {
    fecha: new Date().toISOString(),
    particion: p,
    descripcion:
      "E-R4, modalidad: contra la etiqueta de R0 (como siempre) y contra la modalidad del título del reporte (regla de titulo-reporte.ts, congelada antes de mirar la prueba). Las predicciones de Croquis son las ya medidas de cada versión.",
    lineas_base_titulo: base,
  };
  for (const [v, archivo] of versiones) {
    const r = leer(archivo);
    const filas = r.detalle.map((f) => {
      const n = narraciones.get(f.id)!;
      const c = conTitulo(n.conclusiones, f.id);
      const croquis = f.comparacion.modalidad.croquis;
      return {
        conclusiones: c,
        comparacion: {
          ...f.comparacion,
          modalidad: {
            ...f.comparacion.modalidad,
            cesvi: c.modalidad,
            coincide: c.modalidad === null ? null : croquis === c.modalidad,
          },
        },
      };
    });
    const titulo = resumen(filas, base).modalidad;
    out[v] = {
      archivo,
      reportes: filas.length,
      con_modalidad_en_el_titulo: filas.filter((f) => f.conclusiones.modalidad).length,
      etiqueta_r0: r.resumen.modalidad,
      titulo_del_reporte: titulo,
    };
  }
  out.frases = Object.fromEntries([...t].map(([id, x]) => [id, x]));
  writeFileSync(
    join(RAIZ, `eval/results/cesvi_r4c_titulo_${p}.json`),
    `${JSON.stringify(out, null, 1)}\n`,
  );
  const { frases: _f, ...resumenSalida } = out;
  console.log(JSON.stringify(resumenSalida, null, 1));
}

const [modo, arg] = process.argv.slice(2);
if (modo === "revisar") revisar();
else if (modo === "medir" && (arg === "desarrollo" || arg === "prueba")) medir(arg);
else console.error("Uso: revisar | medir <desarrollo|prueba>");
