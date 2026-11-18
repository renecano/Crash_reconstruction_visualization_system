#!/usr/bin/env node
/**
 * Ronda 4, punto 9 (René, 2026-11-18): qué hay del «mapa real» en México, medido en puntos
 * concretos, para la propuesta de `docs/cesvi/ronda-4/mapa-real-unity.md`.
 *
 * - **Foto satelital (Esri World Imagery):** los metadatos públicos de la imagen en cada punto
 *   (`identify`): de quién es, su fecha, su resolución y su exactitud declarada. No baja imágenes.
 * - **Edificios de OpenStreetMap:** cuántos hay a 300 m de cada punto en las teselas vectoriales de
 *   OpenFreeMap (la capa `building` de OpenMapTiles, zoom 14: la misma fuente que ya usa la web), y
 *   cuántos traen una altura que no es la de omisión. OpenMapTiles pone `render_height` = 5 m cuando
 *   OpenStreetMap no dice la altura ni los pisos. Las teselas juntan edificios vecinos en una sola
 *   figura, así que se cuentan figuras con algún vértice dentro del círculo, no edificios uno por uno.
 *
 * Los puntos: ciudades grandes, una ciudad chica, periferia, tres carreteras rurales y el cruce de un
 * reporte de CESVI (Av. Niños Héroes y Circunvalación Agustín Yáñez, Guadalajara). Diez u once puntos
 * no son una muestra del país: sirven para ver el patrón. Una consulta por segundo como máximo.
 *
 *   node eval/ronda4_mapa_real_datos.mjs → eval/results/ronda4_mapa_real_datos.json
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Croquis/0.1 (medicion puntual de cobertura; https://croquis-sage.vercel.app)";
const PUNTOS = [
  [
    "Cruce de un reporte de CESVI: Av. Niños Héroes, Guadalajara",
    20.6667966,
    -103.3766224,
    "ciudad",
  ],
  ["CDMX, Zócalo", 19.4326, -99.1332, "ciudad"],
  ["CDMX, Roma Norte", 19.4195, -99.162, "ciudad"],
  ["Ecatepec (periferia)", 19.601, -99.05, "ciudad"],
  ["Toluca, centro", 19.2926, -99.6569, "ciudad"],
  ["Metepec, residencial", 19.254, -99.604, "ciudad"],
  ["Guadalajara, centro", 20.6767, -103.3475, "ciudad"],
  ["Monterrey, centro", 25.6694, -100.3097, "ciudad"],
  ["Atlacomulco (ciudad chica)", 19.798, -99.876, "ciudad"],
  ["Autopista México–Querétaro (rural)", 19.956, -99.533, "rural"],
  ["Carretera 15, Sonora (rural)", 29.5, -110.95, "rural"],
  ["Carretera Oaxaca–Istmo (rural)", 16.72, -96.05, "rural"],
];
// Los decodificadores de teselas que ya trae MapLibre (no se instala nada).
const ML = dirname(
  createRequire(join(RAIZ, "apps/web/package.json")).resolve("maplibre-gl/package.json"),
);
const { VectorTile } = await import(
  pathToFileURL(join(dirname(ML), "@mapbox/vector-tile/index.js")).href
);
const { PbfReader: Pbf } = await import(pathToFileURL(join(dirname(ML), "pbf/index.js")).href);
const TILEJSON = "https://tiles.openfreemap.org/planet";
/** La altura que OpenMapTiles pone cuando OpenStreetMap no dice altura ni pisos (m). */
const ALTURA_POR_OMISION_M = 5;
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function esri(lat, lon) {
  const d = 0.0005;
  const u = new URL(
    "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/identify",
  );
  u.search = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: "all",
    tolerance: "1",
    mapExtent: `${lon - d},${lat - d},${lon + d},${lat + d}`,
    imageDisplay: "400,400,96",
    returnGeometry: "false",
    f: "json",
  });
  const j = await (
    await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) })
  ).json();
  const a = (j.results ?? []).find((x) => x.layerName === "World Imagery")?.attributes;
  if (!a) return null;
  const f = String(a["DATE (YYYYMMDD)"] ?? "");
  return {
    fuente: a.SOURCE ?? null,
    producto: a.SOURCE_INFO ?? null,
    fecha: /^\d{8}$/.test(f) ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6)}` : f || null,
    resolucion_m: Number(a["RESOLUTION (M)"]) || null,
    exactitud_m: Number(a["ACCURACY (M)"]) || null,
  };
}

let plantilla = null;
/** La tesela z14 que contiene (lat, lon). */
function teselaDe(lat, lon, z = 14) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { z, x, y };
}
const metros = (lat, lon, lat0, lon0) =>
  Math.hypot((lat - lat0) * 111320, (lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180));

async function edificios(lat, lon) {
  try {
    plantilla ??= (await (await fetch(TILEJSON, { headers: { "User-Agent": UA } })).json())
      .tiles[0];
    // Las teselas que toca el círculo de 300 m.
    const d = 300 / 111320;
    const claves = new Map();
    for (const [a, b] of [
      [lat - d, lon - d],
      [lat - d, lon + d],
      [lat + d, lon - d],
      [lat + d, lon + d],
    ]) {
      const t = teselaDe(a, b);
      claves.set(`${t.z}/${t.x}/${t.y}`, t);
    }
    let total = 0;
    let conAltura = 0;
    for (const t of claves.values()) {
      const url = plantilla.replace("{z}", t.z).replace("{x}", t.x).replace("{y}", t.y);
      const r = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${t.z}/${t.x}/${t.y}`);
      const capa = new VectorTile(new Pbf(new Uint8Array(await r.arrayBuffer()))).layers.building;
      for (let k = 0; k < (capa?.length ?? 0); k++) {
        const f = capa.feature(k);
        const g = f.toGeoJSON(t.x, t.y, t.z).geometry;
        // Con algún vértice dentro del círculo (las teselas juntan edificios vecinos en una figura).
        const anillos = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
        if (!anillos.some((an) => an.some((v) => metros(v[1], v[0], lat, lon) <= 300))) continue;
        total++;
        const h = Number(f.properties.render_height);
        if (Number.isFinite(h) && h !== ALTURA_POR_OMISION_M) conAltura++;
      }
      await pausa(300);
    }
    return { figuras_de_edificios: total, con_altura_propia: conAltura, teselas: claves.size };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const puntos = [];
for (const [lugar, lat, lon, tipo] of PUNTOS) {
  const fila = { lugar, tipo, lat, lon };
  fila.foto_esri = await esri(lat, lon).catch((e) => ({ error: String(e) }));
  await pausa(1000);
  // Los edificios, solo en ciudad: en carretera rural no hay nada que extruir.
  if (tipo === "ciudad") {
    fila.edificios_osm_300m = await edificios(lat, lon);
  }
  puntos.push(fila);
  process.stdout.write(`${JSON.stringify(fila)}\n`);
}

const fotos = puntos.map((p) => p.foto_esri).filter((f) => f && !f.error);
const conEdificios = puntos.filter((p) => p.edificios_osm_300m && !p.edificios_osm_300m.error);
const out = {
  descripcion:
    "Ronda 4, punto 9: lo que hay del «mapa real» en México en puntos concretos. Los metadatos de la foto satelital de Esri World Imagery (consulta pública identify: fuente, fecha, resolución y exactitud declarada; no se bajan imágenes) y los edificios de OpenStreetMap a 300 m de cada punto (capa building de las teselas de OpenFreeMap, zoom 14), contados como figuras (las teselas juntan edificios vecinos) con algún vértice dentro del círculo, y cuántas traen una altura que no es la de omisión de OpenMapTiles (5 m). Pocos puntos: muestran el patrón, no son una muestra del país.",
  script: "eval/ronda4_mapa_real_datos.mjs",
  fecha: new Date().toISOString(),
  resumen: {
    puntos: puntos.length,
    foto_esri: {
      puntos_con_dato: fotos.length,
      resolucion_m_min: Math.min(...fotos.map((f) => f.resolucion_m)),
      resolucion_m_max: Math.max(...fotos.map((f) => f.resolucion_m)),
      exactitud_m_min: Math.min(...fotos.map((f) => f.exactitud_m)),
      exactitud_m_max: Math.max(...fotos.map((f) => f.exactitud_m)),
      fecha_mas_antigua: fotos.map((f) => f.fecha).sort()[0] ?? null,
      fecha_mas_reciente:
        fotos
          .map((f) => f.fecha)
          .sort()
          .at(-1) ?? null,
    },
    edificios_osm: {
      puntos_con_dato: conEdificios.length,
      puntos_sin_respuesta: puntos.filter((p) => p.edificios_osm_300m?.error).length,
      altura_por_omision_m: ALTURA_POR_OMISION_M,
      figuras_de_edificios: conEdificios.reduce(
        (s, p) => s + p.edificios_osm_300m.figuras_de_edificios,
        0,
      ),
      con_altura_propia: conEdificios.reduce(
        (s, p) => s + p.edificios_osm_300m.con_altura_propia,
        0,
      ),
    },
  },
  puntos,
};
writeFileSync(
  join(RAIZ, "eval/results/ronda4_mapa_real_datos.json"),
  `${JSON.stringify(out, null, 2)}\n`,
);
process.stdout.write(`\n${JSON.stringify(out.resumen)}\n`);
