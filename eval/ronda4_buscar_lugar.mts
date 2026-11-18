/**
 * Ronda 4, B5 (René, 2026-11-18): ¿«Buscar el lugar» cae en el municipio correcto?
 *
 * 30 lugares de reportes de CESVI de varios estados, de la partición de desarrollo de R4 (la prueba
 * congelada no se toca): el lugar, el municipio y la entidad tal como los leyó Croquis del reporte
 * (`data/cesvi/r4/lecturas.jsonl`). Uno por estado y el resto en el orden del SHA-256 de
 * `lugar:<id>`, para que la muestra sea fija.
 *
 * Cada lugar se busca como lo hace la app (`buscarLugar` de `apps/web/src/server/lugar.ts`), en dos
 * escenarios:
 * - **con el caso:** el texto del lugar, con el municipio y el estado que leyó Croquis;
 * - **escrito:** el caso no trae municipio ni estado y el perito escribe «lugar, municipio, estado».
 * Se ubica cada resultado con la búsqueda inversa de Nominatim (nivel municipio) y se compara con lo
 * que dice el reporte.
 *
 * - `antes`: el código de `main` (el primer resultado era a donde saltaba el mapa).
 * - `despues`: el código nuevo; cuenta el primer resultado y si el correcto está entre las opciones.
 *
 * Respeta la política de Nominatim: User-Agent de Croquis y nunca más de una consulta por segundo.
 *
 * Uso (desde la raíz):
 *   TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx eval/ronda4_buscar_lugar.mts antes
 *   → eval/results/ronda4_buscar_lugar_antes.json (o _despues)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buscarLugar,
  MemoryLugarCache,
  USER_AGENT,
  type ResultadoLugar,
} from "../apps/web/src/server/lugar";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODO = process.argv[2] === "despues" ? "despues" : "antes";
const N = 30;
const PAUSA_MS = 1500;

// --- La muestra ------------------------------------------------------------------------------------
interface Dato {
  seccion: string;
  campo: string;
  valor: string;
}
const lecturas = readFileSync(join(RAIZ, "data/cesvi/r4/lecturas.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as { id: string; particion: string; salida?: { datos?: Dato[] } });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const candidatos = lecturas
  .filter((r) => r.particion === "desarrollo")
  .map((r) => {
    const d = (r.salida?.datos ?? []).filter((x) => x.seccion === "caso");
    const g = (c: string) => d.find((x) => x.campo === c)?.valor?.trim();
    return { id: r.id, lugar: g("lugar"), municipio: g("municipio"), estado: g("entidad") };
  })
  .filter((x): x is { id: string; lugar: string; municipio: string; estado: string } =>
    Boolean(x.lugar && x.municipio && x.estado),
  )
  .sort((a, b) => sha(`lugar:${a.id}`).localeCompare(sha(`lugar:${b.id}`)));

/** El estado con un solo nombre: «México DF», «D.F.» y «Distrito Federal» son la Ciudad de México. */
export function estadoNormal(e: string): string {
  const n = sinAcentos(e).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(d ?f|distrito federal|ciudad de mexico|cdmx)\b/.test(n)) return "ciudad de mexico";
  if (/^baja california( norte)?$/.test(n)) return "baja california";
  if (/^(estado de )?mexico$/.test(n)) return "mexico";
  return n.replace(/^estado de /, "");
}
function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
const municipioNormal = (m: string) =>
  sinAcentos(m)
    .replace(/^(municipio|alcaldia|delegacion)( de)? /, "")
    .replace(/[.,]/g, "")
    .trim();

const muestra: typeof candidatos = [];
const vistos = new Set<string>();
for (const c of candidatos) {
  if (vistos.has(estadoNormal(c.estado))) continue;
  vistos.add(estadoNormal(c.estado));
  muestra.push(c);
}
for (const c of candidatos) if (muestra.length < N && !muestra.includes(c)) muestra.push(c);
muestra.splice(N);

// --- Nominatim con pausa ---------------------------------------------------------------------------
let ultima = 0;
let consultas = 0;
/** Las respuestas por código HTTP (o «error» si no hubo respuesta): una falla del servicio no es un fallo del buscador. */
const codigos: Record<string, number> = {};
const lento: typeof fetch = async (input, init) => {
  const espera = ultima + PAUSA_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultima = Date.now();
  consultas++;
  // La espera de la app (8 s) empieza aquí, no antes de la pausa.
  const { signal: _s, ...resto } = init ?? {};
  try {
    const r = await fetch(input, { ...resto, signal: AbortSignal.timeout(15_000) });
    codigos[r.status] = (codigos[r.status] ?? 0) + 1;
    return r;
  } catch (e) {
    codigos.error = (codigos.error ?? 0) + 1;
    throw e;
  }
};

interface Donde {
  estado: string | null;
  municipio: string[];
}
async function dondeCae(p: ResultadoLugar): Promise<Donde> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  for (const [k, v] of Object.entries({
    format: "jsonv2",
    lat: String(p.lat),
    lon: String(p.lon),
    zoom: "10",
    addressdetails: "1",
    "accept-language": "es",
  }))
    url.searchParams.set(k, v);
  // La búsqueda inversa es del medidor, no del buscador: si el servicio no responde, se reintenta.
  let d: { address?: Record<string, string> } = {};
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await lento(url, { headers: { "User-Agent": USER_AGENT } });
      if (r.ok) {
        d = (await r.json()) as typeof d;
        break;
      }
    } catch {
      // Se reintenta después de la pausa de `lento`.
    }
    if (intento === 3) throw new Error(`La búsqueda inversa no respondió para ${p.lat},${p.lon}`);
  }
  const a = d.address ?? {};
  return {
    estado: a.state ?? null,
    municipio: [a.county, a.city, a.town, a.municipality, a.city_district, a.borough, a.village]
      .filter((x): x is string => Boolean(x))
      .map(municipioNormal),
  };
}

const acierta = (d: Donde, esperado: { municipio: string; estado: string }) => {
  const estado = d.estado !== null && estadoNormal(d.estado) === estadoNormal(esperado.estado);
  const m = municipioNormal(esperado.municipio);
  const municipio = estado && d.municipio.some((x) => x === m || x.includes(m) || m.includes(x));
  return { estado, municipio };
};

// --- La medición -----------------------------------------------------------------------------------
const deps = {
  fetcher: lento,
  cache: new MemoryLugarCache(),
  limiter: { allow: () => Promise.resolve(true) },
  pausa: () => Promise.resolve(),
};
const ESCENARIOS = ["con_el_caso", "escrito"] as const;
type Escenario = (typeof ESCENARIOS)[number];
const consulta = (c: (typeof muestra)[number], e: Escenario) =>
  e === "con_el_caso"
    ? { q: c.lugar, municipio: c.municipio, estado: c.estado }
    : { q: `${c.lugar}, ${c.municipio}, ${c.estado}`.slice(0, 300) };
const casos = [];
for (const escenario of ESCENARIOS)
  for (const c of muestra) {
    const out = await buscarLugar(consulta(c, escenario), "eval", deps).catch((e: unknown) => ({
      resultados: [] as ResultadoLugar[],
      aviso: String(e),
    }));
    const opciones = [];
    for (const r of out.resultados.slice(0, MODO === "antes" ? 1 : 5)) {
      const d = await dondeCae(r);
      opciones.push({ nombre: r.nombre, lat: r.lat, lon: r.lon, cae_en: d, ...acierta(d, c) });
    }
    const primero = opciones[0];
    casos.push({
      escenario,
      id: c.id,
      lugar: c.lugar,
      municipio: c.municipio,
      estado: c.estado,
      aviso: out.aviso,
      resultados: out.resultados.length,
      primero_estado_correcto: primero?.estado ?? false,
      primero_municipio_correcto: primero?.municipio ?? false,
      alguna_opcion_municipio_correcto: opciones.some((o) => o.municipio),
      opciones,
    });
    process.stdout.write(
      `${escenario} ${c.id} ${c.municipio}, ${c.estado}: ${primero ? (primero.municipio ? "municipio ✓" : primero.estado ? "solo el estado" : "otro estado") : "sin resultado"}\n`,
    );
  }

type Clave =
  "primero_estado_correcto" | "primero_municipio_correcto" | "alguna_opcion_municipio_correcto";
const resumen = (e: Escenario) => {
  const de = casos.filter((c) => c.escenario === e);
  const cuenta = (k: Clave) => de.filter((c) => c[k]).length;
  return {
    lugares: de.length,
    primero_en_el_estado_correcto: cuenta("primero_estado_correcto"),
    primero_en_el_municipio_correcto: cuenta("primero_municipio_correcto"),
    ...(MODO === "despues"
      ? { municipio_correcto_entre_las_opciones: cuenta("alguna_opcion_municipio_correcto") }
      : {}),
    sin_resultado: de.filter((c) => c.resultados === 0).length,
  };
};
const out = {
  descripcion:
    "«Buscar el lugar» con 30 lugares de reportes de CESVI de varios estados (partición de desarrollo de R4): cuántos caen en el municipio y el estado que dice el reporte. Se busca como la app (texto del lugar, municipio y estado del caso) y cada resultado se ubica con la búsqueda inversa de Nominatim.",
  script: "eval/ronda4_buscar_lugar.mts",
  modo: MODO,
  fecha: new Date().toISOString(),
  lugares: muestra.length,
  estados: new Set(muestra.map((c) => estadoNormal(c.estado))).size,
  consultas_a_nominatim: consultas,
  respuestas_por_codigo: codigos,
  con_el_caso: resumen("con_el_caso"),
  escrito: resumen("escrito"),
  casos,
};
writeFileSync(
  join(RAIZ, `eval/results/ronda4_buscar_lugar_${MODO}.json`),
  JSON.stringify(out, null, 2) + "\n",
);
for (const e of ESCENARIOS)
  process.stdout.write(
    `\n${MODO} · ${e}: primero en el municipio correcto ${out[e].primero_en_el_municipio_correcto}/${out[e].lugares}; en el estado correcto ${out[e].primero_en_el_estado_correcto}/${out[e].lugares}${MODO === "despues" ? `; correcto entre las opciones ${out[e].municipio_correcto_entre_las_opciones}/${out[e].lugares}` : ""}`,
  );
process.stdout.write("\n");
