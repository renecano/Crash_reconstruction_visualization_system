/**
 * La t6 (René, 2026-11-21): ¿lo que calcula el navegador es lo que aprobó René?
 *
 * - Los cinco ejemplos en el navegador (`eval/results/t6/ejemplos_despues.json`, la e2e de la demo
 *   local) contra la tabla aprobada (`eval/results/ronda4_cifras/despues.json`): la cifra y su rango,
 *   exactos. Si alguno no coincide, no se publica: va a René.
 * - AXA en el navegador (las fotos del recorrido «solo-cesvi» anotan su cifra): 57 (55–78).
 * - Carambolas (prueba y desarrollo) y cobertura: el antes (producción, en `eval/results/t6/antes/`)
 *   y el después (este commit, en `eval/results/`). Si cambian, van a René con las dos cifras.
 * - «91 de 156» necesita los textos crudos de CESVI (fuera de git): se mide en la laptop de René.
 *
 *   node eval/t6_comparar.mjs   → eval/results/t6/comparacion.json (sale con 1 si algo no coincide)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) =>
  existsSync(join(RAIZ, r)) ? JSON.parse(readFileSync(join(RAIZ, r), "utf8")) : null;
const salida = {
  fecha: new Date().toISOString(),
  ejemplos: [],
  axa: null,
  otras: [],
  pendientes: [],
};
let todoCoincide = true;

// --- Los cinco ejemplos: navegador contra la tabla aprobada ---
const tabla = leer("eval/results/ronda4_cifras/despues.json");
const nav = leer("eval/results/t6/ejemplos_despues.json");
if (!tabla || !nav) {
  todoCoincide = false;
  salida.pendientes.push("Faltan los ejemplos del navegador o la tabla aprobada.");
} else {
  for (const fila of tabla.filas.filter((f) => f.grupo === "ejemplo")) {
    const v = fila.velocidades.find((x) => x.vehiculo === fila.cifra_de);
    const esperado = `${v.mejor} (${v.p10}–${v.p90})`;
    const e = nav.ejemplos.find((x) => x.clave === fila.clave);
    // «A · VW Jetta» → V1; «rango 10–28» → 10–28.
    const letra = /^([A-Z])\s/.exec(e?.de_quien ?? "")?.[1];
    const deQuien = letra ? `V${letra.charCodeAt(0) - 64}` : null;
    const rango = /(\d+)\s*–\s*(\d+)/.exec(e?.rango ?? "");
    const navegador = e?.cifra && rango ? `${e.cifra} (${rango[1]}–${rango[2]})` : null;
    const coincide = navegador === esperado && deQuien === fila.cifra_de;
    if (!coincide) todoCoincide = false;
    salida.ejemplos.push({
      clave: fila.clave,
      vehiculo: fila.cifra_de,
      tabla: esperado,
      navegador: navegador ?? e?.sin_cifra ?? "sin cifra",
      de_quien_navegador: e?.de_quien ?? null,
      coincide,
    });
  }
}

// --- AXA en el navegador ---
const fotos = leer("recorrido/solo-cesvi/resumen.json");
const axa = fotos?.cifras?.axa ?? null;
const cifras = leer("eval/results/cifras.json");
const axaEsperada = cifras?.cifras?.["axa.v2"];
const axaOk = Boolean(
  axa &&
  axaEsperada &&
  axa.includes(String(Math.round(axaEsperada.mejor))) &&
  axa.includes(`${Math.round(axaEsperada.p10)}–${Math.round(axaEsperada.p90)}`),
);
if (!axaOk) todoCoincide = false;
salida.axa = { esperado: axaEsperada?.texto ?? null, navegador: axa, coincide: axaOk };

// --- Carambolas y cobertura: antes y después ---
const tasa = (doc, k, n) => (doc ? `${doc[k]} de ${doc[n]}` : null);
for (const p of ["prueba", "desarrollo"]) {
  const a = leer(`eval/results/t6/antes/cesvi_r4b_carambolas_${p}.json`);
  const d = leer(`eval/results/cesvi_r4b_carambolas_${p}.json`);
  const k = "impactos_posteriores_ocurridos";
  const n = "impactos_posteriores_en_escena";
  const fila = {
    cifra: `carambolas.${p}`,
    publicada: cifras?.cifras?.[`carambolas.${p}`]?.texto ?? null,
    antes: tasa(a, k, n),
    despues: tasa(d, k, n),
  };
  fila.cambia = fila.antes !== fila.despues;
  salida.otras.push(fila);
}
{
  const a = leer("eval/results/t6/antes/t3_cobertura.json")?.total?.supuestos_sorteados;
  const d = leer("eval/results/t3_cobertura.json")?.total?.supuestos_sorteados;
  const fila = {
    cifra: "cobertura.rango",
    publicada: (() => {
      const c = cifras?.cifras?.["cobertura.rango"];
      return c ? `${c.k} de ${c.n}` : null;
    })(),
    antes: a ? `${a.dentro} de ${a.velocidades}` : null,
    despues: d ? `${d.dentro} de ${d.velocidades}` : null,
  };
  fila.cambia = fila.antes !== fila.despues;
  salida.otras.push(fila);
}
salida.pendientes.push(
  "«91 de 156» (er4.modalidad_titulo) necesita data/raw/cesvi: se mide en la laptop de René.",
);
salida.publicar = todoCoincide && !salida.otras.some((x) => x.cambia || !x.despues);

mkdirSync(join(RAIZ, "eval/results/t6"), { recursive: true });
writeFileSync(
  join(RAIZ, "eval/results/t6/comparacion.json"),
  `${JSON.stringify(salida, null, 2)}\n`,
);
for (const e of salida.ejemplos)
  console.log(`${e.coincide ? "✓" : "✗"} ${e.clave}: tabla ${e.tabla} · navegador ${e.navegador}`);
console.log(`${axaOk ? "✓" : "✗"} AXA: ${axaEsperada?.texto} · navegador ${axa ?? "sin dato"}`);
for (const o of salida.otras)
  console.log(
    `${o.cambia ? "≠" : "="} ${o.cifra}: publicada ${o.publicada} · antes ${o.antes} · después ${o.despues}`,
  );
console.log(salida.publicar ? "Todo coincide." : "Algo no coincide: no se publica; va a René.");
process.exit(salida.publicar ? 0 : 1);
