#!/usr/bin/env node
/* global process, URL, window */
/**
 * Graba las calles de las teselas de OpenFreeMap (esquema OpenMapTiles; datos © OpenStreetMap, ODbL)
 * alrededor de un punto, como las ve MapLibre en La escena, para las pruebas de `teselas.ts` sin red.
 *
 *   node packages/croquis-2d/scripts/grabar-teselas.mjs <nombre> <lat> <lon> [radio_m]
 *     → packages/croquis-2d/fixtures/teselas-<nombre>.json
 *
 * Caso: cesvi-cf708e9fed (Periférico, Boulevard Adolfo Ruiz Cortines, a la altura de Viaducto; René,
 * 2026-11-18: las flechas salieron por puntos cardinales). Registrado en `data/SOURCES.md`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const req = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = req("@playwright/test");
const ML = dirname(req.resolve("maplibre-gl/package.json"));
const [nombre, lat, lon, radio = "400"] = process.argv.slice(2);
if (!nombre || !lat || !lon)
  throw new Error("Uso: grabar-teselas.mjs <nombre> <lat> <lon> [radio_m]");
const CENTRO = [Number(lon), Number(lat)];
const R = Number(radio);

const estilo = {
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": "#eee" } },
    {
      id: "calles",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: { "line-color": "#999" },
    },
    {
      id: "nombres",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      paint: { "line-opacity": 0 },
    },
  ],
};
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;width:100%;height:100%}</style></head>
<body><div id="m"></div><script type="module">
import * as maplibregl from "/ml/maplibre-gl.mjs";
maplibregl.setWorkerUrl("/ml/maplibre-gl-worker.mjs");
const map = new maplibregl.Map({container:"m",style:${JSON.stringify(estilo)},center:${JSON.stringify(CENTRO)},zoom:16,attributionControl:false});
map.once("idle",()=>{
  const q=(l)=>map.querySourceFeatures("openmaptiles",{sourceLayer:l}).map(f=>({geometry:f.geometry,properties:f.properties}));
  window.salida={transportation:q("transportation"),transportation_name:q("transportation_name")};
});
</script></body></html>`;

const navegador = await chromium.launch({
  args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
try {
  const pagina = await navegador.newPage({ viewport: { width: 1200, height: 1200 } });
  await pagina.route("http://grabar.local/**", (ruta) => {
    const p = new URL(ruta.request().url()).pathname;
    if (p === "/") return ruta.fulfill({ contentType: "text/html", body: html });
    const archivo = /^\/ml\/([\w.-]+)$/.exec(p)?.[1];
    if (archivo && existsSync(join(ML, "dist", archivo)))
      return ruta.fulfill({
        contentType: "text/javascript",
        body: readFileSync(join(ML, "dist", archivo)),
      });
    return ruta.fulfill({ status: 404, body: "" });
  });
  await pagina.goto("http://grabar.local/");
  await pagina.waitForFunction(() => window.salida, null, { timeout: 120_000 });
  const s = await pagina.evaluate(() => window.salida);
  // Solo lo que toca el radio, con 7 decimales.
  const cerca = (g) => {
    const k = Math.cos((CENTRO[1] * Math.PI) / 180);
    const ls =
      g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    return ls.some((l) =>
      l.some(([x, y]) => Math.hypot((x - CENTRO[0]) * k, y - CENTRO[1]) * 111320 <= R),
    );
  };
  const redondear = (g) =>
    JSON.parse(
      JSON.stringify(g, (_, v) => (typeof v === "number" ? Math.round(v * 1e7) / 1e7 : v)),
    );
  const salida = {
    fuente: "OpenFreeMap (OpenMapTiles), datos © OpenStreetMap contributors, ODbL",
    fecha: new Date().toISOString().slice(0, 10),
    centro: { lat: CENTRO[1], lon: CENTRO[0] },
    radio_m: R,
    transportation: s.transportation
      .filter((f) => cerca(f.geometry))
      .map((f) => ({ ...f, geometry: redondear(f.geometry) })),
    transportation_name: s.transportation_name
      .filter((f) => cerca(f.geometry))
      .map((f) => ({ ...f, geometry: redondear(f.geometry) })),
  };
  const dir = join(RAIZ, "packages/croquis-2d/fixtures");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `teselas-${nombre}.json`), `${JSON.stringify(salida)}\n`);
  const nombres = [...new Set(salida.transportation_name.map((f) => f.properties.name))];
  process.stdout.write(
    `${salida.transportation.length} tramos, ${salida.transportation_name.length} nombres: ${nombres.slice(0, 12).join(" | ")}\n`,
  );
} finally {
  await navegador.close();
}
