/**
 * ADR 0040: prueba real de `GET /api/osm` en producción, contra Overpass de verdad.
 *
 * Pide las calles alrededor del cruce de la escena de Toluca (`data/osm/manifest.json`) como lo
 * haría una persona: si la ruta responde 502 (Overpass saturado), vuelve a intentar, hasta
 * `INTENTOS` veces. Cada intento dice si llegó a Overpass (`X-Vercel-Cache` y `X-Croquis-Cache` en
 * MISS/miss), qué instancia respondió (`X-Croquis-Overpass`) y cuánto tardó. Después del primer
 * 200, una petición más debe salir de una caché. La respuesta se compara con el extracto
 * versionado: con un radio menor que el del extracto, deben llegar las calles del extracto que
 * quedan dentro de ese radio y ninguna que no esté en él. Con un radio que nadie haya pedido antes
 * (`--radio`), mide una consulta real a Overpass a través de Vercel.
 *
 * No corre en CI (CI nunca llama a servicios externos). Hace a lo más `INTENTOS` + 1 peticiones a
 * la ruta, dentro de la política de uso de las instancias públicas.
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
const INTENTOS = 3;

const manifest = JSON.parse(readFileSync(join(ROOT, "data", "osm", "manifest.json"), "utf8"))[
  ESCENA
];
const extracto = JSON.parse(
  readFileSync(join(ROOT, "data", "osm", `${ESCENA}.overpass.json`), "utf8"),
);
if (!(RADIO <= manifest.radio_m)) {
  throw new Error(`El radio no puede pasar del del extracto (${manifest.radio_m} m)`);
}
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

const intentos = [];
let resp = null;
while (intentos.length < INTENTOS && resp === null) {
  const r = await pedir();
  intentos.push(r.registro);
  resp = r.json;
}
const repeticion = resp ? (await pedir()).registro : null;

const vias = (r) => new Set(r.elements.filter((e) => e.type === "way").map((e) => e.id));
const ordenado = (r) =>
  JSON.stringify(
    [...r.elements].sort((a, b) => `${a.type}${a.id}`.localeCompare(`${b.type}${b.id}`)),
  );
/**
 * Distancia (m) del punto que consulta la ruta (redondeado a 5 decimales) a cada calle del
 * extracto, por sus tramos, en un plano local. Con un radio menor que el del extracto, las calles
 * esperadas son las del extracto a esa distancia o menos; las que quedan a menos de `BORDE_M` del
 * radio pueden salir o no (Overpass mide sobre el elipsoide).
 */
const BORDE_M = 1;
const lat0 = Number(manifest.lat.toFixed(5));
const lon0 = Number(manifest.lon.toFixed(5));
const R = 6371008.8;
const plano = (n) => ({
  x: ((n.lon - lon0) * Math.PI * R * Math.cos((lat0 * Math.PI) / 180)) / 180,
  y: ((n.lat - lat0) * Math.PI * R) / 180,
});
const nodos = new Map(extracto.elements.filter((e) => e.type === "node").map((n) => [n.id, n]));
function distanciaVia(via) {
  const pts = via.nodes.map((id) => plano(nodos.get(id)));
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1] ?? a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}
const distancias = new Map(
  extracto.elements.filter((e) => e.type === "way").map((w) => [w.id, distanciaVia(w)]),
);

let comparacion = null;
if (resp && Array.isArray(resp.elements)) {
  const prod = vias(resp);
  const ext = vias(extracto);
  const soloEnExtracto = [...ext].filter((i) => !prod.has(i));
  comparacion = {
    datos_osm: resp.osm3s?.timestamp_osm_base ?? null,
    datos_osm_extracto: extracto.osm3s?.timestamp_osm_base ?? null,
    elementos: resp.elements.length,
    elementos_extracto: extracto.elements.length,
    vias: prod.size,
    vias_extracto: ext.size,
    vias_solo_en_produccion: [...prod].filter((i) => !ext.has(i)),
    vias_solo_en_extracto: soloEnExtracto.map((id) => ({
      id,
      distancia_m: Math.round(distancias.get(id) * 100) / 100,
    })),
    // Calles del extracto dentro del radio que no llegaron (fuera de la franja del borde).
    faltan_dentro_del_radio: soloEnExtracto.filter((id) => distancias.get(id) < RADIO - BORDE_M),
    elementos_identicos: ordenado(resp) === ordenado(extracto),
  };
}

const desdeCache = (r) => r.x_vercel_cache === "HIT" || r.x_croquis_cache === "hit";
const doc = {
  name: "osm_produccion",
  generated_at: new Date().toISOString(),
  git_commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
    .toString()
    .trim(),
  url,
  escena: ESCENA,
  radio_m: RADIO,
  intentos,
  intentos_hasta_200: resp ? intentos.length : null,
  llego_a_overpass: intentos.some((r) => r.status === 200 && !desdeCache(r)),
  repeticion,
  repeticion_desde_cache: repeticion ? repeticion.status === 200 && desdeCache(repeticion) : false,
  comparacion,
  cumple:
    comparacion !== null &&
    comparacion.vias_solo_en_produccion.length === 0 &&
    comparacion.faltan_dentro_del_radio.length === 0 &&
    repeticion !== null &&
    repeticion.status === 200 &&
    desdeCache(repeticion),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(OUT);
console.log(
  JSON.stringify({
    cumple: doc.cumple,
    intentos: doc.intentos.map((r) => [r.status, r.segundos, r.instancia_overpass]),
    repeticion_desde_cache: doc.repeticion_desde_cache,
    identicos: comparacion?.elementos_identicos,
  }),
);
if (!doc.cumple) process.exitCode = 1;
