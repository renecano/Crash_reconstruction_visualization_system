/**
 * Ubicación ILUSTRATIVA del km 47+800 del caso A2010930 (ADR 0056). El dictamen no da coordenadas
 * y René no las tiene; pidió inventar unas sobre esa carretera para mostrar que el recorrido
 * funciona con coordenadas. No es la ubicación real del hecho, y así se dice en la pantalla y en el
 * PDF.
 *
 * Cómo se elige, para que sea creíble y reproducible: del tramo precargado de OSM
 * (`A2010930-tramo.json`), los tramos de la carretera federal 15 (libre o de cuota, sin enlaces)
 * del arroyo que va hacia el norte (el sentido del caso); de cada segmento de más de 60 m, su punto
 * medio; se queda el que esté más cerca de 47.8 km en línea recta del centro de Los Mochis.
 *
 * Uso: `node data/cesvi/scripts/ubicacion-ilustrativa.mjs` → `data/cesvi/casos/A2010930-ubicacion.json`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const tramo = JSON.parse(readFileSync(join(RAIZ, "data/cesvi/casos/A2010930-tramo.json"), "utf8"));
const SALIDA = join(RAIZ, "data/cesvi/casos/A2010930-ubicacion.json");
/** Centro de Los Mochis (plaza principal, aproximado) y la distancia buscada. */
const LOS_MOCHIS = [-108.9935, 25.7905];
const META_M = 47_800;

const rad = (g) => (g * Math.PI) / 180;
function distanciaM(a, b) {
  const R = 6_371_008.8;
  const dp = rad(b[1] - a[1]);
  const dl = rad(b[0] - a[0]);
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let mejor = null;
for (const v of tramo.vias) {
  const t = v.tags;
  if (!["MEX 15", "MEX 15D"].includes(t.ref)) continue;
  if (!/^(trunk|motorway)$/.test(t.highway ?? "")) continue;
  const p = v.puntos;
  // Solo el arroyo que va hacia el norte (los de un sentido que bajan son el arroyo contrario).
  if (t.oneway === "yes" && !(p.at(-1)[1] > p[0][1])) continue;
  for (let i = 0; i + 1 < p.length; i++) {
    if (distanciaM(p[i], p[i + 1]) < 60) continue;
    const m = [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2];
    const d = distanciaM(LOS_MOCHIS, m);
    if (!mejor || Math.abs(d - META_M) < Math.abs(mejor.d - META_M)) {
      mejor = { m, d, ref: t.ref, nombre: t.name ?? null, id_osm: v.id_osm };
    }
  }
}
if (!mejor) {
  console.error("No hay tramos de la carretera federal 15 hacia el norte en el tramo precargado.");
  process.exit(1);
}

const resultado = {
  _nota:
    "Ubicación ILUSTRATIVA del km 47+800, inventada a pedido de René para la demo (2026-10-21): el dictamen no da coordenadas. No es la ubicación real del hecho.",
  caso: "A2010930",
  lat: Number(mejor.m[1].toFixed(5)),
  lon: Number(mejor.m[0].toFixed(5)),
  via: { ref: mejor.ref, nombre: mejor.nombre, id_osm: mejor.id_osm },
  distancia_a_los_mochis_km: Number((mejor.d / 1000).toFixed(1)),
  generado_por: "node data/cesvi/scripts/ubicacion-ilustrativa.mjs",
};
writeFileSync(SALIDA, `${JSON.stringify(resultado, null, 2)}\n`);
console.log(
  `${SALIDA}: ${resultado.lat}, ${resultado.lon} (${resultado.via.ref}, ${resultado.distancia_a_los_mochis_km} km de Los Mochis)`,
);
