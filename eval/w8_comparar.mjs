#!/usr/bin/env node
/**
 * W8 · T3.2 (ADR 0135): las mediciones de CESVI y de la E-R4 con el solver de la copia de trabajo,
 * para el antes y el después que pidió René antes de fusionar. Sin API: todo con lecturas grabadas.
 * Reanudable: un paso cuya salida ya existe no se repite.
 *
 *   node eval/w8_comparar.mjs <antes|despues>   → eval/results/w8/<etiqueta>/
 *
 * - `axa_rango_estable.json`: AXA como la app (resultado completo de producción), 20 semillas.
 * - `cesvi_r4_inversion.json`: las 205 narraciones de prueba de CESVI, leídas, por la inversión.
 * - `e_r4_prueba.json`: la E-R4 (reproducción de lo que concluyó CESVI) con las lecturas grabadas.
 * - `carambolas_prueba.json`: las carambolas de CESVI (R6) de la partición de prueba.
 *
 * El «antes» se corre con el solver de `main` (los cambios del solver apartados con `git stash`).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "..");
const CESVI = join(RAIZ, "packages/cesvi");
const etiqueta = process.argv[2];
if (!["antes", "despues"].includes(etiqueta)) {
  console.error("Uso: node eval/w8_comparar.mjs <antes|despues>");
  process.exit(1);
}
const DIR = join(RAIZ, "eval/results/w8", etiqueta);
mkdirSync(DIR, { recursive: true });

function correr(nombre, args, salida, despues) {
  const destino = join(DIR, salida);
  if (existsSync(destino)) {
    console.log(`[${new Date().toISOString()}] ${nombre}: ya estaba`);
    return;
  }
  console.log(`[${new Date().toISOString()}] ${nombre}…`);
  const t = Date.now();
  const r = spawnSync("pnpm", ["exec", "tsx", ...args], {
    cwd: CESVI,
    shell: true,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(`${nombre} terminó con ${r.status}`);
    process.exit(3);
  }
  despues?.(destino);
  console.log(
    `[${new Date().toISOString()}] ${nombre}: ${((Date.now() - t) / 60000).toFixed(1)} min`,
  );
}

correr(
  "AXA",
  ["../../eval/axa_rango_estable.mts", join(DIR, "axa_rango_estable.json"), `w8-${etiqueta}`],
  "axa_rango_estable.json",
);
correr(
  "inversión en las narraciones de CESVI",
  ["../../eval/cesvi_r4_inversion.mts", join(DIR, "cesvi_r4_inversion.json")],
  "cesvi_r4_inversion.json",
);
correr(
  "E-R4 (prueba)",
  ["../../eval/cesvi_r4_reproduccion.mts", "medir", "prueba", join(DIR, "e_r4_prueba.json")],
  "e_r4_prueba.json",
);
// Las carambolas escriben en su archivo de siempre: se copia y se deja el publicado como estaba.
correr(
  "carambolas (prueba)",
  ["../../eval/cesvi_r6_carambolas.mts", "medir", "prueba"],
  "carambolas_prueba.json",
  (destino) => {
    const publicado = join(RAIZ, "eval/results/cesvi_r4b_carambolas_prueba.json");
    copyFileSync(publicado, destino);
    spawnSync("git", ["checkout", "--", "eval/results/cesvi_r4b_carambolas_prueba.json"], {
      cwd: RAIZ,
    });
  },
);
console.log("Listo.");
