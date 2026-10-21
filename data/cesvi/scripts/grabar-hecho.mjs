/**
 * Graba la lectura de Claude de la descripción técnica de ejemplo y de la declaración del caso
 * A2010930 (ADR 0055), para la e2e y las pruebas: CI no llama a la API.
 *
 * Pide las dos lecturas a `POST /api/cesvi/hecho` de un servidor local con la llave de Claude
 * (`pnpm start` con `.env.local`) y guarda las respuestas tal cual en
 * `data/cesvi/grabaciones/hecho-A2010930.json`. Falla si alguna se leyó con reglas.
 *
 * Uso: `node data/cesvi/scripts/grabar-hecho.mjs [url]` (por omisión, http://localhost:3000)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const URL_BASE = process.argv[2] ?? "http://localhost:3000";
const ejemplo = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/casos/A2010930-hecho.json"), "utf8"),
);
const caso = JSON.parse(readFileSync(join(RAIZ, "data/cesvi/casos/A2010930.json"), "utf8"));
const vehiculos = {
  A: `${caso.vehiculos.A.marca} ${caso.vehiculos.A.tipo}`,
  B: `${caso.vehiculos.B.marca} ${caso.vehiculos.B.tipo}`,
};

const lecturas = {};
let costo = 0;
for (const [tipo, texto] of [
  ["descripcion", ejemplo.descripcion],
  ["declaracion", caso.declaracion.texto],
]) {
  const r = await fetch(`${URL_BASE}/api/cesvi/hecho`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, texto, vehiculos, declarante: ejemplo.declarante }),
  });
  const d = await r.json();
  if (!r.ok || d.metodo !== "claude") {
    console.error(`${tipo}: no se leyó con Claude (${d.motivo ?? d.error ?? r.status}).`);
    process.exit(1);
  }
  lecturas[tipo] = { texto, ...d, requestId: undefined };
  costo += d.costoUsd;
  console.log(`${tipo}: ${d.modeloRespuesta}, ${d.costoUsd.toFixed(4)} USD`);
}

const salida = join(RAIZ, "data/cesvi/grabaciones/hecho-A2010930.json");
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(
  salida,
  `${JSON.stringify({ caso: "A2010930", grabado: new Date().toISOString(), costoUsd: costo, lecturas }, null, 2)}\n`,
);
console.log(`${salida}: ${costo.toFixed(4)} USD en total`);
