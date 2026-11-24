/**
 * La t9 (René, 2026-11-24): la tanda final de los tres casos, fijada al commit con todo. Como la t8
 * (eval/t8_comparar.mjs), más:
 *
 * - Los cinco ejemplos en el navegador contra la tabla de esta rama
 *   (`eval/results/tres_narraciones/cifras_despues.json`, la misma medición sin navegador con el código
 *   de este commit) y contra la publicada (`eval/results/ronda4_cifras/despues.json`). Coincidir con la
 *   de la rama es lo que se espera; lo que difiera de la publicada (la reversa, por la corrección de La
 *   escena) va a René con su antes y después.
 * - Las tres narraciones de René (`eval/results/t9/tres_narraciones.json`): su cifra o el «no cuadra», y
 *   su captura del 3D.
 *
 *   node eval/t9_comparar.mjs   → eval/results/t9/comparacion.json (sale con 1 si algo no coincide)
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
const tabla = leer("eval/results/tres_narraciones/cifras_despues.json");
const publicada = leer("eval/results/ronda4_cifras/despues.json");
const nav = leer("eval/results/t9/ejemplos.json");
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
    const pub = publicada?.filas
      .find((f) => f.clave === fila.clave)
      ?.velocidades.find((x) => x.vehiculo === fila.cifra_de);
    const contraPublicada =
      pub && e?.cifra && rango
        ? comparar(pub, Number(e.cifra), Number(rango[1]), Number(rango[2]))
        : null;
    salida.ejemplos.push({
      clave: fila.clave,
      vehiculo: fila.cifra_de,
      tabla: `${v.mejor} (${v.p10}–${v.p90})`,
      publicada: pub ? `${pub.mejor} (${pub.p10}–${pub.p90})` : null,
      contra_publicada: contraPublicada?.diferencias ?? null,
      navegador:
        e?.cifra && rango ? `${e.cifra} (${rango[1]}–${rango[2]})` : (e?.sin_cifra ?? "sin cifra"),
      diferencias: r.diferencias,
      coincide,
    });
  }
}

// --- Lo que publica el índice: el crucero en la app y el poste ---
{
  const app = leer("eval/results/t9/crucero_en_la_app.json");
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
    "rene-arbol-curva",
    "rene-peaton-vuelta",
    "rene-carambola-semaforo",
  ]) {
    const n = hay.filter((f) => f.startsWith(`${clave}-`) && /\.jpe?g$/.test(f)).length;
    salida.capturas.push({ clave, capturas: n });
    if (!n) salida.pendientes.push(`Sin captura del 3D: ${clave}.`);
  }
}

// --- Las tres narraciones de René: su cifra o el «no cuadra» ---
{
  const t = leer("eval/results/t9/tres_narraciones.json");
  salida.tres = [];
  for (const clave of ["rene-arbol-curva", "rene-peaton-vuelta", "rene-carambola-semaforo"]) {
    const f = t?.filas?.find((x) => x.clave === clave);
    if (!f) {
      todoCoincide = false;
      salida.pendientes.push(`Sin resultado en el navegador: ${clave}.`);
      continue;
    }
    const m = /(\d+)\s*km\/h/.exec(f.cifra ?? "");
    salida.tres.push({
      clave,
      cifra: f.no_cuadra ? "no cuadra" : (m?.[1] ?? null),
      texto: f.cifra,
      peaton_en_la_escena: f.peaton_en_la_escena ?? 0,
    });
  }
}

// --- El arranque del 3D: los dos builds, para la revisión ---
{
  const carpeta = join(RAIZ, "eval/results/t9");
  const hay = existsSync(carpeta)
    ? readdirSync(carpeta).filter((f) => f.startsWith("arranque_"))
    : [];
  for (const f of hay.sort()) salida.arranque.push(f);
  if (!hay.length) salida.pendientes.push("Sin mediciones del arranque del 3D.");
}

salida.coincide = todoCoincide;
mkdirSync(join(RAIZ, "eval/results/t9"), { recursive: true });
writeFileSync(
  join(RAIZ, "eval/results/t9/comparacion.json"),
  `${JSON.stringify(salida, null, 2)}\n`,
);
for (const e of salida.ejemplos)
  console.log(`${e.coincide ? "✓" : "✗"} ${e.clave}: tabla ${e.tabla} · navegador ${e.navegador}`);
for (const i of salida.indice)
  console.log(`${i.coincide ? "✓" : "✗"} ${i.cifra}: índice ${i.indice} · medida ${i.medida}`);
console.log(
  `${salida.axa.coincide ? "✓" : "✗"} AXA: índice ${salida.axa.indice} · navegador ${salida.axa.navegador ?? "sin dato"}`,
);
for (const e of salida.ejemplos)
  if (e.contra_publicada?.length)
    console.log(
      `  ${e.clave} contra lo publicado ${e.publicada}: ${e.contra_publicada.map((d) => `${d.que} ${d.km_h > 0 ? "+" : ""}${d.km_h} km/h (${d.porcentaje})`).join(", ")}`,
    );
for (const t of salida.tres ?? []) console.log(`  ${t.clave}: ${t.cifra}`);
for (const c of salida.capturas) console.log(`  capturas ${c.clave}: ${c.capturas}`);
for (const p of salida.pendientes) console.log(`  pendiente: ${p}`);
console.log(
  todoCoincide
    ? "Todo coincide con lo publicado."
    : "Algo no coincide con lo publicado: va a René.",
);
process.exit(todoCoincide ? 0 : 1);
