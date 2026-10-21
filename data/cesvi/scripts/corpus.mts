/**
 * El corpus estructurado de los 671 dictámenes de CESVI (C0, docs/cesvi/PLAN-CESVI.md §3).
 *
 * Lee los lotes crudos de `data/raw/cesvi/` (fuera de git) y guarda cada lectura de Claude en
 * `data/raw/cesvi/corpus-cache/<id>.json` (fuera de git: trae citas sin redactar). Con la caché
 * arma el corpus versionado: los expedientes con citas redactadas, la partición congelada y la
 * medición.
 *
 * Uso (desde la raíz, con la llave en el entorno: `set -a; . ./.env.local; set +a`):
 *   pnpm --filter @croquis/cesvi corpus estimar           tokens de entrada de todos (conteo gratis)
 *   pnpm --filter @croquis/cesvi corpus piloto <n>        n dictámenes con la API normal
 *   pnpm --filter @croquis/cesvi corpus lote [tope_usd]   los que faltan, con la API de lotes
 *   pnpm --filter @croquis/cesvi corpus recoger <id>      trae a la caché los resultados de un lote
 *   pnpm --filter @croquis/cesvi corpus armar             corpus, partición y medición (sin API)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../../../packages/extraction/src/index";
import {
  dividirLote,
  expedienteDeSalida,
  particionPrueba,
  problemasExpediente,
  redactar,
  VERSION_PROMPT_CORPUS,
  type Conteos,
  type DocumentoCrudo,
  type Expediente,
  type SalidaCorpus,
} from "../../../packages/cesvi/src/corpus";
import {
  clienteCorpus,
  costoCorpus,
  lecturaDeMensaje,
  leerDictamen,
  MODELO_CORPUS,
  pedidoCorpus,
  tokensDeEntrada,
  type UsoTokens,
} from "../../../packages/cesvi/src/server/corpus";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CRUDOS = join(RAIZ, "data/raw/cesvi");
const CACHE = join(CRUDOS, "corpus-cache");
const CORPUS = join(RAIZ, "data/cesvi/corpus");
const RESULTADOS = join(RAIZ, "eval/results");
const SEMILLA = 20261021;

interface Cacheado {
  id: string;
  version_prompt: string;
  modelo: string;
  lote: boolean;
  fecha: string;
  uso: UsoTokens;
  costo_usd: number;
  salida?: SalidaCorpus;
  error?: string;
}

const escribirJson = (p: string, d: unknown) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(d, null, 2)}\n`);
};

function documentos(): DocumentoCrudo[] {
  const docs = readdirSync(CRUDOS)
    .filter((f) => /^crash_reports_batch_\d+\.md$/.test(f))
    .sort()
    .flatMap((f) => dividirLote(readFileSync(join(CRUDOS, f), "utf8")));
  const ids = new Set(docs.map((d) => d.id));
  if (ids.size !== docs.length) throw new Error("Hay dos dictámenes con el mismo archivo.");
  return docs;
}

const rutaCache = (id: string) => join(CACHE, `${id}.json`);
function cacheado(id: string): Cacheado | null {
  if (!existsSync(rutaCache(id))) return null;
  const c = JSON.parse(readFileSync(rutaCache(id), "utf8")) as Cacheado;
  return c.version_prompt === VERSION_PROMPT_CORPUS && c.salida ? c : null;
}

const cliente = clienteCorpus;

async function enParalelo<T, R>(xs: T[], n: number, f: (x: T, i: number) => Promise<R>) {
  const out: R[] = new Array<R>(xs.length);
  let k = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (k < xs.length) {
        const i = k++;
        out[i] = await f(xs[i]!, i);
      }
    }),
  );
  return out;
}

async function estimar() {
  const docs = documentos();
  const c = cliente();
  const sistema = await tokensDeEntrada("", c);
  const tokens = await enParalelo(docs, 4, async (d) => tokensDeEntrada(d.texto, c));
  const total = tokens.reduce((a, b) => a + b, 0);
  const ordenados = [...tokens].sort((a, b) => a - b);
  const r = {
    fecha: new Date().toISOString(),
    modelo: MODELO_CORPUS,
    version_prompt: VERSION_PROMPT_CORPUS,
    dictamenes: docs.length,
    tokens_sistema: sistema,
    tokens_entrada_total: total,
    tokens_entrada_mediana: ordenados[Math.floor(ordenados.length / 2)],
    tokens_entrada_max: ordenados.at(-1),
    por_documento: Object.fromEntries(docs.map((d, i) => [d.id, tokens[i]])),
  };
  escribirJson(join(CACHE, "_tokens.json"), r);
  console.log(
    `${docs.length} dictámenes: ${total} tokens de entrada (sistema ${sistema}; mediana ${r.tokens_entrada_mediana}, máx. ${r.tokens_entrada_max})`,
  );
}

/** Los n del piloto: los primeros por el SHA-256 de `piloto:<id>`. */
function delPiloto(docs: DocumentoCrudo[], n: number): DocumentoCrudo[] {
  return [...docs]
    .sort((a, b) => (sha256Hex(`piloto:${a.id}`) < sha256Hex(`piloto:${b.id}`) ? -1 : 1))
    .slice(0, n);
}

async function piloto(n: number) {
  const docs = delPiloto(documentos(), n);
  const c = cliente();
  let costo = 0;
  for (const d of docs) {
    if (cacheado(d.id)) {
      console.log(`${d.id}: ya en caché`);
      continue;
    }
    const t0 = Date.now();
    try {
      const l = await leerDictamen(d.texto, c);
      costo += l.costoUsd;
      escribirJson(rutaCache(d.id), {
        id: d.id,
        version_prompt: VERSION_PROMPT_CORPUS,
        modelo: l.modeloRespuesta,
        lote: false,
        fecha: new Date().toISOString(),
        uso: l.uso,
        costo_usd: l.costoUsd,
        salida: l.salida,
      } satisfies Cacheado);
      console.log(
        `${d.id}: entrada ${l.uso.input_tokens}+${l.uso.cache_creation_input_tokens}w+${l.uso.cache_read_input_tokens}r, salida ${l.uso.output_tokens}, ${l.costoUsd.toFixed(4)} USD, ${((Date.now() - t0) / 1000).toFixed(0)} s`,
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
    .map((f) => JSON.parse(readFileSync(join(CACHE, f), "utf8")) as Cacheado)
    .filter((x) => x.salida);
  // Estimado: salida por token de entrada medida en lo ya leído, a precio de lote, sin caché.
  const razon =
    leidos.reduce((a, x) => a + x.uso.output_tokens, 0) /
    leidos.reduce(
      (a, x) =>
        a + x.uso.input_tokens + x.uso.cache_creation_input_tokens + x.uso.cache_read_input_tokens,
      0,
    );
  const entrada = docs.reduce((a, d) => a + (tokens.por_documento[d.id] ?? 0), 0);
  const estimado = costoCorpus(
    MODELO_CORPUS,
    {
      input_tokens: entrada,
      output_tokens: Math.round(entrada * razon),
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    true,
  );
  console.log(
    `${docs.length} por leer: ~${estimado.toFixed(2)} USD estimados (tope ${topeUsd} USD)`,
  );
  if (estimado > topeUsd) throw new Error("El estimado pasa el tope: no se envía.");
  const b = await cliente().messages.batches.create({
    requests: docs.map((d) => ({ custom_id: d.id, params: pedidoCorpus(d.texto) })),
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
  const c = cliente();
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
      const l = lecturaDeMensaje(
        r.result.message as unknown as Parameters<typeof lecturaDeMensaje>[0],
        true,
      );
      costo += l.costoUsd;
      escribirJson(rutaCache(r.custom_id), {
        id: r.custom_id,
        version_prompt: VERSION_PROMPT_CORPUS,
        modelo: l.modeloRespuesta,
        lote: true,
        fecha: new Date().toISOString(),
        uso: l.uso,
        costo_usd: l.costoUsd,
        salida: l.salida,
      } satisfies Cacheado);
    } catch (e) {
      errores++;
      console.log(`${r.custom_id}: ${(e as Error).message}`);
    }
  }
  console.log(`Recogidos; ${errores} con error; ${costo.toFixed(4)} USD`);
}

/** Textos libres del expediente que siguen con un dato personal después de redactar. */
function restosDePii(e: Expediente): number {
  let n = 0;
  const visitar = (v: unknown, clave: string) => {
    if (typeof v === "string") {
      // La marca y el modelo no se redactan (no son datos personales; ver `redactar`).
      if (
        ![
          "veredicto",
          "fuente",
          "metodo",
          "criterio",
          "estado",
          "tipo",
          "cara",
          "tercio",
          "vertice",
          "marca",
          "modelo",
        ].includes(clave)
      ) {
        n += redactar(v) === v ? 0 : 1;
      }
    } else if (Array.isArray(v)) v.forEach((x) => visitar(x, clave));
    // El «valor» de un dato se revisa con la clave del dato (p. ej. marca → valor).
    else if (v && typeof v === "object")
      Object.entries(v).forEach(([k, x]) => visitar(x, k === "valor" ? clave : k));
  };
  visitar(e, "");
  return n;
}

function armar() {
  const docs = documentos();
  const filas: {
    id: string;
    expediente: Expediente;
    problemas: string[];
    conteos: Conteos;
  }[] = [];
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
    const { expediente, conteos } = expedienteDeSalida(c.salida!, d.texto);
    filas.push({ id: d.id, expediente, problemas: problemasExpediente(expediente), conteos });
  }
  const validos = filas.filter((f) => f.problemas.length === 0);
  const pii = filas.reduce((a, f) => a + restosDePii(f.expediente), 0);

  mkdirSync(CORPUS, { recursive: true });
  writeFileSync(
    join(CORPUS, "expedientes.jsonl"),
    filas
      .map((f) =>
        JSON.stringify({
          id: f.id,
          version_prompt: VERSION_PROMPT_CORPUS,
          expediente: f.expediente,
          problemas: f.problemas,
          conteos: f.conteos,
        }),
      )
      .join("\n") + "\n",
  );

  // Partición: se congela la primera vez que el corpus está completo y no se vuelve a escribir.
  const rutaParticion = join(CORPUS, "particion.json");
  let particion: { prueba: string[]; sha256: string } | null = existsSync(rutaParticion)
    ? (JSON.parse(readFileSync(rutaParticion, "utf8")) as { prueba: string[]; sha256: string })
    : null;
  if (particion) {
    if (sha256Hex(particion.prueba.join("\n")) !== particion.sha256) {
      throw new Error("La partición congelada no coincide con su huella.");
    }
  } else if (sinLeer.length === 0) {
    const prueba = particionPrueba(
      filas.map((f) => ({
        id: f.id,
        modalidad: f.expediente.caso.modalidades[0] ?? "otra",
        veredicto: f.expediente.resultado?.conclusion?.veredicto ?? "sin_juicio",
      })),
      SEMILLA,
    );
    particion = { prueba, sha256: sha256Hex(prueba.join("\n")) };
    escribirJson(rutaParticion, {
      descripcion:
        "Partición congelada del corpus de CESVI (C0): 30 % de prueba, estratificada por modalidad principal y conclusión. No se mira para ajustar nada; no se reescribe.",
      semilla: SEMILLA,
      fraccion: 0.3,
      congelada: new Date().toISOString(),
      ...particion,
    });
  }

  const cuenta = (xs: string[]) =>
    Object.fromEntries([...new Set(xs)].sort().map((k) => [k, xs.filter((x) => x === k).length]));
  const suma = (k: keyof Conteos) => filas.reduce((a, f) => a + f.conteos[k], 0);
  const proporcion = (n: number, d: number) => (d ? Number((n / d).toFixed(4)) : null);
  const conVehiculos = (min: number) =>
    validos.filter((f) => f.expediente.vehiculos.length >= min).length;
  const resultado = {
    fecha: new Date().toISOString(),
    version_prompt: VERSION_PROMPT_CORPUS,
    modelo: MODELO_CORPUS,
    dictamenes: docs.length,
    leidos: filas.length,
    sin_leer: sinLeer.length,
    validos: validos.length,
    proporcion_validos: proporcion(validos.length, filas.length),
    invalidos: filas
      .filter((f) => f.problemas.length)
      .map((f) => ({ id: f.id, motivos: f.problemas })),
    filas: { total: suma("filas"), valores_invalidos: suma("valores_invalidos") },
    citas: {
      total: suma("citas"),
      fuera_del_texto: suma("citas_fuera"),
      proporcion_fuera: proporcion(suma("citas_fuera"), suma("citas")),
    },
    numeros: {
      total: suma("numeros"),
      fuera_de_su_cita: suma("numeros_fuera"),
      proporcion_fuera: proporcion(suma("numeros_fuera"), suma("numeros")),
    },
    datos_personales_tras_redactar: pii,
    costo_usd: Number(costo.toFixed(4)),
    costo_lote_usd: Number(costoLote.toFixed(4)),
    particion: particion
      ? { prueba: particion.prueba.length, desarrollo: filas.length - particion.prueba.length }
      : null,
    // Medido sobre los expedientes válidos (PLAN-CESVI §2).
    estructura: {
      modalidad_principal: cuenta(
        validos.map((f) => f.expediente.caso.modalidades[0] ?? "sin_modalidad"),
      ),
      conclusion: cuenta(
        validos.map((f) => f.expediente.resultado?.conclusion?.veredicto ?? "sin_conclusion"),
      ),
      tres_o_mas_vehiculos: {
        dictamenes: conVehiculos(3),
        proporcion: proporcion(conVehiculos(3), validos.length),
      },
      mas_de_un_impacto: (() => {
        const n = validos.filter((f) => (f.expediente.impactos ?? []).length > 1).length;
        return { dictamenes: n, proporcion: proporcion(n, validos.length) };
      })(),
      con_declaracion: (() => {
        const n = validos.filter((f) =>
          (f.expediente.versiones ?? []).some((v) => v.tipo === "declarada"),
        ).length;
        return { dictamenes: n, proporcion: proporcion(n, validos.length) };
      })(),
      metodo_de_calculo: cuenta(
        validos.flatMap((f) => [...new Set((f.expediente.calculos ?? []).map((c) => c.metodo))]),
      ),
      criterio_analizado: cuenta(
        validos.flatMap((f) => [...new Set((f.expediente.criterios ?? []).map((c) => c.criterio))]),
      ),
    },
  };
  escribirJson(join(RESULTADOS, "cesvi_corpus_extraccion.json"), resultado);
  console.log(
    `${filas.length}/${docs.length} leídos; ${validos.length} válidos; citas fuera ${resultado.citas.proporcion_fuera}; números fuera ${resultado.numeros.proporcion_fuera}; datos personales tras redactar: ${pii}; ${costo.toFixed(4)} USD`,
  );
}

const [orden, arg] = process.argv.slice(2);
mkdirSync(CACHE, { recursive: true });
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
    if (!arg) throw new Error("Falta el id del lote.");
    await recoger(arg);
    break;
  case "armar":
    armar();
    break;
  default:
    console.error("Uso: corpus estimar | piloto <n> | lote [tope_usd] | recoger <id> | armar");
    process.exit(1);
}
