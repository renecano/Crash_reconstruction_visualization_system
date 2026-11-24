/**
 * La t8 (René, 2026-11-23): verificación en el navegador contra lo que quedó publicado con el #284.
 *
 * - Los cinco ejemplos en el navegador (`eval/results/t8/ejemplos.json`, la e2e de la demo local, con
 *   su receta y sin calles del mapa) contra la tabla aprobada de la ronda 4
 *   (`eval/results/ronda4_cifras/despues.json`): la cifra exacta y las orillas del rango con ±1 km/h
 *   de redondeo, como en la t6; cada diferencia, con su porcentaje.
 * - El crucero como lo ve el perito en la app (`eval/results/t8/crucero_en_la_app.json`, con las calles
 *   reales) contra el índice de cifras (`ejemplos.crucero`); el poste, contra `ejemplos.poste`.
 * - AXA en el navegador contra el índice (`axa.v2`).
 * - Las capturas del 3D de las narraciones, de Tollocan y del caso encimado: que estén.
 * - El arranque del 3D: los archivos de cada build, para compararlos en la revisión.
 *
 *   node eval/t8_comparar.mjs   → eval/results/t8/comparacion.json (sale con 1 si algo no coincide)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) =>
  existsSync(join(RAIZ, r)) ? JSON.parse(readFileSync(join(RAIZ, r), "utf8")) : null;
const cifras = leer("eval/results/cifras.json")?.cifras ?? {};
const salida = {
  fecha: new Date().toISOString(),
  ejemplos: [],
  indice: [],
  axa: null,
  capturas: [],
  arranque: [],
  pendientes: [],
};
let todoCoincide = true;
const pct = (d, base) => (base ? `${d > 0 ? "+" : ""}${((100 * d) / base).toFixed(1)} %` : "—");

/** Una cifra con su rango contra la esperada: exacta, y las orillas con ±1 km/h. */
function comparar(esperada, cifra, p10, p90) {
  const diferencias = [
    ["cifra", cifra - esperada.mejor, esperada.mejor],
    ["p10", p10 - esperada.p10, esperada.p10],
    ["p90", p90 - esperada.p90, esperada.p90],
  ]
    .filter(([, d]) => d !== 0)
    .map(([que, d, base]) => ({ que, km_h: d, porcentaje: pct(d, base) }));
  const coincide =
    cifra === esperada.mejor &&
    Math.abs(p10 - esperada.p10) <= 1 &&
    Math.abs(p90 - esperada.p90) <= 1;
  return { diferencias, coincide };
}

// --- Los cinco ejemplos en el navegador, contra la tabla aprobada ---
const tabla = leer("eval/results/ronda4_cifras/despues.json");
const nav = leer("eval/results/t8/ejemplos.json");
if (!tabla || !nav) {
  todoCoincide = false;
  salida.pendientes.push("Faltan los ejemplos del navegador o la tabla aprobada.");
} else {
  for (const fila of tabla.filas.filter((f) => f.grupo === "ejemplo")) {
    const v = fila.velocidades.find((x) => x.vehiculo === fila.cifra_de);
    const e = nav.ejemplos.find((x) => x.clave === fila.clave);
    const letra = /^([A-Z])\s/.exec(e?.de_quien ?? "")?.[1];
    const deQuien = letra ? `V${letra.charCodeAt(0) - 64}` : null;
    const rango = /(\d+)\s*–\s*(\d+)/.exec(e?.rango ?? "");
    const r =
      e?.cifra && rango
        ? comparar(v, Number(e.cifra), Number(rango[1]), Number(rango[2]))
        : { diferencias: [], coincide: false };
    const coincide = r.coincide && deQuien === fila.cifra_de;
    if (!coincide) todoCoincide = false;
    salida.ejemplos.push({
      clave: fila.clave,
      vehiculo: fila.cifra_de,
      tabla: `${v.mejor} (${v.p10}–${v.p90})`,
      navegador:
        e?.cifra && rango ? `${e.cifra} (${rango[1]}–${rango[2]})` : (e?.sin_cifra ?? "sin cifra"),
      diferencias: r.diferencias,
      coincide,
    });
  }
}

// --- Lo que publica el índice: el crucero en la app y el poste ---
{
  const app = leer("eval/results/t8/crucero_en_la_app.json");
  const c = cifras["ejemplos.crucero"];
  const r =
    app && c ? comparar(c, app.velocidad.mejor, app.velocidad.p10, app.velocidad.p90) : null;
  if (!r?.coincide) todoCoincide = false;
  salida.indice.push({
    cifra: "ejemplos.crucero",
    indice: c?.texto ?? null,
    medida: app ? `${app.velocidad.mejor} km/h (${app.velocidad.p10}–${app.velocidad.p90})` : null,
    diferencias: r?.diferencias ?? [],
    coincide: Boolean(r?.coincide),
  });
  const p = cifras["ejemplos.poste"];
  const e = salida.ejemplos.find((x) => x.clave === "poste-terraceria");
  const m = /(\d+) \((\d+)–(\d+)\)/.exec(e?.navegador ?? "");
  const rp = p && m ? comparar(p, Number(m[1]), Number(m[2]), Number(m[3])) : null;
  if (!rp?.coincide) todoCoincide = false;
  salida.indice.push({
    cifra: "ejemplos.poste",
    indice: p?.texto ?? null,
    medida: e?.navegador ?? null,
    diferencias: rp?.diferencias ?? [],
    coincide: Boolean(rp?.coincide),
  });
}

// --- AXA en el navegador, contra el índice ---
{
  const axa = nav?.axa ?? null;
  const c = cifras["axa.v2"];
  // «57 (55–78)»: la cifra y su rango, no el texto entero (en la t8, el «57» salía de las marcas del
  // eje de la gráfica y la cifra, leída a media cuenta, decía 20).
  const m = /^(\d+)\s*\((\d+)–(\d+)\)/.exec(axa ?? "");
  const r =
    m && c
      ? comparar(
          { mejor: Math.round(c.mejor), p10: Math.round(c.p10), p90: Math.round(c.p90) },
          Number(m[1]),
          Number(m[2]),
          Number(m[3]),
        )
      : null;
  const ok = Boolean(r?.coincide);
  if (!ok) todoCoincide = false;
  salida.axa = { indice: c?.texto ?? null, navegador: axa, coincide: ok };
}

// --- Las capturas del 3D: las narraciones, Tollocan y el caso encimado ---
{
  const carpeta = join(RAIZ, "docs/cesvi/ronda-4/evidencia/fisica");
  const hay = existsSync(carpeta) ? readdirSync(carpeta) : [];
  for (const clave of [
    "arbol",
    "poste",
    "puente",
    "subida",
    "bajada",
    "curva",
    "tollocan",
    "encimado-antes",
    "encimado-despues",
  ]) {
    const n = hay.filter((f) => f.startsWith(`${clave}-`) && /\.jpe?g$/.test(f)).length;
    salida.capturas.push({ clave, capturas: n });
    if (!n) salida.pendientes.push(`Sin captura del 3D: ${clave}.`);
  }
}

// --- El arranque del 3D: los dos builds, para la revisión ---
{
  const carpeta = join(RAIZ, "eval/results/t8");
  const hay = existsSync(carpeta)
    ? readdirSync(carpeta).filter((f) => f.startsWith("arranque_"))
    : [];
  for (const f of hay.sort()) salida.arranque.push(f);
  if (!hay.length) salida.pendientes.push("Sin mediciones del arranque del 3D.");
}

salida.coincide = todoCoincide;
mkdirSync(join(RAIZ, "eval/results/t8"), { recursive: true });
writeFileSync(
  join(RAIZ, "eval/results/t8/comparacion.json"),
  `${JSON.stringify(salida, null, 2)}\n`,
);
for (const e of salida.ejemplos)
  console.log(`${e.coincide ? "✓" : "✗"} ${e.clave}: tabla ${e.tabla} · navegador ${e.navegador}`);
for (const i of salida.indice)
  console.log(`${i.coincide ? "✓" : "✗"} ${i.cifra}: índice ${i.indice} · medida ${i.medida}`);
console.log(
  `${salida.axa.coincide ? "✓" : "✗"} AXA: índice ${salida.axa.indice} · navegador ${salida.axa.navegador ?? "sin dato"}`,
);
for (const c of salida.capturas) console.log(`  capturas ${c.clave}: ${c.capturas}`);
for (const p of salida.pendientes) console.log(`  pendiente: ${p}`);
console.log(
  todoCoincide
    ? "Todo coincide con lo publicado."
    : "Algo no coincide con lo publicado: va a René.",
);
process.exit(todoCoincide ? 0 : 1);
