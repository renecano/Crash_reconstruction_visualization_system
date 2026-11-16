/**
 * W9 · T6.6 (René, 2026-11-15, opción a): ¿cambia algo que los prompts del corpus y de la narración
 * digan «reporte» en vez de «dictamen»? Solo la palabra (`aReporte`), 20 reportes, menos de 1 USD.
 *
 * Los 20 son reportes que ya se leyeron con los prompts vigentes con «dictamen» (corpus-cesvi-v4 y
 * narracion-cesvi-v1, mismo modelo): esas lecturas guardadas son el «antes» y no se pagan otra vez.
 * Primero van los de la prueba congelada. El «después» se lee ahora, por lotes, con el mismo texto
 * que recibieron las lecturas guardadas (el reporte tal como lo manda `data/cesvi/scripts/corpus.mts`)
 * y los prompts con «reporte» (corpus-cesvi-v5, narracion-cesvi-v2). Las dos lecturas se convierten
 * con el código de hoy, así que la diferencia es la palabra más el ruido del modelo; con una lectura
 * por lado no se separan, y eso se dice en el resultado.
 *
 * Para no pasar de 1 USD, los reportes se mandan en tandas: cada una se manda solo si lo ya gastado
 * más su costo estimado (entrada contada exacta, salida igual a la de su lectura guardada, más 15 %)
 * queda bajo el tope. El gasto va también al libro de W9 (`eval/results/w9_gasto.json`).
 *
 *   cd packages/cesvi
 *   node --env-file=../../.env.local --import tsx ../../eval/t6_6_reporte.mts estimar
 *   node --env-file=../../.env.local --import tsx ../../eval/t6_6_reporte.mts lote <cuántos reportes>
 *   node --env-file=../../.env.local --import tsx ../../eval/t6_6_reporte.mts recoger
 *     → eval/results/t6_6_reporte.json; las lecturas en data/raw/cesvi/t6_6-cache/ (fuera de git:
 *       traen citas del reporte sin redactar)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dividirLote,
  ESQUEMA_CORPUS,
  expedienteDeSalida,
  SISTEMA_CORPUS,
  VERSION_PROMPT_CORPUS,
  type DocumentoCrudo,
  type SalidaCorpus,
} from "../packages/cesvi/src/corpus";
import {
  ESQUEMA_NARRACION,
  narracionDeSalida,
  SISTEMA_NARRACION,
  VERSION_PROMPT_NARRACION,
  type SalidaNarracion,
} from "../packages/cesvi/src/narracion";
import {
  clienteCorpus,
  costoCorpus,
  lecturaDeMensaje,
  MODELO_CORPUS,
  pedidoLectura,
  tokensDePedido,
} from "../packages/cesvi/src/server/corpus";
import { sha256Hex } from "../packages/extraction/src/hash";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CRUDOS = join(RAIZ, "data/raw/cesvi");
const CACHE = join(CRUDOS, "t6_6-cache");
const LOTES = join(CACHE, "_lotes.json");
const SALIDA = join(RAIZ, "eval/results/t6_6_reporte.json");
const GASTO_W9 = join(RAIZ, "eval/results/w9_gasto.json");
const N = 20;
const TOPE_USD = 1;

/**
 * «dictamen» → «reporte», solo la palabra. Los prompts de la app no cambian: (a) no mejoró (René pidió
 * no hacer (b) en ese caso), así que la variante vive solo aquí, para poder repetir la medición.
 */
export function aReporte(t: string): string {
  return t
    .replace(/\bdictámenes\b/g, "reportes")
    .replace(/\bDictámenes\b/g, "Reportes")
    .replace(/\bdictamen\b/g, "reporte")
    .replace(/\bDictamen\b/g, "Reporte");
}
const SISTEMA_CORPUS_REPORTE = aReporte(SISTEMA_CORPUS);
const SISTEMA_NARRACION_REPORTE = aReporte(SISTEMA_NARRACION);
const mensaje = (texto: string) => `Reporte:\n\n${texto}`;
const MARGEN = 1.15;

type Tipo = "corpus" | "narracion";
const TIPOS: Tipo[] = ["corpus", "narracion"];

interface Guardada {
  version_prompt: string;
  modelo: string;
  uso: { output_tokens: number };
  costo_usd: number;
  salida: unknown;
}
interface Lote {
  id: string;
  fecha: string;
  reportes: string[];
  estimado_usd: number;
}

const guardada = (t: Tipo, id: string) =>
  JSON.parse(
    readFileSync(
      join(CRUDOS, t === "corpus" ? "corpus-cache" : "narracion-cache", `${id}.json`),
      "utf8",
    ),
  ) as Guardada;

/** Los 20 reportes: leídos con los prompts vigentes con «dictamen», primero los de la prueba. */
function elegidos(): DocumentoCrudo[] {
  const v4 = readFileSync(join(RAIZ, "data/cesvi/corpus/expedientes.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { id: string; version_prompt: string })
    .filter((l) => l.version_prompt === "corpus-cesvi-v4")
    .map((l) => l.id)
    .filter((id) => guardada("narracion", id).version_prompt === "narracion-cesvi-v1");
  const prueba = new Set(
    (
      JSON.parse(readFileSync(join(RAIZ, "data/cesvi/corpus/particion.json"), "utf8")) as {
        prueba: string[];
      }
    ).prueba,
  );
  const orden = [...v4].sort(
    (a, b) =>
      (prueba.has(a) ? 0 : 1) - (prueba.has(b) ? 0 : 1) ||
      (sha256Hex(`t6_6:${a}`) < sha256Hex(`t6_6:${b}`) ? -1 : 1),
  );
  const ids = orden.slice(0, N);
  const docs = new Map(
    readdirSync(CRUDOS)
      .filter((f) => /^crash_reports_batch_\d+\.md$/.test(f))
      .sort()
      .flatMap((f) => dividirLote(readFileSync(join(CRUDOS, f), "utf8")))
      .map((d) => [d.id, d]),
  );
  return ids.map((id) => docs.get(id)!);
}

const enPrueba = (id: string) =>
  (
    JSON.parse(readFileSync(join(RAIZ, "data/cesvi/corpus/particion.json"), "utf8")) as {
      prueba: string[];
    }
  ).prueba.includes(id);

function pedido(t: Tipo, texto: string) {
  return t === "corpus"
    ? pedidoLectura(
        SISTEMA_CORPUS_REPORTE,
        mensaje(texto),
        ESQUEMA_CORPUS as unknown as Record<string, unknown>,
        MODELO_CORPUS,
      )
    : pedidoLectura(
        SISTEMA_NARRACION_REPORTE,
        mensaje(texto),
        ESQUEMA_NARRACION as unknown as Record<string, unknown>,
        MODELO_CORPUS,
      );
}

const lotes = (): Lote[] =>
  existsSync(LOTES) ? (JSON.parse(readFileSync(LOTES, "utf8")) as Lote[]) : [];

/** Costo estimado de leer estos reportes con «reporte»: entrada contada, salida como la guardada. */
async function estimado(docs: DocumentoCrudo[]): Promise<number> {
  const c = clienteCorpus();
  let usd = 0;
  for (const d of docs)
    for (const t of TIPOS) {
      const entrada = await tokensDePedido(pedido(t, d.texto), c);
      const salida = guardada(t, d.id).uso.output_tokens;
      usd += costoCorpus(
        MODELO_CORPUS,
        {
          input_tokens: entrada,
          output_tokens: salida,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        true,
      );
    }
  return usd * MARGEN;
}

/** Lo ya gastado en T6.6: lo real de los lotes recogidos, lo estimado de los que siguen corriendo. */
function gastado(): number {
  const r = existsSync(SALIDA)
    ? ((JSON.parse(readFileSync(SALIDA, "utf8")) as { costo_por_lote?: Record<string, number> })
        .costo_por_lote ?? {})
    : {};
  return lotes().reduce((a, l) => a + (r[l.id] ?? l.estimado_usd), 0);
}

async function estimar() {
  const docs = elegidos();
  const usd = await estimado(docs);
  console.log(
    `${docs.length} reportes × 2 lecturas nuevas: ~${usd.toFixed(3)} USD por lotes (con ${Math.round((MARGEN - 1) * 100)} % de margen); ya gastado en T6.6: ${gastado().toFixed(3)}`,
  );
}

async function lote(cuantos: number) {
  const ya = new Set(lotes().flatMap((l) => l.reportes));
  const docs = elegidos()
    .filter((d) => !ya.has(d.id))
    .slice(0, cuantos);
  if (!docs.length) return console.log("No quedan reportes por mandar.");
  const est = await estimado(docs);
  const libro = JSON.parse(readFileSync(GASTO_W9, "utf8")) as {
    tope_usd: number;
    total_usd: number;
  };
  if (gastado() + est > TOPE_USD || libro.total_usd + gastado() + est > libro.tope_usd) {
    return console.log(
      `No se manda: ${gastado().toFixed(3)} ya gastado + ${est.toFixed(3)} estimado pasa de ${TOPE_USD} USD.`,
    );
  }
  const c = clienteCorpus();
  const b = (await c.messages.batches.create({
    requests: docs.flatMap((d) =>
      TIPOS.map((t) => ({ custom_id: `${t}__${d.id}`, params: pedido(t, d.texto) })),
    ),
  } as never)) as unknown as { id: string };
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(
    LOTES,
    `${JSON.stringify([...lotes(), { id: b.id, fecha: new Date().toISOString(), reportes: docs.map((d) => d.id), estimado_usd: Math.round(est * 1e4) / 1e4 }], null, 2)}\n`,
  );
  console.log(`Lote ${b.id}: ${docs.length} reportes × 2 lecturas, ~${est.toFixed(3)} USD.`);
}

type Fila = Record<string, unknown>;

function medirCorpus(salida: SalidaCorpus, texto: string): Fila {
  const conv = expedienteDeSalida(salida, texto);
  const k = conv.conteos;
  return {
    datos: k.filas,
    invalidos: k.valores_invalidos,
    citas: k.citas,
    citas_fuera: k.citas_fuera,
    numeros: k.numeros,
    numeros_fuera: k.numeros_fuera,
    numeros_verificados: k.numeros - k.numeros_fuera,
    vehiculos: conv.expediente.vehiculos.length,
  };
}

function medirNarracion(salida: SalidaNarracion, doc: DocumentoCrudo): Fila {
  const n = narracionDeSalida(salida, doc);
  return { ...n.conteos, fugas: n.fugas.length, solo_conclusiones: n.solo_conclusiones };
}

async function recoger() {
  const c = clienteCorpus();
  const docs = new Map(elegidos().map((d) => [d.id, d]));
  const costoPorLote: Record<string, number> = {};
  const filas: Record<string, Record<string, Fila>> = {};
  for (const l of lotes()) {
    const e = (await c.messages.batches.retrieve(l.id)) as unknown as {
      processing_status: string;
      request_counts: Record<string, number>;
    };
    if (e.processing_status !== "ended") {
      console.log(`Lote ${l.id}: ${e.processing_status} ${JSON.stringify(e.request_counts)}`);
      continue;
    }
    let costo = 0;
    for await (const r of (await c.messages.batches.results(l.id)) as unknown as AsyncIterable<{
      custom_id: string;
      result: { type: string; message?: unknown };
    }>) {
      const [t, id] = r.custom_id.split("__") as [Tipo, string];
      const doc = docs.get(id)!;
      const fila = (filas[id] ??= { en_prueba: { valor: enPrueba(id) } });
      fila[`${t}_dictamen`] =
        t === "corpus"
          ? medirCorpus(guardada("corpus", id).salida as SalidaCorpus, doc.texto)
          : medirNarracion(guardada("narracion", id).salida as SalidaNarracion, doc);
      if (r.result.type !== "succeeded" || !r.result.message) {
        fila[`${t}_reporte`] = { error: r.result.type };
        continue;
      }
      writeFileSync(join(CACHE, `${r.custom_id}.json`), `${JSON.stringify(r.result.message)}\n`);
      try {
        if (t === "corpus") {
          const lc = lecturaDeMensaje<SalidaCorpus>(r.result.message as never, true);
          costo += lc.costoUsd;
          fila.corpus_reporte = medirCorpus(lc.salida, doc.texto);
        } else {
          const ln = lecturaDeMensaje<SalidaNarracion>(r.result.message as never, true);
          costo += ln.costoUsd;
          fila.narracion_reporte = medirNarracion(ln.salida, doc);
        }
      } catch (err) {
        fila[`${t}_reporte`] = { error: (err as Error).message.slice(0, 200) };
      }
    }
    costoPorLote[l.id] = Math.round(costo * 1e4) / 1e4;
  }
  if (!Object.keys(costoPorLote).length) return console.log("Ningún lote ha terminado.");
  const lista = Object.values(filas);
  const suma = (k: string, campo: string, sub?: (f: Record<string, Fila>) => boolean) =>
    lista.filter((f) => !sub || sub(f)).reduce((a, f) => a + (Number(f[k]?.[campo]) || 0), 0);
  const lado = (t: Tipo, v: "dictamen" | "reporte", sub?: (f: Record<string, Fila>) => boolean) => {
    const k = `${t}_${v}`;
    const campos =
      t === "corpus"
        ? [
            "datos",
            "invalidos",
            "citas",
            "citas_fuera",
            "numeros",
            "numeros_fuera",
            "numeros_verificados",
            "vehiculos",
          ]
        : ["citas", "citas_fuera", "velocidades", "velocidades_fuera", "fugas"];
    return {
      ...Object.fromEntries(campos.map((x) => [x, suma(k, x, sub)])),
      errores: lista.filter((f) => (!sub || sub(f)) && f[k]?.error).length,
    };
  };
  // Por reporte: ¿la lectura con «reporte» rechaza menos sin perder datos verificados? (la regla de T6.5)
  const cambio = (f: Record<string, Fila>) => {
    const a = f.corpus_dictamen;
    const b = f.corpus_reporte;
    if (!a || !b || b.error) return "sin dato";
    const ra = Number(a.citas_fuera) + Number(a.numeros_fuera);
    const rb = Number(b.citas_fuera) + Number(b.numeros_fuera);
    if (rb < ra && Number(b.numeros_verificados) >= Number(a.numeros_verificados)) return "mejor";
    if (rb > ra || Number(b.numeros_verificados) < Number(a.numeros_verificados)) return "peor";
    return "igual";
  };
  const veredictos = lista.map(cambio);
  const costo = Object.values(costoPorLote).reduce((a, b) => a + b, 0);
  const resultado = {
    descripcion:
      "W9 · T6.6 (a): los prompts del corpus y de la narración con «dictamen» (las lecturas guardadas de corpus-cesvi-v4 y narracion-cesvi-v1) contra los mismos prompts con «reporte» (corpus-cesvi-v5 y narracion-cesvi-v2, leídos ahora por lotes), sobre los mismos 20 reportes y el mismo texto de entrada, convertidos con el código de hoy. Corpus: datos, citas que no están en el reporte, números que no están escritos en su cita y números verificados. Narración: citas, velocidades y fugas de conclusiones. Una lectura por lado: la diferencia incluye el ruido del modelo.",
    script: "eval/t6_6_reporte.mts",
    modelo: MODELO_CORPUS,
    versiones: {
      antes: [VERSION_PROMPT_CORPUS, VERSION_PROMPT_NARRACION],
      despues: [
        `${VERSION_PROMPT_CORPUS} con «reporte»`,
        `${VERSION_PROMPT_NARRACION} con «reporte»`,
      ],
    },
    fecha: new Date().toISOString(),
    reportes: lista.length,
    reportes_en_prueba: lista.filter((f) => f.en_prueba?.valor).length,
    costo_usd: Math.round(costo * 1e4) / 1e4,
    costo_por_lote: costoPorLote,
    tope_usd: TOPE_USD,
    resumen: {
      corpus: { dictamen: lado("corpus", "dictamen"), reporte: lado("corpus", "reporte") },
      narracion: { dictamen: lado("narracion", "dictamen"), reporte: lado("narracion", "reporte") },
      por_reporte_corpus: {
        mejor: veredictos.filter((v) => v === "mejor").length,
        igual: veredictos.filter((v) => v === "igual").length,
        peor: veredictos.filter((v) => v === "peor").length,
        sin_dato: veredictos.filter((v) => v === "sin dato").length,
      },
    },
    por_reporte: filas,
  };
  writeFileSync(SALIDA, `${JSON.stringify(resultado, null, 2)}\n`);
  // El libro de W9: un movimiento por lote recogido.
  const libro = JSON.parse(readFileSync(GASTO_W9, "utf8")) as {
    movimientos: { fecha: string; que: string; usd: number }[];
    total_usd: number;
  };
  for (const [id, usd] of Object.entries(costoPorLote))
    if (!libro.movimientos.some((m) => m.que.includes(id)))
      libro.movimientos.push({
        fecha: new Date().toISOString(),
        que: `T6.6 (a): lecturas con «reporte» por lotes (${id})`,
        usd,
      });
  libro.total_usd = Math.round(libro.movimientos.reduce((a, m) => a + m.usd, 0) * 1e4) / 1e4;
  writeFileSync(GASTO_W9, `${JSON.stringify(libro, null, 2)}\n`);
  console.log(
    JSON.stringify({ costo_usd: resultado.costo_usd, resumen: resultado.resumen }, null, 1),
  );
}

const [modo, arg] = process.argv.slice(2);
if (modo === "estimar") await estimar();
else if (modo === "lote") await lote(Number(arg ?? 10));
else if (modo === "recoger") await recoger();
else console.error("Uso: estimar | lote <cuántos reportes> | recoger");
