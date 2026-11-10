/**
 * W5: `/api/relieve` medido en producción (Vercel), con los mismos tres lugares de prueba que
 * `eval/js/w5_relieve.ts` (no son casos). Cada lugar se pide dos veces con una URL que nadie ha
 * pedido antes (la CDN no la tiene: `x-vercel-cache: MISS`, la función arma la malla) y dos veces
 * más con la misma URL (la CDN la tiene: `HIT`). Sale a la red: no corre en CI.
 *
 *   node eval/w5_relieve_vercel.mjs [https://croquis-sage.vercel.app]
 *
 * Escribe `eval/results/w5_relieve_vercel.json`.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "https://croquis-sage.vercel.app";
const LUGARES = [
  { lugar: "Toluca, centro (aprox.)", lat: 19.2926, lon: -99.6569 },
  { lugar: "La Marquesa, carretera México–Toluca (aprox.)", lat: 19.299, lon: -99.371 },
  { lugar: "Mérida, centro (aprox.)", lat: 20.9674, lon: -89.6237 },
];

async function pedir(url) {
  const t0 = performance.now();
  const r = await fetch(url);
  const cuerpo = await r.text();
  const ms = Math.round(performance.now() - t0);
  let fuente = null;
  let nodos = null;
  try {
    const j = JSON.parse(cuerpo);
    fuente = j.fuente ?? null;
    nodos = j.ancho ? `${j.ancho} × ${j.alto}` : null;
  } catch {
    // Una respuesta que no es JSON se guarda sin fuente.
  }
  return {
    http: r.status,
    ms,
    bytes: cuerpo.length,
    cache: r.headers.get("x-vercel-cache"),
    fuente,
    nodos,
  };
}

const version = await (await fetch(`${BASE}/api/version`)).json();
const marca = Date.now() % 100_000;
const filas = [];
for (const [k, l] of LUGARES.entries()) {
  for (const intento of [0, 1]) {
    // Un lado que redondea a la misma malla de 600 m, distinto en cada corrida: la CDN no lo tiene.
    const lado = (600 + (marca * 2 + k * 2 + intento) / 1e6).toFixed(6);
    const url = `${BASE}/api/relieve?lat=${l.lat}&lon=${l.lon}&lado_m=${lado}`;
    const sin = await pedir(url);
    const con = await pedir(url);
    filas.push({ ...l, intento: intento + 1, sin_cache: sin, con_cache: con });
    console.log(l.lugar, intento + 1, sin.ms, sin.cache, "→", con.ms, con.cache, sin.fuente);
  }
}

const salida = resolve(dirname(fileURLToPath(import.meta.url)), "results/w5_relieve_vercel.json");
writeFileSync(
  salida,
  `${JSON.stringify(
    {
      que: "Tiempo de /api/relieve en producción: sin caché de la CDN (la función arma la malla) y con caché",
      base: BASE,
      commit: version.commit ?? null,
      fecha: new Date().toISOString(),
      nota: "Tiempo total visto desde la laptop de desarrollo (incluye su red hasta Vercel). El segundo intento sin caché puede caer en una función ya caliente, con los mosaicos en memoria.",
      mediciones: filas,
    },
    null,
    2,
  )}\n`,
);
console.log(`Escrito ${salida}`);
