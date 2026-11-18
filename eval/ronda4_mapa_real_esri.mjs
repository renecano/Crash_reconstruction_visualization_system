#!/usr/bin/env node
/**
 * Ronda 4, punto 9 (René, 2026-11-18): la prueba visual que faltaba de la foto satelital de Esri
 * (World Imagery, ArcGIS Location Platform) en el mismo cruce y con la misma cámara que
 * `ronda4_mapa_real_prueba.mjs`: Av. Niños Héroes, Guadalajara (la avenida de un reporte de CESVI).
 *
 * - `prueba-a2-foto-satelital.jpg`: la foto como piso, en perspectiva, con dos vehículos como cajas.
 * - `prueba-a2-foto-satelital-arriba.jpg`: la misma, desde arriba.
 *
 * La llave sale del `.env.local` de la raíz o de `apps/web` (`NEXT_PUBLIC_ESRI_API_KEY`) y nunca se imprime ni se
 * escribe: solo vive en memoria y en las peticiones de teselas. La llave solo acepta los referrers
 * `croquis-sage.vercel.app` y `localhost:3000`, así que la página se sirve como
 * `http://localhost:3000/` (Playwright la entrega; no hace falta el servidor). La atribución es la
 * que pide Esri: «Powered by Esri» y el `copyrightText` del servicio, en la imagen.
 *
 *   node eval/ronda4_mapa_real_esri.mjs → docs/cesvi/ronda-4/evidencia/mapa-real/
 *                                        y eval/results/ronda4_mapa_real_esri.json (teselas usadas)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = req("@playwright/test");
const ML = dirname(req.resolve("maplibre-gl/package.json"));
const SALIDA = join(RAIZ, "docs/cesvi/ronda-4/evidencia/mapa-real");
mkdirSync(SALIDA, { recursive: true });

/** La llave, solo en memoria. */
function llave() {
  for (const ruta of [join(RAIZ, ".env.local"), join(RAIZ, "apps/web/.env.local")]) {
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
      const m = /^\s*NEXT_PUBLIC_ESRI_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/.exec(linea);
      if (m) return m[1];
    }
  }
  throw new Error("Falta NEXT_PUBLIC_ESRI_API_KEY en .env.local.");
}
const LLAVE = llave();
/** Cualquier texto que salga del script, sin la llave. */
const limpio = (s) => String(s).split(LLAVE).join("[llave]");

/** Av. Niños Héroes, Arcos Vallarta, Guadalajara (Nominatim, 2026-11-18): el mismo de la prueba A1. */
const CENTRO = [-103.3766224, 20.6667966];
const TESELAS = "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer";

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

const estilo = {
  version: 8,
  sources: {
    foto: {
      type: "raster",
      tiles: [`${TESELAS}/tile/{z}/{y}/{x}?token=${LLAVE}`],
      tileSize: 256,
      // Más allá de su resolución (0.3–0.5 m por pixel) se amplía la última tesela.
      maxzoom: 19,
    },
    vehiculos: { type: "geojson", data: VEHICULOS },
  },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": "#20242B" } },
    { id: "foto", type: "raster", source: "foto" },
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
};

const html = (
  titulo,
  pitch,
  bearing,
  creditos,
) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/ml/maplibre-gl.css">
<style>html,body,#m{margin:0;width:100%;height:100%}
.t{position:absolute;left:16px;top:14px;font:600 15px system-ui;background:#fff;padding:8px 12px;border-radius:10px}
.a{position:absolute;right:10px;bottom:8px;font:11px system-ui;background:rgba(255,255,255,.88);padding:3px 8px;border-radius:6px;max-width:70%}</style></head>
<body><div id="m"></div><div class="t">${titulo}</div>
<div class="a">Powered by Esri · ${creditos} · prueba ilustrativa: la foto puede estar corrida de 5 a 8.5 m; los vehículos son cajas</div>
<script type="module">
import * as maplibregl from "/ml/maplibre-gl.mjs";
maplibregl.setWorkerUrl("/ml/maplibre-gl-worker.mjs");
const map = new maplibregl.Map({container:"m",style:${JSON.stringify(estilo)},center:${JSON.stringify(CENTRO)},zoom:20.3,pitch:${pitch},bearing:${bearing},attributionControl:false,maxPitch:75});
map.once("idle",()=>{window.listo=true});
</script></body></html>`;

const navegador = await chromium.launch({
  args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const medido = { teselas: 0, fallidas: 0, estados: {} };
try {
  // El crédito del servicio, como en el ejemplo oficial de Esri para MapLibre.
  const meta = await fetch(`${TESELAS}?f=json&token=${LLAVE}`, {
    headers: { Referer: "http://localhost:3000/" },
  }).then((r) => r.json());
  if (meta.error) throw new Error(`Esri respondió: ${meta.error.code} ${meta.error.message}`);
  const creditos = String(
    meta.copyrightText ?? "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  );
  for (const [nombre, titulo, pitch, bearing] of [
    [
      "prueba-a2-foto-satelital",
      "A2 · La foto satelital de Esri como piso · Av. Niños Héroes, Guadalajara",
      64,
      -28,
    ],
    ["prueba-a2-foto-satelital-arriba", "A2 · La misma foto, desde arriba", 0, -28],
  ]) {
    const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
    pagina.on("response", (r) => {
      if (!r.url().startsWith(`${TESELAS}/tile/`)) return;
      medido.teselas++;
      medido.estados[r.status()] = (medido.estados[r.status()] ?? 0) + 1;
      if (r.status() >= 400) medido.fallidas++;
    });
    await pagina.route("http://localhost:3000/**", (ruta) => {
      const p = new URL(ruta.request().url()).pathname;
      if (p === "/")
        return ruta.fulfill({
          contentType: "text/html",
          body: html(titulo, pitch, bearing, creditos),
        });
      const archivo = /^\/ml\/([\w.-]+)$/.exec(p)?.[1];
      if (archivo && existsSync(join(ML, "dist", archivo)))
        return ruta.fulfill({
          contentType: archivo.endsWith(".css") ? "text/css" : "text/javascript",
          body: readFileSync(join(ML, "dist", archivo)),
        });
      return ruta.fulfill({ status: 404, body: "" });
    });
    await pagina.goto("http://localhost:3000/");
    await pagina.waitForFunction(() => window.listo === true, null, { timeout: 120_000 });
    await pagina.waitForTimeout(1500);
    await pagina.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: "jpeg", quality: 86 });
    await pagina.close();
    process.stdout.write(`${nombre}.jpg\n`);
  }
  writeFileSync(
    join(RAIZ, "eval/results/ronda4_mapa_real_esri.json"),
    `${JSON.stringify(
      {
        descripcion:
          "Ronda 4, punto 9: la prueba visual de la foto satelital de Esri (World Imagery) en Av. Niños Héroes, Guadalajara. Teselas pedidas para las dos vistas (la cuota gratis es de 2 millones al mes).",
        script: "eval/ronda4_mapa_real_esri.mjs",
        fecha: new Date().toISOString(),
        servicio: TESELAS,
        creditos,
        ...medido,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`teselas: ${medido.teselas}, fallidas: ${medido.fallidas}\n`);
} catch (e) {
  process.stderr.write(`${limpio(e instanceof Error ? e.message : e)}\n`);
  process.exitCode = 1;
} finally {
  await navegador.close();
}
