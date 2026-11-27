/**
 * «Comparar» de cualquier tanda (René, 2026-11-26): lee los pasos de la tanda en
 * `tools/colaborador/tandas.json`, busca cada salida donde ese paso la escribe (`-Salida`,
 * `-Capturas`) y compara solo lo que la tanda mide; si no mide un «antes», no lo pide.
 *
 * - Los cinco ejemplos en el navegador contra el índice (lo que guarda el índice es lo del navegador)
 *   y contra la tabla sin navegador (`eval/results/ejemplos_en_su_lugar/cifras.json`). Una diferencia
 *   de hasta 1 km/h en la cifra o en una orilla del rango coincide: es la precisión de los toques de la
 *   receta en el mapa (los toques caen en píxeles).
 * - AXA contra el índice, igual.
 * - Las tres narraciones de René, las capturas con el Unity real y el arranque, si la tanda los corre.
 * - Carambolas y cobertura contra el índice, si la tanda los mide.
 * - En qué tarjeta dibujó Chrome en cada paso (`<salida>.gpu.json`, de `tools/demo-local/gpu-uso.ps1`).
 *
 *   node eval/tanda_comparar.mjs [--tanda t11]   (por omisión, la vigente)
 *     → eval/results/<tanda>/comparacion.json (sale con 1 si algo no coincide)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) =>
  r && existsSync(join(RAIZ, r))
    ? JSON.parse(readFileSync(join(RAIZ, r), "utf8").replace(/^﻿/, ""))
    : null;
/** Lo que coincide «con la precisión de los toques». */
export const TOLERANCIA_KMH = 1;

const tandas = leer("tools/colaborador/tandas.json");
const i = process.argv.indexOf("--tanda");
const id = i > 0 ? process.argv[i + 1] : tandas.vigente;
const tanda = tandas.tandas[id];
if (!tanda) throw new Error(`No hay tanda «${id}» en tools/colaborador/tandas.json`);
const pasos = new Map(tanda.pasos.map((p) => [p.nombre, p]));
const opcion = (paso, nombre) =>
  paso ? (new RegExp(`-${nombre}\\s+(\\S+)`).exec(paso.comando)?.[1] ?? null) : null;
const salidaDe = (nombre) => opcion(pasos.get(nombre), "Salida");

const cifras = leer("eval/results/cifras.json")?.cifras ?? {};
const tabla = leer("eval/results/ejemplos_en_su_lugar/cifras.json");
const salida = {
  tanda: id,
  commit: tanda.commit ?? null,
  fecha: new Date().toISOString(),
  tolerancia_kmh: TOLERANCIA_KMH,
  ejemplos: [],
  axa: null,
  tres: null,
  capturas: null,
  arranque: [],
  otras: [],
  gpu: [],
  pendientes: [],
};
let todo = true;
const pct = (d, base) => (base ? `${d > 0 ? "+" : ""}${((100 * d) / base).toFixed(1)} %` : "—");
const rango = (t) => {
  const m = /(\d+)\D+?(\d+)\s*[–-]\s*(\d+)/.exec(t ?? "");
  return m ? { mejor: +m[1], p10: +m[2], p90: +m[3] } : null;
};

/** Una cifra con su rango contra otra: exacta, o dentro de la tolerancia de los toques. */
function comparar(esperada, medida) {
  if (!esperada || !medida) return { estado: "sin dato", diferencias: [] };
  const diferencias = ["mejor", "p10", "p90"]
    .map((k) => [k, medida[k] - Math.round(esperada[k])])
    .filter(([, d]) => d !== 0)
    .map(([k, d]) => ({
      que: k === "mejor" ? "cifra" : k,
      km_h: d,
      porcentaje: pct(d, esperada[k]),
    }));
  const max = Math.max(0, ...diferencias.map((d) => Math.abs(d.km_h)));
  return {
    estado: max === 0 ? "igual" : max <= TOLERANCIA_KMH ? "precisión de los toques" : "distinta",
    diferencias,
  };
}

// --- Los cinco ejemplos y AXA ---
if (pasos.has("ejemplos")) {
  const nav = leer(salidaDe("ejemplos"));
  if (!nav) {
    todo = false;
    salida.pendientes.push(`Sin los ejemplos del navegador (${salidaDe("ejemplos")}).`);
  } else {
    for (const [clave, ejemplo] of [
      ["ejemplos.crucero", "crucero-noche"],
      ["ejemplos.alcance", "alcance-deformacion"],
      ["ejemplos.carambola", "carambola-lluvia"],
      ["ejemplos.reversa", "reversa-pendiente"],
      ["ejemplos.poste", "poste-terraceria"],
    ]) {
      const e = nav.ejemplos.find((x) => x.clave === ejemplo);
      const m = rango(e ? `${e.cifra} (${e.rango})` : null);
      const fila = tabla?.filas.find((f) => f.clave === ejemplo);
      const t = fila?.velocidades.find((v) => v.vehiculo === fila.cifra_de);
      const contraIndice = comparar(cifras[clave], m);
      const contraTabla = comparar(t, m);
      const ok = contraIndice.estado !== "distinta" && contraIndice.estado !== "sin dato";
      if (!ok) todo = false;
      salida.ejemplos.push({
        ejemplo,
        cifra: clave,
        navegador: m ? `${m.mejor} (${m.p10}–${m.p90})` : (e?.sin_cifra ?? "sin cifra"),
        indice: cifras[clave]?.texto ?? null,
        tabla: t ? `${t.mejor} (${t.p10}–${t.p90})` : null,
        contra_indice: contraIndice,
        contra_tabla: contraTabla,
        coincide: ok,
      });
    }
    const a = rango(nav.axa);
    const c = cifras["axa.v2"];
    const r = comparar(c && { mejor: c.mejor, p10: c.p10, p90: c.p90 }, a);
    salida.axa = { indice: c?.texto ?? null, navegador: nav.axa ?? null, ...r };
    if (r.estado === "distinta" || r.estado === "sin dato") todo = false;
  }
}

// --- Las tres narraciones de René ---
if (pasos.has("tres-narraciones")) {
  const t = leer(salidaDe("tres-narraciones"));
  salida.tres = (t?.filas ?? []).map((f) => ({
    clave: f.clave,
    cifra: f.no_cuadra ? "no cuadra" : (/(\d+)\s*km\/h/.exec(f.cifra ?? "")?.[1] ?? null),
  }));
  if ((t?.filas ?? []).length < 3) {
    todo = false;
    salida.pendientes.push(`De las tres narraciones llegaron ${(t?.filas ?? []).length}.`);
  }
}

// --- Las capturas con el Unity real ---
if (pasos.has("final-unity")) {
  const t = leer(salidaDe("final-unity"));
  const carpeta = opcion(pasos.get("final-unity"), "Capturas");
  const hay = carpeta && existsSync(join(RAIZ, carpeta)) ? readdirSync(join(RAIZ, carpeta)) : [];
  salida.capturas = { pruebas: (t?.filas ?? []).map((f) => f.prueba), fotos: hay.length };
  if (!t || !hay.length) {
    todo = false;
    salida.pendientes.push("Sin las capturas con el Unity real (paso final-unity).");
  }
}

// --- El arranque del 3D ---
for (const [nombre, p] of pasos) {
  if (!nombre.startsWith("arranque")) continue;
  const r = salidaDe(nombre);
  if (leer(r)) salida.arranque.push(r);
  else salida.pendientes.push(`Sin la medición del arranque (${nombre}).`);
}

// --- Carambolas y cobertura, contra el índice, si la tanda las mide ---
for (const p of ["prueba", "desarrollo"]) {
  if (!pasos.has(`carambolas-${p}`)) continue;
  const d = leer(`eval/results/cesvi_r4b_carambolas_${p}.json`);
  const medida = d
    ? `${d.impactos_posteriores_ocurridos} de ${d.impactos_posteriores_en_escena}`
    : null;
  const publicada = cifras[`carambolas.${p}`]?.texto ?? null;
  salida.otras.push({ cifra: `carambolas.${p}`, publicada, medida, cambia: medida !== publicada });
  if (!medida) salida.pendientes.push(`Sin la medición de carambolas (${p}).`);
}
if (pasos.has("cobertura")) {
  const d = leer("eval/results/t3_cobertura.json")?.total?.supuestos_sorteados;
  const c = cifras["cobertura.rango"];
  const medida = d ? `${d.dentro} de ${d.velocidades}` : null;
  const publicada = c ? `${c.k} de ${c.n}` : null;
  salida.otras.push({ cifra: "cobertura.rango", publicada, medida, cambia: medida !== publicada });
  if (!medida) salida.pendientes.push("Sin la medición de cobertura.");
}
for (const x of salida.otras) if (x.cambia) todo = false;

// --- En qué tarjeta dibujó Chrome ---
for (const [nombre] of pasos) {
  const r = salidaDe(nombre);
  const g = r ? leer(`${r}.gpu.json`) : null;
  if (g) salida.gpu.push({ paso: nombre, dibujo_en: g.dibujo_en, tarjetas: g.tarjetas });
}

salida.coincide = todo;
const dir = `eval/results/${id}`;
mkdirSync(join(RAIZ, dir), { recursive: true });
writeFileSync(join(RAIZ, dir, "comparacion.json"), `${JSON.stringify(salida, null, 2)}\n`);
for (const e of salida.ejemplos)
  console.log(
    `${e.coincide ? "✓" : "✗"} ${e.ejemplo}: navegador ${e.navegador} · índice ${e.indice} (${e.contra_indice.estado}) · tabla ${e.tabla} (${e.contra_tabla.estado})`,
  );
if (salida.axa)
  console.log(
    `${salida.axa.estado === "distinta" ? "✗" : "✓"} AXA: ${salida.axa.navegador} · índice ${salida.axa.indice}`,
  );
for (const t of salida.tres ?? []) console.log(`  ${t.clave}: ${t.cifra}`);
for (const x of salida.otras)
  console.log(`${x.cambia ? "✗" : "✓"} ${x.cifra}: ${x.medida} (publicada ${x.publicada})`);
for (const g of salida.gpu) console.log(`  GPU en ${g.paso}: ${g.dibujo_en ?? "sin dato"}`);
for (const p of salida.pendientes) console.log(`  pendiente: ${p}`);
console.log(todo ? "Todo coincide con lo publicado." : "Algo no coincide: va a René.");
process.exit(todo ? 0 : 1);
