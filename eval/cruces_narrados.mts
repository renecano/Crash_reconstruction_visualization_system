/**
 * El cruce narrado, antes y después del arreglo del #388 (René, 2026-11-27): en cuántos de los 205
 * reportes de prueba y de las 42 narraciones de la revisión la narración nombra un cruce («X y Y»,
 * «X esquina con Y», «el cruce de X con Y»), y en cuántos el choque que propone La escena queda a más
 * de 30 m del cruce real.
 *
 * - **El cruce real:** los nodos que comparten las dos calles en OpenStreetMap, dentro de la caja del
 *   municipio del caso (Overpass, `crucesPorNombre`, todos). Si las calles se cruzan en varios lugares,
 *   la distancia es al más cercano de ellos: la medición dice si el choque cae en *un* cruce de las dos
 *   calles, no si es el del hecho (eso no lo sabe nadie más que el reporte). Es una cota optimista.
 * - **El lugar propuesto:** como La escena y la revisión de la cadena (`cadena.ts`): las consultas en
 *   orden, el primer resultado que no es una zona, «¿Dónde fue?» si el lugar no es claro, y
 *   `proponerChoque` con las calles de OSM alrededor.
 *   - `antes`: `lugar.ts` de `origin/main` (copiado por el script a `lugar-antes.ts`, que se borra al
 *     terminar) y la consulta extra con la primera calle sola.
 *   - `despues`: el código de esta rama; con varios cruces, La escena pregunta cuál.
 *
 * Usa las cachés de la revisión de la cadena (`data/raw/auditoria-cache/`): solo sale a la red lo que
 * falta, una consulta cada 1.2 s (la política de Nominatim). Los textos no salen de esta computadora:
 * el resultado guarda solo el id, las calles narradas y las distancias.
 *
 * Uso (desde la raíz):
 *   TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx eval/cruces_narrados.mts antes
 *   TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx eval/cruces_narrados.mts despues
 *   → eval/results/cruces_narrados_<modo>.json
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { distanciaM, escenaDeNarracion, separarLugarYSentido } from "../packages/cesvi/src/index";
import type { SalidaCorpus } from "../packages/cesvi/src/index";
import type { OverpassResponse } from "../packages/croquis-2d/src/index";
import { MemoryRateLimiter } from "../packages/extraction/src/server/rate-limit";
import {
  callesDe,
  carreteraNarrada,
  cruceNarrado,
  proponerChoque,
} from "../apps/web/src/lib/escena-facil";
import { callesDelCaso, lugarClaro } from "../apps/web/src/lib/lugar-claro";
import { osmAlrededor } from "../apps/web/src/lib/visor-unity/osm-alrededor";
import { crucesPorNombre } from "../apps/web/src/server/cruces";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODO = process.argv[2] === "despues" ? "despues" : "antes";
/** Los datos que no van en git (las cachés y las lecturas grabadas): de otro worktree, si se pide. */
const DATOS = resolve(process.env.CROQUIS_DATOS ?? RAIZ);
const CACHE = join(DATOS, "data/raw/auditoria-cache");
const HASTA = Number(process.env.CROQUIS_HASTA ?? Infinity);
const TOPE_M = 30;
const USER_AGENT = "Croquis/0.1 (evaluacion de cruces narrados)";

// --- La red, con las cachés de la revisión de la cadena ---------------------------------------------
let ultimaRed = 0;
const h24 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
const fetchGuardado = (async (input: URL | string, init?: RequestInit) => {
  const clave = init?.body ? `${String(input)} ${String(init.body)}` : String(input);
  const ruta = join(CACHE, "http", `${h24(clave)}.json`);
  if (existsSync(ruta))
    return new Response(readFileSync(ruta, "utf8"), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const espera = ultimaRed + 1200 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaRed = Date.now();
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
  const r = await fetch(input, { ...init, headers });
  if (r.status !== 200) return r;
  const texto = await r.text();
  const malo =
    init?.body &&
    (!/"elements"/.test(texto) || /"remark"\s*:\s*"[^"]*(?:error|timed out)/i.test(texto));
  if (!malo) {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, texto);
  }
  return new Response(texto, { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

function enDisco<T>(tipo: string, clave: unknown, f: () => Promise<T>): Promise<T> {
  const ruta = join(CACHE, tipo, `${h24(JSON.stringify(clave))}.json`);
  if (existsSync(ruta)) return Promise.resolve(JSON.parse(readFileSync(ruta, "utf8")) as T);
  return f().then((v) => {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, JSON.stringify(v));
    return v;
  });
}

// --- El código del lugar, el de antes o el de ahora ---------------------------------------------------
const ANTES = join(RAIZ, "apps/web/src/server/lugar-antes.ts");
if (MODO === "antes")
  writeFileSync(
    ANTES,
    execFileSync("git", ["show", "origin/main:apps/web/src/server/lugar.ts"], {
      cwd: RAIZ,
      encoding: "utf8",
    }),
  );
const modulo = (await import(
  pathToFileURL(MODO === "antes" ? ANTES : join(RAIZ, "apps/web/src/server/lugar.ts")).href
)) as typeof import("../apps/web/src/server/lugar");
const deps = {
  fetcher: fetchGuardado,
  cache: new modulo.MemoryLugarCache(),
  limiter: new MemoryRateLimiter(100000),
  pausa: () => Promise.resolve(),
};
const buscar = async (q: string, municipio?: string, estado?: string) =>
  modulo.buscarLugar(
    modulo.LugarIn.parse({ q, ...(municipio ? { municipio } : {}), ...(estado ? { estado } : {}) }),
    "eval",
    deps,
  );

// --- Los casos ----------------------------------------------------------------------------------------
interface Caso {
  id: string;
  fuente: "prueba" | "nuevas";
  narracion: string;
  salida: SalidaCorpus;
}
function casos(): Caso[] {
  const particion = JSON.parse(
    readFileSync(join(RAIZ, "data/cesvi/corpus/particion.json"), "utf8"),
  ) as { prueba: string[] };
  const textos = new Map(
    readFileSync(join(RAIZ, "data/cesvi/corpus/narraciones.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { id: string; descripcion: string })
      .map((x) => [x.id, x.descripcion]),
  );
  const prueba = particion.prueba.flatMap((id): Caso[] => {
    const ruta = join(DATOS, `data/raw/cesvi/corpus-cache/${id}.json`);
    const t = textos.get(id);
    if (!existsSync(ruta) || !t) return [];
    const c = JSON.parse(readFileSync(ruta, "utf8")) as { salida: SalidaCorpus };
    return [{ id, fuente: "prueba", narracion: t, salida: c.salida }];
  });
  const d = JSON.parse(
    readFileSync(join(RAIZ, "data/cesvi/narraciones-auditoria/narraciones.json"), "utf8"),
  ) as { narraciones: { id: string; texto: string }[] };
  const nuevas = d.narraciones.flatMap((n): Caso[] => {
    const ruta = join(RAIZ, `data/cesvi/grabaciones/auditoria/${n.id}.json`);
    if (!existsSync(ruta)) return [];
    const g = JSON.parse(readFileSync(ruta, "utf8")) as { salida: SalidaCorpus };
    return [{ id: n.id, fuente: "nuevas", narracion: n.texto, salida: g.salida }];
  });
  return [...prueba, ...nuevas];
}

/** La caja del municipio (Nominatim), para buscar los cruces reales. */
async function cajaDe(municipio: string, estado?: string) {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("q", [municipio, estado].filter(Boolean).join(", "));
  u.searchParams.set("limit", "3");
  u.searchParams.set("countrycodes", "mx");
  const r = await fetchGuardado(u);
  if (!r.ok) return null;
  const xs = (await r.json()) as {
    lat: string;
    lon: string;
    boundingbox?: [string, string, string, string];
  }[];
  const x = xs.find((y) => y.boundingbox);
  if (!x?.boundingbox) return null;
  const [sur, norte, oeste, este] = x.boundingbox.map(Number) as [number, number, number, number];
  // Una caja de más de ~1° (un estado entero) es demasiado para Overpass; se toma su centro ±0.25°.
  if (norte - sur > 1 || este - oeste > 1) {
    const la = Number(x.lat);
    const lo = Number(x.lon);
    return {
      caja: { sur: la - 0.25, norte: la + 0.25, oeste: lo - 0.25, este: lo + 0.25 },
      centro: { lat: la, lon: lo },
    };
  }
  return { caja: { sur, norte, oeste, este }, centro: { lat: Number(x.lat), lon: Number(x.lon) } };
}

// --- La medición --------------------------------------------------------------------------------------
interface Fila {
  id: string;
  fuente: string;
  calles: [string, string];
  /** Cuántos cruces reales tienen las dos calles en el municipio (null: Overpass no respondió). */
  cruces_reales: number | null;
  resultado: "propone" | "pregunta" | "sin_lugar";
  motivo?: string;
  /** m del choque propuesto al cruce real más cercano. */
  distancia_m?: number | null;
}
const filas: Fila[] = [];
const todos = casos();
let k = 0;
for (const c of todos.slice(0, HASTA)) {
  k++;
  let e0;
  try {
    e0 = escenaDeNarracion(c.salida, c.narracion).expediente;
  } catch {
    continue;
  }
  const lugarTexto = e0.caso.lugar?.descripcion?.valor ?? null;
  const municipio = e0.caso.lugar?.municipio?.valor;
  const estado = e0.caso.lugar?.estado?.valor;
  const cruce = cruceNarrado(c.narracion);
  const vias =
    cruce?.calles ??
    (lugarTexto
      ? modulo.viasDelCruce(separarLugarYSentido(lugarTexto).lugar ?? lugarTexto, municipio)
      : null);
  if (!vias) continue;
  const fila: Fila = {
    id: c.id,
    fuente: c.fuente,
    calles: vias,
    cruces_reales: null,
    resultado: "sin_lugar",
  };
  // Los cruces reales.
  const zona = municipio ? await cajaDe(municipio, estado).catch(() => null) : null;
  const reales = zona
    ? await crucesPorNombre(vias, zona.caja, zona.centro, fetchGuardado, Infinity)
    : null;
  fila.cruces_reales = reales ? reales.length : null;
  // El lugar, como La escena.
  const consultas = [
    separarLugarYSentido(lugarTexto).lugar,
    cruce ? `${cruce.calles[0]} y ${cruce.calles[1]}` : null,
    MODO === "antes" ? (cruce?.calles[0] ?? null) : null,
    carreteraNarrada(c.narracion),
  ].filter((x): x is string => Boolean(x?.trim()));
  let lugar: { lat: number; lon: number; nombre: string } | null = null;
  let aviso: string | null = null;
  for (const q of consultas) {
    const r = await buscar(q, municipio, estado).catch(() => null);
    const varios = (r?.resultados ?? []).filter((x) => x.precision === "cruce");
    if (MODO === "despues" && varios.length > 1) {
      fila.resultado = "pregunta";
      fila.motivo = `varios cruces (${varios.length})`;
      break;
    }
    if (r?.resultados.length && r.resultados[0]!.precision !== "zona") {
      lugar = r.resultados[0]!;
      aviso = r.aviso;
      break;
    }
  }
  if (lugar) {
    const osm = await enDisco<OverpassResponse>(
      "osm",
      { lat: lugar.lat.toFixed(5), lon: lugar.lon.toFixed(5) },
      () => osmAlrededor(lugar!.lat, lugar!.lon),
    ).catch(() => null);
    const calles = callesDe(osm);
    const claro = lugarClaro({
      narradas: callesDelCaso(c.narracion, lugarTexto),
      calles,
      aviso,
      encontrado: lugar.nombre,
    });
    if (!claro.clara) {
      fila.resultado = "pregunta";
      fila.motivo = "lugar dudoso";
    } else {
      const p = proponerChoque(calles, c.narracion, lugar);
      const punto = p?.punto ?? lugar;
      fila.resultado = "propone";
      fila.distancia_m = reales?.length
        ? Math.round(Math.min(...reales.map((x) => distanciaM(punto, x))))
        : null;
    }
  } else if (fila.resultado === "sin_lugar") fila.motivo = aviso ?? "sin lugar";
  filas.push(fila);
  console.log(
    `${k}/${todos.length} ${c.id}: ${fila.resultado}${fila.distancia_m !== undefined ? ` ${fila.distancia_m} m` : ""} (reales: ${fila.cruces_reales})`,
  );
}
if (MODO === "antes") rmSync(ANTES, { force: true });

const resumen = (fuente: string) => {
  const fs = filas.filter((f) => f.fuente === fuente);
  const propone = fs.filter((f) => f.resultado === "propone");
  const medibles = propone.filter((f) => typeof f.distancia_m === "number");
  return {
    nombran_un_cruce: fs.length,
    con_cruce_real_en_osm: fs.filter((f) => (f.cruces_reales ?? 0) > 0).length,
    osm_sin_el_cruce: fs.filter((f) => f.cruces_reales === 0).length,
    sin_medir_overpass_o_municipio: fs.filter((f) => f.cruces_reales === null).length,
    propone: propone.length,
    pregunta: fs.filter((f) => f.resultado === "pregunta").length,
    sin_lugar: fs.filter((f) => f.resultado === "sin_lugar").length,
    propone_medible: medibles.length,
    a_mas_de_30_m: medibles.filter((f) => f.distancia_m! > TOPE_M).length,
    a_30_m_o_menos: medibles.filter((f) => f.distancia_m! <= TOPE_M).length,
  };
};
const salida = {
  descripcion:
    "El cruce narrado (#388): cuántos casos nombran un cruce y en cuántos el choque propuesto queda a más de 30 m del cruce real de OSM (el más cercano de los cruces de las dos calles en el municipio).",
  script: "eval/cruces_narrados.mts",
  modo: MODO,
  fecha: new Date().toISOString().slice(0, 10),
  tope_m: TOPE_M,
  casos_revisados: todos.length,
  prueba: resumen("prueba"),
  nuevas: resumen("nuevas"),
  filas,
};
mkdirSync(join(RAIZ, "eval/results"), { recursive: true });
writeFileSync(
  join(RAIZ, `eval/results/cruces_narrados_${MODO}.json`),
  `${JSON.stringify(salida, null, 1)}\n`,
);
console.log(JSON.stringify({ prueba: salida.prueba, nuevas: salida.nuevas }, null, 1));
