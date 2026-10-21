/**
 * Precarga del tramo carretero de un caso de CESVI (ADR 0053): las vías de la carretera federal 15
 * (libre y de cuota) entre Los Mochis y Navojoa, de OpenStreetMap, para que el paso «El lugar» del
 * recorrido dibuje las calles al instante y la demo nunca dependa de Overpass.
 *
 * Descarga con Overpass, simplifica cada vía (Douglas-Peucker con TOLERANCIA_M de tolerancia, que
 * no cambia el rumbo de una carretera) y guarda `data/cesvi/casos/A2010930-tramo.json` con la
 * consulta, la fecha de los datos de OSM, la licencia y la atribución.
 *
 * Uso: `node data/cesvi/scripts/tramo.mjs` (con red; el resultado se versiona).
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SALIDA = join(RAIZ, "data/cesvi/casos/A2010930-tramo.json");
// Del sur de Los Mochis al norte de Navojoa, con margen a los lados de la carretera.
const BBOX = [25.75, -109.5, 27.15, -108.9];
const CONSULTA = `[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary)(_link)?$"]["ref"~"^MEX 15D?$"](${BBOX.join(",")});out tags geom;`;
const INSTANCIAS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const TOLERANCIA_M = 2;
const TAGS = ["highway", "ref", "name", "lanes", "width", "oneway", "surface"];

const RADIO = 6_371_008.8;
const rad = (g) => (g * Math.PI) / 180;
/** Distancia (m) del punto p al segmento a-b, en el plano tangente de a. */
function distanciaSegmento(p, a, b) {
  const k = rad(1) * RADIO;
  const c = Math.cos(rad(a[1]));
  const ax = 0;
  const ay = 0;
  const bx = (b[0] - a[0]) * k * c;
  const by = (b[1] - a[1]) * k;
  const px = (p[0] - a[0]) * k * c;
  const py = (p[1] - a[1]) * k;
  const l2 = bx * bx + by * by;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / l2));
  return Math.hypot(px - t * bx, py - t * by);
}
function simplificar(puntos) {
  if (puntos.length < 3) return puntos;
  let max = 0;
  let i = 0;
  for (let k = 1; k < puntos.length - 1; k++) {
    const d = distanciaSegmento(puntos[k], puntos[0], puntos[puntos.length - 1]);
    if (d > max) {
      max = d;
      i = k;
    }
  }
  if (max <= TOLERANCIA_M) return [puntos[0], puntos[puntos.length - 1]];
  return [...simplificar(puntos.slice(0, i + 1)).slice(0, -1), ...simplificar(puntos.slice(i))];
}

let respuesta = null;
for (const url of INSTANCIAS) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": "croquis-prototipo-cesvi",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(CONSULTA)}`,
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    respuesta = await r.json();
    console.log(`${url}: ${respuesta.elements.length} vías`);
    break;
  } catch (e) {
    console.error(`${url}: ${e.message}`);
  }
}
if (!respuesta) {
  console.error("Ninguna instancia de Overpass respondió.");
  process.exit(1);
}

let antes = 0;
let despues = 0;
const vias = respuesta.elements
  .filter((e) => e.type === "way" && e.geometry?.length > 1)
  .map((e) => {
    const puntos = e.geometry.map((g) => [g.lon, g.lat]);
    const simples = simplificar(puntos).map(([lon, lat]) => [
      Number(lon.toFixed(6)),
      Number(lat.toFixed(6)),
    ]);
    antes += puntos.length;
    despues += simples.length;
    return {
      id_osm: e.id,
      tags: Object.fromEntries(TAGS.filter((t) => e.tags?.[t]).map((t) => [t, e.tags[t]])),
      puntos: simples,
    };
  })
  .sort((a, b) => a.id_osm - b.id_osm);

const resultado = {
  _fuente: {
    descripcion:
      "Carretera federal 15 (libre MEX 15 y de cuota MEX 15D) entre Los Mochis y Navojoa, de OpenStreetMap.",
    consulta: CONSULTA,
    datos_osm: respuesta.osm3s?.timestamp_osm_base ?? null,
    licencia: "ODbL-1.0",
    atribucion: "© colaboradores de OpenStreetMap",
    generado_por: "node data/cesvi/scripts/tramo.mjs",
    simplificacion: `Douglas-Peucker con ${TOLERANCIA_M} m de tolerancia: ${antes} puntos → ${despues}`,
  },
  caso: "A2010930",
  vias,
};
writeFileSync(SALIDA, `${JSON.stringify(resultado)}\n`);
console.log(`${SALIDA}: ${vias.length} vías, ${antes} puntos → ${despues}`);
