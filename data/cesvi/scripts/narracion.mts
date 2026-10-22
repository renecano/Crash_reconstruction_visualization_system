/**
 * R0 (docs/cesvi/PLAN-CESVI.md §3): la narración del perito sin conclusiones y lo que concluyó
 * CESVI, para cada uno de los 671 dictámenes.
 *
 * Lee los lotes crudos de `data/raw/cesvi/` (fuera de git) y guarda cada lectura de Claude en
 * `data/raw/cesvi/narracion-cache/<id>.json` (fuera de git: trae el texto sin redactar). Con la
 * caché arma `data/cesvi/corpus/narraciones.jsonl` (redactado) y la medición
 * `eval/results/cesvi_narraciones.json` (fugas, citas, velocidades y costo).
 *
 * Uso (desde la raíz, con la llave en el entorno: `set -a; . ./.env.local; set +a`):
 *   pnpm --filter @croquis/cesvi narracion estimar           tokens de entrada (conteo gratis)
 *   pnpm --filter @croquis/cesvi narracion piloto <n>        n dictámenes con la API normal
 *   pnpm --filter @croquis/cesvi narracion lote [tope_usd]   los que faltan, con la API de lotes
 *   pnpm --filter @croquis/cesvi narracion recoger <id>      trae a la caché los resultados de un lote
 *   pnpm --filter @croquis/cesvi narracion armar             narraciones y medición (sin API)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../../../packages/extraction/src/index";
import { dividirLote, redactar, type DocumentoCrudo } from "../../../packages/cesvi/src/corpus";
import {
  narracionDeSalida,
  PATRONES_FUGA,
  VERSION_PROMPT_NARRACION,
  type Narracion,
  type SalidaNarracion,
} from "../../../packages/cesvi/src/narracion";
import {
  clienteCorpus,
  costoCorpus,
  lecturaDeMensaje,
  leerConPedido,
  MODELO_CORPUS,
  pedidoNarracion,
  tokensDePedido,
  type UsoTokens,
} from "../../../packages/cesvi/src/server/corpus";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CRUDOS = join(RAIZ, "data/raw/cesvi");
const CACHE = join(CRUDOS, "narracion-cache");
const CORPUS = join(RAIZ, "data/cesvi/corpus");
const RESULTADOS = join(RAIZ, "eval/results");

interface Cacheado {
  id: string;
  version_prompt: string;
  modelo: string;
  lote: boolean;
  fecha: string;
  uso: UsoTokens;
  costo_usd: number;
  salida: SalidaNarracion;
}

const escribirJson = (p: string, d: unknown) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(d, null, 2)}\n`);
};

function documentos(): DocumentoCrudo[] {
  return readdirSync(CRUDOS)
    .filter((f) => /^crash_reports_batch_\d+\.md$/.test(f))
    .sort()
    .flatMap((f) => dividirLote(readFileSync(join(CRUDOS, f), "utf8")));
}

const rutaCache = (id: string) => join(CACHE, `${id}.json`);
function cacheado(id: string): Cacheado | null {
  if (!existsSync(rutaCache(id))) return null;
  const c = JSON.parse(readFileSync(rutaCache(id), "utf8")) as Cacheado;
  return c.version_prompt === VERSION_PROMPT_NARRACION ? c : null;
}

async function enParalelo<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(xs.length);
  let k = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (k < xs.length) {
        const i = k++;
        out[i] = await f(xs[i]!);
      }
    }),
  );
  return out;
}

const guardar = (
  id: string,
  l: { modeloRespuesta: string; uso: UsoTokens; costoUsd: number; salida: SalidaNarracion },
  lote: boolean,
) =>
  escribirJson(rutaCache(id), {
    id,
    version_prompt: VERSION_PROMPT_NARRACION,
    modelo: l.modeloRespuesta,
    lote,
    fecha: new Date().toISOString(),
    uso: l.uso,
    costo_usd: l.costoUsd,
    salida: l.salida,
  } satisfies Cacheado);

async function estimar() {
  const docs = documentos();
  const c = clienteCorpus();
  const tokens = await enParalelo(docs, 4, (d) => tokensDePedido(pedidoNarracion(d.texto), c));
  const total = tokens.reduce((a, b) => a + b, 0);
  escribirJson(join(CACHE, "_tokens.json"), {
    fecha: new Date().toISOString(),
    modelo: MODELO_CORPUS,
    version_prompt: VERSION_PROMPT_NARRACION,
    dictamenes: docs.length,
    tokens_entrada_total: total,
    por_documento: Object.fromEntries(docs.map((d, i) => [d.id, tokens[i]])),
  });
  console.log(`${docs.length} dictámenes: ${total} tokens de entrada`);
}

/** Los n del piloto: los primeros por el SHA-256 de `narracion:<id>`. */
function delPiloto(docs: DocumentoCrudo[], n: number): DocumentoCrudo[] {
  return [...docs]
    .sort((a, b) => (sha256Hex(`narracion:${a.id}`) < sha256Hex(`narracion:${b.id}`) ? -1 : 1))
    .slice(0, n);
}

async function piloto(n: number) {
  const c = clienteCorpus();
  let costo = 0;
  for (const d of delPiloto(documentos(), n)) {
    if (cacheado(d.id)) continue;
    try {
      const l = await leerConPedido<SalidaNarracion>(pedidoNarracion(d.texto), c);
      costo += l.costoUsd;
      guardar(d.id, l, false);
      const r = narracionDeSalida(l.salida, d);
      console.log(
        `${d.id}: salida ${l.uso.output_tokens}, ${l.costoUsd.toFixed(4)} USD; fugas [${r.fugas.join(", ")}]; citas fuera ${r.conteos.citas_fuera}/${r.conteos.citas}`,
      );
    } catch (e) {
      console.log(`${d.id}: ${(e as Error).message}`);
    }
  }
  console.log(`Piloto: ${costo.toFixed(4)} USD`);
}

async function lote(topeUsd: number) {
  const docs = documentos().filter((d) => !cacheado(d.id));
  const tokens = JSON.parse(readFileSync(join(CACHE, "_tokens.json"), "utf8")) as {
    por_documento: Record<string, number>;
  };
  const leidos = readdirSync(CACHE)
    .filter((f) => f.startsWith("cesvi-"))
    .map((f) => JSON.parse(readFileSync(join(CACHE, f), "utf8")) as Cacheado);
  if (!leidos.length) throw new Error("Primero corre el piloto: el estimado sale de su salida.");
  // Estimado: la salida media del piloto por dictamen, a precio de lote, sin caché.
  const salidaMedia = leidos.reduce((a, x) => a + x.uso.output_tokens, 0) / leidos.length;
  const entrada = docs.reduce((a, d) => a + (tokens.por_documento[d.id] ?? 0), 0);
  const estimado = costoCorpus(
    MODELO_CORPUS,
    {
      input_tokens: entrada,
      output_tokens: Math.round(salidaMedia * docs.length),
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    true,
  );
  console.log(
    `${docs.length} por leer: ~${estimado.toFixed(2)} USD estimados (tope ${topeUsd} USD)`,
  );
  if (estimado > topeUsd) throw new Error("El estimado pasa el tope: no se envía.");
  const b = await clienteCorpus().messages.batches.create({
    requests: docs.map((d) => ({ custom_id: d.id, params: pedidoNarracion(d.texto) })),
  } as Parameters<ReturnType<typeof clienteCorpus>["messages"]["batches"]["create"]>[0]);
  escribirJson(join(CACHE, `_lote-${b.id}.json`), {
    id: b.id,
    enviados: docs.length,
    estimado_usd: estimado,
    fecha: new Date().toISOString(),
  });
  console.log(`Lote ${b.id}: ${b.processing_status}`);
}

async function recoger(idLote: string) {
  const c = clienteCorpus();
  const b = await c.messages.batches.retrieve(idLote);
  console.log(`Lote ${idLote}: ${b.processing_status}`, b.request_counts);
  if (b.processing_status !== "ended") return;
  let costo = 0;
  let errores = 0;
  for await (const r of await c.messages.batches.results(idLote)) {
    if (r.result.type !== "succeeded") {
      errores++;
      console.log(`${r.custom_id}: ${r.result.type}`);
      continue;
    }
    try {
      const l = lecturaDeMensaje<SalidaNarracion>(
        r.result.message as unknown as Parameters<typeof lecturaDeMensaje>[0],
        true,
      );
      costo += l.costoUsd;
      guardar(r.custom_id, l, true);
    } catch (e) {
      errores++;
      console.log(`${r.custom_id}: ${(e as Error).message}`);
    }
  }
  console.log(`Recogidos; ${errores} con error; ${costo.toFixed(4)} USD`);
}

function armar() {
  const docs = documentos();
  const prueba = new Set(
    (JSON.parse(readFileSync(join(CORPUS, "particion.json"), "utf8")) as { prueba: string[] })
      .prueba,
  );
  const filas: Narracion[] = [];
  /** Lo que el modelo concluyó antes de revisar las citas (para saber por qué falta). */
  const concluyoElModelo = new Map<string, boolean>();
  const sinLeer: string[] = [];
  let costo = 0;
  let costoLote = 0;
  for (const d of docs) {
    const c = cacheado(d.id);
    if (!c) {
      sinLeer.push(d.id);
      continue;
    }
    costo += c.costo_usd;
    if (c.lote) costoLote += c.costo_usd;
    filas.push(narracionDeSalida(c.salida, d));
    const k0 = c.salida.conclusiones;
    concluyoElModelo.set(
      d.id,
      k0.modalidad !== "sin_dato" || k0.zonas_contacto.length > 0 || k0.secuencia.length > 0,
    );
  }
  writeFileSync(
    join(CORPUS, "narraciones.jsonl"),
    filas
      .map((f) => JSON.stringify({ ...f, version_prompt: VERSION_PROMPT_NARRACION }))
      .join("\n") + "\n",
  );
  const suma = (k: keyof Narracion["conteos"]) => filas.reduce((a, f) => a + f.conteos[k], 0);
  const conFuga = filas.filter((f) => f.fugas.length);
  const porPatron = Object.fromEntries(
    PATRONES_FUGA.map((p) => [p.nombre, filas.filter((f) => f.fugas.includes(p.nombre)).length]),
  );
  const limpias = (ids: Set<string> | null) =>
    filas.filter((f) => (ids ? ids.has(f.id) : true) && !f.fugas.length && !f.solo_conclusiones)
      .length;
  const restosPii = filas.filter((f) => redactar(f.descripcion) !== f.descripcion).length;
  const k = (f: Narracion) => f.conclusiones;
  const concluye = (f: Narracion) =>
    k(f).modalidad !== null || k(f).zonas_contacto.length > 0 || k(f).secuencia.length > 0;
  const resultado = {
    fecha: new Date().toISOString(),
    version_prompt: VERSION_PROMPT_NARRACION,
    modelo: MODELO_CORPUS,
    dictamenes: docs.length,
    leidos: filas.length,
    sin_leer: sinLeer.length,
    fuga: {
      con_fuga: conFuga.length,
      proporcion: filas.length ? Number((conFuga.length / filas.length).toFixed(4)) : null,
      por_patron: porPatron,
      ids: conFuga.map((f) => ({ id: f.id, fugas: f.fugas })),
    },
    solo_conclusiones: filas.filter((f) => f.solo_conclusiones).map((f) => f.id),
    descripcion_limpia: limpias(null),
    prueba_congelada: {
      dictamenes: prueba.size,
      leidos: filas.filter((f) => prueba.has(f.id)).length,
      solo_conclusiones: filas.filter((f) => prueba.has(f.id) && f.solo_conclusiones).length,
      descripcion_limpia: limpias(prueba),
      con_conclusiones: filas.filter((f) => prueba.has(f.id) && concluye(f)).length,
      // Sin modalidad, zonas ni secuencia: o el dictamen no concluye ninguna (el modelo dijo
      // «sin_dato»), o las citas no se pudieron verificar contra el texto (OCR revuelto).
      sin_conclusiones: filas
        .filter((f) => prueba.has(f.id) && !concluye(f))
        .map((f) => ({
          id: f.id,
          motivo: concluyoElModelo.get(f.id) ? "citas_no_verificables" : "el_dictamen_no_concluye",
        })),
    },
    citas: { total: suma("citas"), fuera_del_texto: suma("citas_fuera") },
    velocidades: { total: suma("velocidades"), descartadas: suma("velocidades_fuera") },
    conclusiones: {
      con_modalidad: filas.filter((f) => k(f).modalidad !== null).length,
      con_zonas_contacto: filas.filter((f) => k(f).zonas_contacto.length).length,
      con_secuencia: filas.filter((f) => k(f).secuencia.length).length,
      con_velocidades: filas.filter((f) => k(f).velocidades.length).length,
      con_posiciones_finales: filas.filter((f) => k(f).posiciones_finales.length).length,
    },
    datos_personales_tras_redactar: restosPii,
    costo_usd: Number(costo.toFixed(4)),
    costo_lote_usd: Number(costoLote.toFixed(4)),
  };
  escribirJson(join(RESULTADOS, "cesvi_narraciones.json"), resultado);
  console.log(
    `${filas.length}/${docs.length} leídos; con fuga ${conFuga.length}; prueba limpia ${resultado.prueba_congelada.descripcion_limpia}/${prueba.size}; ${costo.toFixed(4)} USD`,
  );
}

const [orden, arg] = process.argv.slice(2);
switch (orden) {
  case "estimar":
    await estimar();
    break;
  case "piloto":
    await piloto(Number(arg ?? 5));
    break;
  case "lote":
    await lote(Number(arg ?? 30));
    break;
  case "recoger":
    await recoger(arg!);
    break;
  case "armar":
    armar();
    break;
  default:
    console.error("Uso: narracion.mts estimar | piloto <n> | lote [tope] | recoger <id> | armar");
    process.exit(1);
}
