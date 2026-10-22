/**
 * E-R4 (docs/cesvi/PLAN-CESVI.md, R4): ¿Croquis llega a lo que concluyó CESVI?
 *
 * A Croquis se le da solo la narración sin conclusiones de cada dictamen (R0,
 * `data/cesvi/corpus/narraciones.jsonl`). Claude la lee a escena como en «Caso nuevo» (la lectura
 * de R1) y Croquis la reconstruye y la verifica. Lo que obtiene se compara con lo que concluyó
 * CESVI (R0): modalidad, zonas de contacto, secuencia de impactos, velocidades y posiciones finales,
 * contra las líneas base del plan (`packages/cesvi/src/reproduccion.ts`).
 *
 * Desarrollo antes que prueba: las reglas se ajustan con una muestra de desarrollo
 * (`desarrollo`); la prueba congelada (`prueba`, 205) se lee y se mide una sola vez, con las reglas
 * ya en un commit.
 *
 * Las lecturas (de narraciones ya redactadas) se guardan en `data/cesvi/r4/lecturas.jsonl` para
 * medir sin API; los lotes enviados, en `data/raw/cesvi/r4/` (fuera de git).
 *
 * Uso (desde packages/cesvi; con la llave en el entorno para estimar, lote y recoger):
 *   pnpm exec tsx ../../eval/cesvi_r4_reproduccion.mts estimar <desarrollo|prueba>
 *   pnpm exec tsx ../../eval/cesvi_r4_reproduccion.mts lote <desarrollo|prueba> <tope_usd>
 *   pnpm exec tsx ../../eval/cesvi_r4_reproduccion.mts recoger <id_lote>
 *   pnpm exec tsx ../../eval/cesvi_r4_reproduccion.mts medir <desarrollo|prueba>
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../packages/extraction/src/index";
import { ESQUEMA_CORPUS, type SalidaCorpus } from "../packages/cesvi/src/corpus";
import {
  comparar,
  lineasBase,
  resumen,
  type Conclusiones,
} from "../packages/cesvi/src/dictamenes-r4";
import {
  escenaDeNarracion,
  mensajeEscena,
  SISTEMA_ESCENA,
  VERSION_PROMPT_ESCENA,
} from "../packages/cesvi/src/escena-narracion";
import { especReconstruida, reconstruirExpediente } from "../packages/cesvi/src/reconstruccion";
import { validateEscena, validateResultado } from "../packages/scene-schema/src/index";
import {
  clienteCorpus,
  costoCorpus,
  lecturaDeMensaje,
  MODELO_CORPUS,
  pedidoLectura,
  tokensDePedido,
  type UsoTokens,
} from "../packages/cesvi/src/server/corpus";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(RAIZ, "data/cesvi/corpus");
const LECTURAS = join(RAIZ, "data/cesvi/r4/lecturas.jsonl");
const LOTES = join(RAIZ, "data/raw/cesvi/r4");
/** Los datos de la página «Reproducción de dictámenes» (solo los de la prueba que se reconstruyen). */
const PAGINA = join(RAIZ, "data/cesvi/r4/pagina.json");
const GRABACIONES_R1 = join(RAIZ, "data/cesvi/grabaciones/escenas");
/** Tamaño de la muestra de desarrollo para ajustar las reglas. */
const N_DESARROLLO = 80;

type Particion = "desarrollo" | "prueba";

interface Narracion {
  id: string;
  descripcion: string;
  fugas: string[];
  solo_conclusiones: boolean;
  conclusiones: Conclusiones;
}

export interface Lectura {
  id: string;
  particion: Particion;
  version_prompt: string;
  modelo: string;
  uso: UsoTokens;
  costo_usd: number;
  salida: SalidaCorpus;
}

const jsonl = <T,>(p: string): T[] =>
  existsSync(p)
    ? readFileSync(p, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as T)
    : [];

export function narraciones(): Narracion[] {
  return jsonl<Narracion>(join(CORPUS, "narraciones.jsonl"));
}

export function idsPrueba(): Set<string> {
  return new Set(
    (JSON.parse(readFileSync(join(CORPUS, "particion.json"), "utf8")) as { prueba: string[] })
      .prueba,
  );
}

/**
 * Los dictámenes de una partición que se leen.
 * - Desarrollo: los primeros N, en el orden del SHA-256 de `r4:<id>`, con modalidad concluida.
 * - Prueba: los 205 de la prueba congelada, todos.
 * En los dos casos, sin fuga y sin los que solo traen conclusiones.
 */
export function muestra(p: Particion): Narracion[] {
  const prueba = idsPrueba();
  const limpias = narraciones().filter((n) => !n.fugas.length && !n.solo_conclusiones);
  if (p === "prueba") return limpias.filter((n) => prueba.has(n.id));
  return limpias
    .filter((n) => !prueba.has(n.id) && n.conclusiones.modalidad)
    .sort((a, b) => (sha256Hex(`r4:${a.id}`) < sha256Hex(`r4:${b.id}`) ? -1 : 1))
    .slice(0, N_DESARROLLO);
}

export function lecturas(): Map<string, Lectura> {
  return new Map(jsonl<Lectura>(LECTURAS).map((l) => [l.id, l]));
}

function guardarLecturas(m: Map<string, Lectura>) {
  mkdirSync(dirname(LECTURAS), { recursive: true });
  const filas = [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(LECTURAS, `${filas.map((l) => JSON.stringify(l)).join("\n")}\n`);
}

const pedido = (n: Narracion) =>
  pedidoLectura(
    SISTEMA_ESCENA,
    mensajeEscena(n.descripcion),
    ESQUEMA_CORPUS as unknown as Record<string, unknown>,
  );

function pendientes(p: Particion): Narracion[] {
  const hechas = lecturas();
  return muestra(p).filter((n) => hechas.get(n.id)?.version_prompt !== VERSION_PROMPT_ESCENA);
}

/** La salida media de las lecturas de R1 (las mismas peticiones), para el estimado. */
function salidaMedia(): number {
  const usos = readdirSync(GRABACIONES_R1)
    .filter((f) => f.endsWith(".json"))
    .map(
      (f) => (JSON.parse(readFileSync(join(GRABACIONES_R1, f), "utf8")) as { uso: UsoTokens }).uso,
    );
  return usos.reduce((a, u) => a + u.output_tokens, 0) / usos.length;
}

async function estimar(p: Particion): Promise<number> {
  const c = clienteCorpus();
  const ns = pendientes(p);
  let entrada = 0;
  for (const n of ns) entrada += await tokensDePedido(pedido(n), c);
  const salida = Math.round(salidaMedia() * ns.length);
  const usd = costoCorpus(
    MODELO_CORPUS,
    {
      input_tokens: entrada,
      output_tokens: salida,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    true,
  );
  console.log(
    `${p}: ${ns.length} por leer; ${entrada} tokens de entrada y ~${salida} de salida (media de R1): ~${usd.toFixed(2)} USD con lotes, sin caché`,
  );
  return usd;
}

async function lote(p: Particion, topeUsd: number) {
  const ns = pendientes(p);
  if (!ns.length) return console.log(`${p}: nada por leer.`);
  const usd = await estimar(p);
  if (usd > topeUsd)
    throw new Error(`El estimado (${usd.toFixed(2)} USD) pasa el tope: no se envía.`);
  const b = await clienteCorpus().messages.batches.create({
    requests: ns.map((n) => ({ custom_id: n.id, params: pedido(n) })),
  } as Parameters<ReturnType<typeof clienteCorpus>["messages"]["batches"]["create"]>[0]);
  mkdirSync(LOTES, { recursive: true });
  writeFileSync(
    join(LOTES, `lote-${b.id}.json`),
    `${JSON.stringify({ id: b.id, particion: p, enviados: ns.length, estimado_usd: usd, fecha: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`Lote ${b.id} (${p}, ${ns.length}): ${b.processing_status}`);
}

async function recoger(idLote: string) {
  const info = JSON.parse(readFileSync(join(LOTES, `lote-${idLote}.json`), "utf8")) as {
    particion: Particion;
  };
  const c = clienteCorpus();
  const b = await c.messages.batches.retrieve(idLote);
  console.log(`Lote ${idLote}: ${b.processing_status}`, b.request_counts);
  if (b.processing_status !== "ended") return;
  const m = lecturas();
  let costo = 0;
  let errores = 0;
  for await (const r of await c.messages.batches.results(idLote)) {
    if (r.result.type !== "succeeded") {
      errores++;
      console.log(`${r.custom_id}: ${r.result.type}`);
      continue;
    }
    try {
      const l = lecturaDeMensaje<SalidaCorpus>(
        r.result.message as unknown as Parameters<typeof lecturaDeMensaje>[0],
        true,
      );
      costo += l.costoUsd;
      m.set(r.custom_id, {
        id: r.custom_id,
        particion: info.particion,
        version_prompt: VERSION_PROMPT_ESCENA,
        modelo: l.modeloRespuesta,
        uso: l.uso,
        costo_usd: l.costoUsd,
        salida: l.salida,
      });
    } catch (e) {
      errores++;
      console.log(`${r.custom_id}: ${(e as Error).message}`);
    }
  }
  guardarLecturas(m);
  console.log(`Recogidas; ${errores} con error; ${costo.toFixed(4)} USD`);
}

/**
 * Mide una partición con las lecturas guardadas (sin API). En la prueba también reconstruye cada
 * escena con el solver de producción: los casos que se reconstruyen son los de la página
 * «Reproducción de dictámenes».
 */
function medir(p: Particion) {
  const hechas = lecturas();
  const prueba = idsPrueba();
  const base = lineasBase(
    narraciones()
      .filter((n) => !prueba.has(n.id) && !n.solo_conclusiones)
      .map((n) => n.conclusiones),
  );
  const casos = muestra(p);
  const sinLeer = casos.filter((n) => !hechas.has(n.id)).map((n) => n.id);
  const filas = casos
    .filter((n) => hechas.has(n.id))
    .map((n) => {
      const l = hechas.get(n.id)!;
      const escena = escenaDeNarracion(l.salida, n.descripcion);
      const comparacion = comparar(
        n.conclusiones,
        escena.expediente,
        escena.posiciones,
        n.descripcion,
      );
      let reconstruccion: { reconstruida: boolean; en_3d: boolean; ms: number } | null = null;
      if (p === "prueba") {
        const t0 = performance.now();
        try {
          const r = reconstruirExpediente(escena.expediente, n.id);
          const vs = (r.resultado.vehiculos ?? []) as { trayectoria?: { t?: unknown[] } }[];
          reconstruccion = {
            reconstruida: vs.length > 0 && vs.every((v) => (v.trayectoria?.t ?? []).length > 1),
            en_3d: validateResultado(r.resultado).ok && validateEscena(especReconstruida(r)).ok,
            ms: Math.round(performance.now() - t0),
          };
        } catch {
          reconstruccion = {
            reconstruida: false,
            en_3d: false,
            ms: Math.round(performance.now() - t0),
          };
        }
      }
      return {
        id: n.id,
        escena_valida: escena.problemas.length === 0,
        conclusiones: n.conclusiones,
        comparacion,
        reconstruccion,
        costo_usd: l.costo_usd,
        narracion: n.descripcion,
        expediente: escena.expediente,
        posiciones: escena.posiciones,
      };
    });
  const r = resumen(filas, base);
  const reconstruidas = filas.filter(
    (f) => f.reconstruccion?.reconstruida && f.reconstruccion.en_3d,
  );
  const out = {
    fecha: new Date().toISOString(),
    particion: p,
    descripcion:
      "E-R4: a Croquis se le da solo la narración sin conclusiones (R0); Claude la lee a escena como en «Caso nuevo» (R1) y Croquis la compara con lo que concluyó CESVI (R0). Líneas base: la modalidad más frecuente y la velocidad promedio por deformación, de desarrollo.",
    version_prompt: VERSION_PROMPT_ESCENA,
    lineas_base: base,
    leidos: filas.length,
    sin_leer: sinLeer,
    escenas_validas: filas.filter((f) => f.escena_valida).length,
    ...(p === "prueba"
      ? {
          reconstruidas_en_3d: reconstruidas.length,
          ms_mediana: [...filas.map((f) => f.reconstruccion?.ms ?? 0)].sort((a, b) => a - b)[
            Math.floor(filas.length / 2)
          ],
        }
      : {}),
    costo_lecturas_usd: Number(filas.reduce((a, f) => a + f.costo_usd, 0).toFixed(4)),
    resumen: r,
    detalle: filas.map(
      ({ conclusiones: _c, narracion: _n, expediente: _e, posiciones: _p, ...f }) => f,
    ),
  };
  writeFileSync(
    join(RAIZ, `eval/results/cesvi_r4_reproduccion_${p}.json`),
    `${JSON.stringify(out, null, 1)}\n`,
  );
  if (p === "prueba") {
    // La página «Reproducción de dictámenes»: los casos de la prueba que Croquis reconstruye, con lo
    // que concluyó CESVI, la escena que leyó Croquis y la comparación.
    const pagina = {
      fuente: "eval/cesvi_r4_reproduccion.mts medir prueba",
      fecha: out.fecha,
      dictamenes: filas.length,
      resumen: r,
      lineas_base: base,
      casos: reconstruidas.map((f) => ({
        id: f.id,
        narracion: f.narracion,
        conclusiones: f.conclusiones,
        comparacion: f.comparacion,
        expediente: f.expediente,
        posiciones: f.posiciones,
      })),
    };
    writeFileSync(PAGINA, `${JSON.stringify(pagina)}\n`);
    console.log(`Página: ${pagina.casos.length} casos en ${PAGINA}`);
  }
  console.log(JSON.stringify({ particion: p, leidos: out.leidos, resumen: r }, null, 1));
}

const [modo, arg, arg2] = process.argv.slice(2);
const particion = (arg === "prueba" ? "prueba" : "desarrollo") as Particion;
if (modo === "estimar") await estimar(particion);
else if (modo === "lote") await lote(particion, Number(arg2));
else if (modo === "recoger") await recoger(arg!);
else if (modo === "medir") medir(particion);
else console.error("Uso: estimar | lote <particion> <tope> | recoger <lote> | medir <particion>");
