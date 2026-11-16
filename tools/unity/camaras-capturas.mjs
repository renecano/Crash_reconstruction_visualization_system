#!/usr/bin/env node
/**
 * Una captura de cada cámara del 3D en AXA, una carambola de tres vehículos y un peatón (René,
 * 2026-11-16, A6), con el build web local. Las cámaras salen de `Build/casos-camaras/camaras.json`
 * (las mismas de la app); las del daño, en el instante del impacto, y las demás, 1 s después.
 *
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-camaras.ts
 *   node tools/unity/camaras-capturas.mjs [--salida docs/cesvi/ronda-2/camaras]
 *     → <salida>/<caso>/… y <salida>/camaras.json (qué archivo es qué cámara)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "../..");
const i = process.argv.indexOf("--salida");
const SALIDA = resolve(RAIZ, i > 0 ? process.argv[i + 1] : "docs/cesvi/ronda-2/camaras");
const camaras = JSON.parse(
  readFileSync(join(RAIZ, "apps/visor-unity/Build/casos-camaras/camaras.json"), "utf8"),
);
const indice = {};
for (const [caso, lista] of Object.entries(camaras)) {
  for (const [tiempo, cuales] of [
    ["1", lista.filter((c) => !c.alImpacto)],
    ["0", lista.filter((c) => c.alImpacto)],
  ]) {
    if (!cuales.length) continue;
    const r = spawnSync(
      process.execPath,
      [
        join(RAIZ, "tools/unity/capturas.mjs"),
        "--casos",
        "casos-camaras",
        "--solo",
        caso,
        "--vistas",
        cuales.map((c) => c.modo).join(","),
        "--tiempos",
        tiempo,
        "--sin-fps",
        "--nivel",
        "alta",
        "--salida",
        join(SALIDA, caso),
      ],
      { stdio: "inherit" },
    );
    if (r.status !== 0) throw new Error(`${caso}: las capturas salieron con ${r.status}`);
  }
  // Qué archivo es qué cámara, con su nombre para el perito.
  const archivos = readdirSync(join(SALIDA, caso)).filter((f) => /\.(webp|png)$/.test(f));
  indice[caso] = lista.map((c) => ({
    ...c,
    archivo: archivos.find((f) => f.endsWith(`-${c.modo.replaceAll(":", "-")}.webp`)) ?? null,
  }));
}
writeFileSync(join(SALIDA, "camaras.json"), `${JSON.stringify(indice, null, 2)}\n`);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(indice).map(([k, v]) => [k, v.filter((x) => !x.archivo).map((x) => x.modo)]),
    ),
  ),
);
