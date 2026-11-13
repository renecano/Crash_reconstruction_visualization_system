#!/usr/bin/env node
/**
 * W8 · T3.2 (ADR 0135): el antes y el después de las escenas de referencia. Compara los resultados
 * guardados en `origin/main` (el solver de antes; o la referencia que se pase) con los regenerados en la copia de trabajo
 * (`uv run croquis-solver reconstruct --all`, el solver nuevo): las 14 escenas canónicas, las 4 de
 * la inversión y las 5 de los agentes.
 *
 *   node eval/w8_referencias.mjs [ref] → eval/results/w8/referencias.json
 *
 * Por escena: el punto de impacto, la velocidad al impacto, el ΔV y la pose final de cada vehículo,
 * lo que estimó la inversión (mejor, p10, p90 e identificable) y las banderas que aparecen o se van.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const F = "packages/scene-schema/fixtures";
const CARPETAS = [
  `${F}/resultados`,
  `${F}/inversion/resultados`,
  `${F}/agentes/resultados`,
  `${F}/c1/resultados`,
];
const REF = process.argv[2] ?? "origin/main";
const r2 = (x) => (typeof x === "number" ? Math.round(x * 100) / 100 : x);

function antes(ruta) {
  try {
    return JSON.parse(
      execSync(`git show ${REF}:${ruta}`, { cwd: RAIZ, maxBuffer: 1 << 28 }).toString(),
    );
  } catch {
    return null;
  }
}

function resumen(r) {
  if (!r) return null;
  const veh = Object.fromEntries(
    (r.vehiculos ?? []).map((v) => [
      v.id,
      {
        v_impacto_kmh: r2(v.v_impacto_kmh),
        delta_v_kmh: r2(v.delta_v_kmh),
        pose_final: v.pose_final
          ? [r2(v.pose_final.x), r2(v.pose_final.y), r2(v.pose_final.rumbo_deg)]
          : null,
      },
    ]),
  );
  const inv = Object.fromEntries(
    (r.inversion?.parametros ?? []).map((p) => [
      `${p.parametro}:${p.vehiculo}`,
      p.identificable && p.estimacion
        ? {
            mejor: r2(p.estimacion.mejor),
            p10: r2(p.estimacion.p10),
            p90: r2(p.estimacion.p90),
            en_limite: p.en_limite ?? false,
          }
        : { identificable: false, inicial: r2(p.inicial) },
    ]),
  );
  return {
    punto_impacto: r.punto_impacto ? [r2(r.punto_impacto.x), r2(r.punto_impacto.y)] : null,
    vehiculos: veh,
    inversion: inv,
    banderas: (r.banderas ?? []).map((b) => b.codigo).sort(),
  };
}

const mismo = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const filas = [];
for (const carpeta of CARPETAS) {
  for (const f of readdirSync(join(RAIZ, carpeta))
    .filter((x) => x.endsWith(".json"))
    .sort()) {
    const ruta = `${carpeta}/${f}`;
    const a = resumen(antes(ruta));
    const d = resumen(JSON.parse(readFileSync(join(RAIZ, ruta), "utf8")));
    const fila = { escena: ruta.replace(`${F}/`, ""), cambia: !mismo(a, d), antes: a, despues: d };
    filas.push(fila);
    console.log(`${fila.cambia ? "CAMBIA " : "igual  "} ${fila.escena}`);
  }
}
mkdirSync(join(RAIZ, "eval/results/w8"), { recursive: true });
writeFileSync(
  join(RAIZ, "eval/results/w8/referencias.json"),
  `${JSON.stringify(
    {
      fecha: new Date().toISOString(),
      antes: execSync(`git rev-parse --short ${REF}`, { cwd: RAIZ }).toString().trim(),
      cambian: filas.filter((f) => f.cambia).map((f) => f.escena),
      escenas: filas,
    },
    null,
    2,
  )}\n`,
);
