/**
 * ADR 0040: prueba real de `GET /api/osm` en producción, contra Overpass de verdad.
 *
 * Pide las calles alrededor del cruce de la escena de Toluca (`data/osm/manifest.json`) dos veces
 * seguidas y compara la respuesta con el extracto versionado. La primera petición dice si llegó a
 * Overpass (`X-Vercel-Cache` y `X-Croquis-Cache` en MISS/miss) o si salió de una caché; la segunda
 * debe salir de la CDN. Con un radio que nadie haya pedido antes (`--radio`), la primera petición
 * mide una consulta real a Overpass a través de Vercel.
 *
 * No corre en CI (CI nunca llama a servicios externos). Hace a lo más dos peticiones a la ruta, y
 * una sola consulta a Overpass, dentro de la política de uso de las instancias públicas.
 *
 * Uso: `node eval/osm_produccion.mjs [--base https://…] [--radio 150] [--out ruta.json]`.
 * Salida: eval/results/osm_produccion.json.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const BASE = arg("base", "https://croquis-sage.vercel.app");
const RADIO = Number(arg("radio", "150"));
const OUT = resolve(ROOT, arg("out", join("eval", "results", "osm_produccion.json")));
const ESCENA = "toluca_carranza_juarez";

const manifest = JSON.parse(readFileSync(join(ROOT, "data", "osm", "manifest.json"), "utf8"))[
  ESCENA
];
const extracto = JSON.parse(
  readFileSync(join(ROOT, "data", "osm", `${ESCENA}.overpass.json`), "utf8"),
);
const url = `${BASE}/api/osm?lat=${manifest.lat}&lon=${manifest.lon}&radio=${RADIO}`;

async function pedir() {
  const t0 = performance.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const cuerpo = await res.text();
  const segundos = Math.round((performance.now() - t0) / 10) / 100;
  let json = null;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    // cuerpo sin JSON: queda null
  }
  return {
    registro: {
      fecha: new Date().toISOString(),
      status: res.status,
      segundos,
      x_vercel_cache: res.headers.get("x-vercel-cache"),
      x_croquis_cache: res.headers.get("x-croquis-cache"),
      instancia_overpass: res.headers.get("x-croquis-overpass"),
      error: res.ok ? null : (json?.error ?? cuerpo.slice(0, 200)),
    },
    json: res.ok ? json : null,
  };
}

const primera = await pedir();
const segunda = await pedir();

const vias = (r) => new Set(r.elements.filter((e) => e.type === "way").map((e) => e.id));
const ordenado = (r) =>
  JSON.stringify(
    [...r.elements].sort((a, b) => `${a.type}${a.id}`.localeCompare(`${b.type}${b.id}`)),
  );
let comparacion = null;
const resp = primera.json ?? segunda.json;
if (resp && Array.isArray(resp.elements)) {
  const prod = vias(resp);
  const ext = vias(extracto);
  comparacion = {
    datos_osm: resp.osm3s?.timestamp_osm_base ?? null,
    datos_osm_extracto: extracto.osm3s?.timestamp_osm_base ?? null,
    elementos: resp.elements.length,
    elementos_extracto: extracto.elements.length,
    vias: prod.size,
    vias_extracto: ext.size,
    vias_solo_en_produccion: [...prod].filter((i) => !ext.has(i)),
    vias_solo_en_extracto: [...ext].filter((i) => !prod.has(i)),
    elementos_identicos: ordenado(resp) === ordenado(extracto),
  };
}

const llegoAOverpass =
  primera.registro.x_vercel_cache === "MISS" && primera.registro.x_croquis_cache === "miss";
const doc = {
  name: "osm_produccion",
  generated_at: new Date().toISOString(),
  git_commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
    .toString()
    .trim(),
  url,
  escena: ESCENA,
  radio_m: RADIO,
  primera: primera.registro,
  primera_llego_a_overpass: llegoAOverpass,
  segunda: segunda.registro,
  segunda_desde_cdn: segunda.registro.x_vercel_cache === "HIT",
  comparacion,
  cumple:
    primera.registro.status === 200 &&
    segunda.registro.status === 200 &&
    segunda.registro.x_vercel_cache === "HIT" &&
    comparacion !== null,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(OUT);
console.log(
  JSON.stringify({
    cumple: doc.cumple,
    primera: doc.primera,
    segunda_desde_cdn: doc.segunda_desde_cdn,
    identicos: comparacion?.elementos_identicos,
  }),
);
if (!doc.cumple) process.exitCode = 1;
