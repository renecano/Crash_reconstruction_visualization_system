// Agrega a eval/t3_cobertura.mts la salida caso por caso (CROQUIS_DETALLE=<archivo>), sin cambiar
// nada de lo que mide: para comparar dos versiones del código caso por caso (René, 2026-11-27).
import { readFileSync, writeFileSync } from "node:fs";
const ruta = process.argv[2];
let s = readFileSync(ruta, "utf8");
const a = "    por.sorteados.push(...sorteados);";
const b = "writeFileSync(SALIDA";
if (!s.includes(a) || !s.includes(b)) throw new Error("No encontré dónde agregar el detalle");
s = s.replace(
  a,
  `${a}\n    for (const e of sorteados) DETALLE.push({ escena: nombre, caso: k, ...e });\n    for (const e of fijos) DETALLE_FIJOS.push({ escena: nombre, caso: k, ...e });`,
);
s = s.replace(
  b,
  `if (process.env.CROQUIS_DETALLE) writeFileSync(process.env.CROQUIS_DETALLE, JSON.stringify({ git_commit: git, sorteados: DETALLE, fijos: DETALLE_FIJOS }));\n${b}`,
);
s = s.replace("const t0 = Date.now();", "const t0 = Date.now();\nconst DETALLE: unknown[] = [];\nconst DETALLE_FIJOS: unknown[] = [];");
writeFileSync(ruta, s);
console.log("detalle agregado");
