/**
 * ADR 0040: cómo responden, desde esta máquina, las instancias públicas de Overpass que usa
 * `/api/osm`. Manda a cada una, en orden y una sola vez, la consulta de la escena de Toluca
 * (`data/osm/manifest.json`) y anota el código, el tiempo y si la respuesta trae calles.
 *
 * Sirve para decidir el orden y los tiempos de espera de la ruta con datos, no con suposiciones.
 * No corre en CI (CI nunca llama a servicios externos). Son tres consultas en serie, dentro de la
 * política de uso de las instancias públicas.
 *
 * Uso: `node eval/osm_instancias.mjs [--espera 60] [--radio 150] [--out ruta.json]`.
 * Salida: eval/results/osm_instancias.json.
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
const ESPERA_S = Number(arg("espera", "60"));
const RADIO = Number(arg("radio", "150"));
const OUT = resolve(ROOT, arg("out", join("eval", "results", "osm_instancias.json")));

// Las mismas de `apps/web/src/server/osm.ts` (OVERPASS_INSTANCES), en su orden, y su User-Agent.
const src = readFileSync(join(ROOT, "apps", "web", "src", "server", "osm.ts"), "utf8");
const principal = /OVERPASS_URL = "([^"]+)"/.exec(src)?.[1];
const instancias = [...src.matchAll(/\{ url: (?:"([^"]+)"|OVERPASS_URL), esperaS/g)].map(
  (m) => m[1] ?? principal,
);
const userAgent = /USER_AGENT =\s*"([^"]+)"/.exec(src)?.[1];
if (instancias.length === 0 || !userAgent) throw new Error("No se encontraron las instancias");

const m = JSON.parse(
  readFileSync(join(ROOT, "data", "osm", "manifest.json"), "utf8"),
).toluca_carranza_juarez;
const lat = Number(m.lat.toFixed(5));
const lon = Number(m.lon.toFixed(5));
const consulta = `[out:json][timeout:25];way(around:${RADIO},${lat},${lon})["highway"];out body;>;out skel qt;`;

const filas = [];
for (const url of instancias) {
  const t0 = performance.now();
  const fila = { url, fecha: new Date().toISOString() };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": userAgent, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: consulta }),
      signal: AbortSignal.timeout(ESPERA_S * 1000),
    });
    const texto = await res.text();
    fila.status = res.status;
    try {
      const json = JSON.parse(texto);
      fila.vias = Array.isArray(json.elements)
        ? json.elements.filter((e) => e.type === "way").length
        : null;
    } catch {
      fila.vias = null;
    }
  } catch (e) {
    fila.status = null;
    fila.error = e instanceof Error ? e.name : String(e);
  }
  fila.segundos = Math.round((performance.now() - t0) / 10) / 100;
  filas.push(fila);
}

const doc = {
  name: "osm_instancias",
  generated_at: new Date().toISOString(),
  git_commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
    .toString()
    .trim(),
  espera_s: ESPERA_S,
  radio_m: RADIO,
  consulta,
  instancias: filas,
  respondieron: filas.filter((f) => f.status === 200 && f.vias !== null).length,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(OUT);
console.log(JSON.stringify(filas.map((f) => [new URL(f.url).host, f.status, f.segundos])));
