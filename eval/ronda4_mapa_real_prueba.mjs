#!/usr/bin/env node
/**
 * Ronda 4, punto 9 (René, 2026-11-18): prueba visual de «mapa real» con datos abiertos, sin Unity y
 * sin llaves. Dibuja con MapLibre (el de la web) un lugar real, Av. Niños Héroes en Guadalajara (la
 * avenida de un reporte de CESVI), en perspectiva, con dos vehículos como cajas 3D:
 *
 * - `prueba-a1-mapa-como-piso.jpg`: el mapa vectorial de OpenStreetMap como piso.
 * - `prueba-b2-edificios-osm.jpg`: lo mismo con los edificios de OpenStreetMap extruidos (su altura
 *   si el mapa la trae; si no, 6 m supuestos).
 *
 * Es una prueba de cómo se vería el dato, no del visor de Unity. Las teselas son de OpenFreeMap
 * (OpenMapTiles, datos © OpenStreetMap, ODbL): la atribución va en la imagen.
 *
 *   node eval/ronda4_mapa_real_prueba.mjs → docs/cesvi/ronda-4/evidencia/mapa-real/
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = req("@playwright/test");
const ML = dirname(req.resolve("maplibre-gl/package.json"));
const SALIDA = join(RAIZ, "docs/cesvi/ronda-4/evidencia/mapa-real");
mkdirSync(SALIDA, { recursive: true });

/** Av. Niños Héroes, Arcos Vallarta, Guadalajara (Nominatim, 2026-11-18). */
const CENTRO = [-103.3766224, 20.6667966];

/** Un rectángulo de `largo`×`ancho` metros, centrado a (este, norte) m del centro, con su rumbo. */
function caja(este, norte, rumboDeg, largo = 4.6, ancho = 1.85) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos((CENTRO[1] * Math.PI) / 180);
  const r = (rumboDeg * Math.PI) / 180;
  const esquinas = [
    [largo / 2, ancho / 2],
    [largo / 2, -ancho / 2],
    [-largo / 2, -ancho / 2],
    [-largo / 2, ancho / 2],
  ].map(([a, b]) => {
    // a: a lo largo del rumbo (desde el norte, horario); b: a su derecha.
    const e = este + a * Math.sin(r) + b * Math.cos(r);
    const n = norte + a * Math.cos(r) - b * Math.sin(r);
    return [CENTRO[0] + e / mLon, CENTRO[1] + n / mLat];
  });
  return { type: "Polygon", coordinates: [[...esquinas, esquinas[0]]] };
}
const VEHICULOS = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { color: "#2257C9" }, geometry: caja(-3.2, 0.6, 96) },
    { type: "Feature", properties: { color: "#A35A00" }, geometry: caja(2.4, -1.4, 20) },
  ],
};

const estilo = (edificios3d) => ({
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    vehiculos: { type: "geojson", data: VEHICULOS },
  },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": "#ECE9E1" } },
    {
      id: "parques",
      type: "fill",
      source: "omt",
      "source-layer": "park",
      paint: { "fill-color": "#D4E7C5" },
    },
    {
      id: "calles-orilla",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#C9CCD3",
        "line-width": ["interpolate", ["exponential", 2], ["zoom"], 14, 3, 20, 190],
      },
    },
    {
      id: "calles",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#FFFFFF",
        "line-width": ["interpolate", ["exponential", 2], ["zoom"], 14, 2, 20, 170],
      },
    },
    edificios3d
      ? {
          id: "edificios",
          type: "fill-extrusion",
          source: "omt",
          "source-layer": "building",
          paint: {
            "fill-extrusion-color": "#D9D4C8",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.95,
          },
        }
      : {
          id: "edificios",
          type: "fill",
          source: "omt",
          "source-layer": "building",
          paint: { "fill-color": "#DEDAD0", "fill-outline-color": "#CFC9BC" },
        },
    {
      id: "nombres",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      layout: {
        "symbol-placement": "line",
        "text-field": ["upcase", ["coalesce", ["get", "name:es"], ["get", "name"]]],
        "text-font": ["Noto Sans Bold"],
        "text-size": 13,
        "text-letter-spacing": 0.08,
      },
      paint: { "text-color": "#3A3F49", "text-halo-color": "#FFFFFF", "text-halo-width": 1.6 },
    },
    {
      id: "vehiculos",
      type: "fill-extrusion",
      source: "vehiculos",
      paint: {
        "fill-extrusion-color": ["get", "color"],
        "fill-extrusion-height": 1.5,
        "fill-extrusion-base": 0.25,
      },
    },
  ],
});

const html = (edificios3d, titulo) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/ml/maplibre-gl.css">
<style>html,body,#m{margin:0;width:100%;height:100%}
.t{position:absolute;left:16px;top:14px;font:600 15px system-ui;background:#fff;padding:8px 12px;border-radius:10px}
.a{position:absolute;right:10px;bottom:8px;font:11px system-ui;background:rgba(255,255,255,.85);padding:3px 8px;border-radius:6px}</style></head>
<body><div id="m"></div><div class="t">${titulo}</div>
<div class="a">© OpenStreetMap · OpenFreeMap · OpenMapTiles · prueba ilustrativa: los vehículos son cajas</div>
<script type="module">
import * as maplibregl from "/ml/maplibre-gl.mjs";
maplibregl.setWorkerUrl("/ml/maplibre-gl-worker.mjs");
const map = new maplibregl.Map({container:"m",style:${JSON.stringify(estilo(edificios3d))},center:${JSON.stringify(CENTRO)},zoom:20.3,pitch:64,bearing:-28,attributionControl:false,maxPitch:75});
map.once("idle",()=>{window.listo=true});
</script></body></html>`;

const navegador = await chromium.launch({
  args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
try {
  for (const [nombre, edificios3d, titulo] of [
    [
      "prueba-a1-mapa-como-piso",
      false,
      "A · El mapa de OpenStreetMap como piso · Av. Niños Héroes, Guadalajara",
    ],
    [
      "prueba-b2-edificios-osm",
      true,
      "B · Edificios de OpenStreetMap extruidos · Av. Niños Héroes, Guadalajara",
    ],
  ]) {
    const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
    await pagina.route("http://prueba.local/**", (ruta) => {
      const p = new URL(ruta.request().url()).pathname;
      if (p === "/")
        return ruta.fulfill({ contentType: "text/html", body: html(edificios3d, titulo) });
      const archivo = /^\/ml\/([\w.-]+)$/.exec(p)?.[1];
      if (archivo && existsSync(join(ML, "dist", archivo)))
        return ruta.fulfill({
          contentType: archivo.endsWith(".css") ? "text/css" : "text/javascript",
          body: readFileSync(join(ML, "dist", archivo)),
        });
      return ruta.fulfill({ status: 404, body: "" });
    });
    await pagina.goto("http://prueba.local/");
    await pagina.waitForFunction(() => window.listo === true, null, { timeout: 120_000 });
    await pagina.waitForTimeout(1500);
    await pagina.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: "jpeg", quality: 86 });
    await pagina.close();
    process.stdout.write(`${nombre}.jpg\n`);
  }
} finally {
  await navegador.close();
}
