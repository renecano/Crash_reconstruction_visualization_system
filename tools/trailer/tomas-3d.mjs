#!/usr/bin/env node
/**
 * Tomas del 3D de Unity para el tráiler (René, 2026-11-16): a 4K (3840×2160), con la cámara y el
 * instante que pide cada toma, en el build web local, en PNG. Solo escenas sintéticas de referencia
 * (las de D1 de `Build/casos`, de `paquetes-d1.ts`): nunca AXA ni un caso real. Reusa el capturador
 * de las escenas (`tools/unity/capturas.mjs`).
 *
 *   powershell tools/unity/build-web.ps1                      (si no hay build web)
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts
 *   node tools/trailer/tomas-3d.mjs [plan.json] [--salida trailer-salida/tomas] [--nivel ultra]
 *
 * El plan (por defecto `apps/trailer/tomas.json`) es una lista de tomas:
 *   { "escena": "lateral_interseccion-dia", "camara": "cinematica", "t": [0, 0.5, 1] }
 * `camara` es un modo del puente (`cinematica`, `orbita`, `cenital`, `acera`, `conductor:<id>`,
 * `cerca:<id>:<azimut>:<distancia>:<altura>`, `persona:<id>`); `t` son segundos del Resultado
 * (0 es el impacto): un número es una foto; una lista, una secuencia de cuadros.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "../..");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const planRuta =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : join(RAIZ, "apps/trailer/tomas.json");
const SALIDA = resolve(
  arg(
    "salida",
    process.env.CROQUIS_TRAILER
      ? join(process.env.CROQUIS_TRAILER, "tomas")
      : join(RAIZ, "trailer-salida", "tomas"),
  ),
);
const NIVEL = arg("nivel", "ultra");
const CASOS = join(RAIZ, "apps/visor-unity/Build/casos");

const plan = JSON.parse(readFileSync(resolve(planRuta), "utf8"));
for (const toma of plan) {
  // Nunca AXA ni otro caso real: solo las escenas sintéticas de referencia.
  if (/axa|cesvi|siniestro/i.test(toma.escena))
    throw new Error(
      `«${toma.escena}» no es una escena sintética de referencia: el tráiler no usa casos reales.`,
    );
  if (!existsSync(join(CASOS, `${toma.escena}.json`)))
    throw new Error(`No hay ${toma.escena}.json en Build/casos: corre paquetes-d1.ts.`);
}
mkdirSync(SALIDA, { recursive: true });
for (const toma of plan) {
  const tiempos = Array.isArray(toma.t) ? toma.t : [toma.t ?? 0];
  const r = spawnSync(
    process.execPath,
    [
      join(RAIZ, "tools/unity/capturas.mjs"),
      "--solo",
      toma.escena,
      "--vistas",
      toma.camara,
      "--tiempos",
      tiempos.join(","),
      "--ancho",
      "3840",
      "--alto",
      "2160",
      "--nivel",
      NIVEL,
      "--png",
      "--sin-fps",
      "--salida",
      SALIDA,
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0)
    throw new Error(`${toma.escena} (${toma.camara}): el capturador salió con ${r.status}`);
}
process.stdout.write(`Tomas en ${SALIDA}\n`);
