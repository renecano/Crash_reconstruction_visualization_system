#!/usr/bin/env node
/**
 * Las carreteras federales y estatales de México, de OpenStreetMap, en un archivo compacto (René,
 * 2026-11-28: el km de una carretera sin depender de Overpass, que se satura). Una sola vez; se
 * vuelve a correr solo para actualizar.
 *
 *   node tools/datos/carreteras-mx.mjs bajar      Overpass, estado por estado, a .cache/carreteras-mx/
 *   node tools/datos/carreteras-mx.mjs armar      .cache → apps/web/src/lib/buscadores/datos/carreteras-mx.json
 *
 * Qué entra: motorway, trunk y primary con `ref` (y motorway o trunk con nombre aunque no tengan ref),
 * con su ref, su nombre y su geometría simplificada (Douglas–Peucker a 15 m, coordenadas a 1e-5°);
 * y los mojones (`highway=milestone` con `distance` o `pk`) a menos de 60 m de una de ellas.
 * Licencia: ODbL 1.0, © OpenStreetMap contributors (registrado en data/SOURCES.md).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = join(RAIZ, ".cache/carreteras-mx");
const SALIDA = join(RAIZ, "apps/web/src/lib/buscadores/datos/carreteras-mx.json");
// Las mismas réplicas que usa la app (`OVERPASS_INSTANCES`): si una está saturada, la siguiente.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const UA =
  "Croquis/0.1 (reconstruccion ilustrativa de percances; +https://github.com/renecano/Crash_reconstruction_visualization_system)";
const ESTADOS =
  "AGU BCN BCS CAM CHP CHH CMX COA COL DUR GUA GRO HID JAL MEX MIC MOR NAY NLE OAX PUE QUE ROO SLP SIN SON TAB TAM TLA VER YUC ZAC".split(
    " ",
  );
const TOL_M = 15;
const Q = 1e5;

const consulta = (e) =>
  `[out:json][timeout:600];area["ISO3166-2"="MX-${e}"]->.a;` +
  `(way(area.a)["highway"~"^(motorway|trunk|primary)$"]["ref"];` +
  `way(area.a)["highway"~"^(motorway|trunk)$"]["name"];);out tags geom;` +
  // Los mojones de todo el estado (más ligero que `around`, que daba 504); se filtran al armar.
  `node(area.a)["highway"="milestone"];out;`;

async function bajar() {
  mkdirSync(CACHE, { recursive: true });
  for (const e of ESTADOS) {
    const f = join(CACHE, `${e}.json`);
    if (existsSync(f)) continue;
    for (let intento = 1; ; intento++) {
      const r = await fetch(OVERPASS[(intento - 1) % OVERPASS.length], {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: new URLSearchParams({ data: consulta(e) }).toString(),
      }).catch((x) => ({ ok: false, status: String(x) }));
      const d = r.ok ? await r.json().catch(() => null) : null;
      if (d && Array.isArray(d.elements) && !/error|timed out/i.test(d.remark ?? "")) {
        writeFileSync(f, JSON.stringify(d));
        console.log(e, d.elements.length, "elementos");
        break;
      }
      console.log(e, "falló", r.status, d?.remark ?? "", `(intento ${intento})`);
      if (intento >= 6) throw new Error(`Overpass no respondió para ${e}`);
      await new Promise((ok) => setTimeout(ok, 20_000));
    }
    // Una consulta a la vez y con pausa: lo que pide la política de uso de Overpass.
    await new Promise((ok) => setTimeout(ok, 5000));
  }
}

/** Distancia (m) de p al segmento a–b, en un plano local. */
function aSegmento(p, a, b) {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111_320;
  const ax = (a.lon - p.lon) * k, ay = (a.lat - p.lat) * 111_320;
  const bx = (b.lon - p.lon) * k, by = (b.lat - p.lat) * 111_320;
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function simplificar(ps, tol = TOL_M) {
  if (ps.length < 3) return ps;
  const quedan = new Uint8Array(ps.length);
  quedan[0] = quedan[ps.length - 1] = 1;
  const pila = [[0, ps.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop();
    let max = 0, k = -1;
    for (let m = i + 1; m < j; m++) {
      const d = aSegmento(ps[m], ps[i], ps[j]);
      if (d > max) (max = d), (k = m);
    }
    if (max > tol) {
      quedan[k] = 1;
      pila.push([i, k], [k, j]);
    }
  }
  return ps.filter((_, i) => quedan[i]);
}

/** «Encoded polyline» (precisión 1e-5): cada vía como un texto corto. */
function codificar(ps) {
  let s = "", la = 0, lo = 0;
  const num = (v) => {
    let x = v < 0 ? ~(v << 1) : v << 1;
    while (x >= 0x20) {
      s += String.fromCharCode((0x20 | (x & 0x1f)) + 63);
      x >>= 5;
    }
    s += String.fromCharCode(x + 63);
  };
  for (const p of ps) {
    const a = Math.round(p.lat * Q), o = Math.round(p.lon * Q);
    num(a - la);
    num(o - lo);
    (la = a), (lo = o);
  }
  return s;
}

function armar() {
  const vias = new Map();
  const mojones = new Map();
  for (const e of ESTADOS) {
    const d = JSON.parse(readFileSync(join(CACHE, `${e}.json`), "utf8"));
    for (const x of d.elements) {
      if (x.type === "way" && x.geometry?.length > 1) vias.set(x.id, x);
      else if (x.type === "node") {
        const km = Number(String(x.tags?.distance ?? x.tags?.pk ?? "").replace(",", "."));
        if (Number.isFinite(km)) mojones.set(x.id, [Math.round(x.lat * Q), Math.round(x.lon * Q), km]);
      }
    }
  }
  const tabla = (xs) => {
    const lista = [...new Set(xs)].sort();
    return { lista, i: new Map(lista.map((v, i) => [v, i])) };
  };
  const refs = tabla([...vias.values()].map((v) => v.tags.ref ?? ""));
  const nombres = tabla([...vias.values()].map((v) => v.tags.name ?? ""));
  const salida = [];
  for (const v of [...vias.values()].sort((a, b) => a.id - b.id)) {
    const ps = simplificar(v.geometry);
    salida.push([refs.i.get(v.tags.ref ?? ""), nombres.i.get(v.tags.name ?? ""), codificar(ps)]);
  }
  const datos = {
    fuente: "OpenStreetMap (Overpass API)",
    licencia: "ODbL 1.0 · © OpenStreetMap contributors",
    descargado: new Date().toISOString().slice(0, 10),
    script: "tools/datos/carreteras-mx.mjs",
    formato:
      "vias: [ref, nombre, geometría] (índices en refs y nombres; geometría en «encoded polyline», precisión 1e-5); mojones: [lat×1e5, lon×1e5, km]",
    refs: refs.lista,
    nombres: nombres.lista,
    vias: salida,
    mojones: [...mojones.values()],
  };
  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(datos));
  console.log(
    `${salida.length} vías, ${refs.lista.length} refs, ${mojones.size} mojones → ${SALIDA}`,
  );
}

const cmd = process.argv[2];
if (cmd === "bajar") await bajar();
else if (cmd === "armar") armar();
else if (cmd) {
  console.error("Uso: node tools/datos/carreteras-mx.mjs bajar | armar");
  process.exit(2);
}
