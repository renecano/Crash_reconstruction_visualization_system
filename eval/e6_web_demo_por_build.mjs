#!/usr/bin/env node
/**
 * La E6 del build web en la computadora de demo (`eval/results/e6_unity_web_demo.json`, de
 * `tools/unity/medir-web.ps1`), separada por build: la corrida del 2026-11-12 cruzó un despliegue
 * (#210, 21:11 UTC). La primera repetición midió `01fce868922703fd` (ultra sin el primer bloque de
 * «ultra con el margen») y las otras dos, `f12372a6c2d7742c` (con el bloque). Alta no cambia entre
 * los dos builds, así que se resume con las tres repeticiones; ultra, por build.
 *
 *   node eval/e6_web_demo_por_build.mjs → eval/results/e6_unity_web_demo_por_build.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const d = JSON.parse(
  readFileSync(join(RAIZ, "eval/results/e6_unity_web_demo.json"), "utf8").replace(/^﻿/, ""),
);
const mediana = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const r1 = (x) => Math.round(x * 10) / 10;
const casos = [...new Set(d.corridas.map((c) => c.caso))].sort();

function resumen(nivel, build) {
  return Object.fromEntries(
    casos.map((k) => {
      const rs = d.corridas.filter(
        (c) => c.caso === k && c.nivel === nivel && (!build || c.build === build),
      );
      return [
        k,
        {
          fps_promedio_mediana: r1(mediana(rs.map((c) => c.fps_promedio))),
          fps_1pct_bajo_mediana: r1(mediana(rs.map((c) => c.fps_1pct_bajo))),
          escala: [...new Set(rs.map((c) => c.escala))],
          repeticiones: rs.length,
          cumple: mediana(rs.map((c) => c.fps_promedio)) >= 60,
        },
      ];
    }),
  );
}

const rango = (r) => {
  const v = Object.values(r).map((x) => x.fps_promedio_mediana);
  return [Math.min(...v), Math.max(...v)];
};
const alta = resumen("alta");
const ultraConBloque = resumen("ultra", "f12372a6c2d7742c");
const ultraSinBloque = resumen("ultra", "01fce868922703fd");
const doc = {
  fecha: new Date().toISOString(),
  fuente: "eval/results/e6_unity_web_demo.json",
  maquina: d.maquina,
  pantalla: [...new Set(d.corridas.map((c) => `${c.resolucion} dpr ${c.dpr}`))],
  gpu: [...new Set(d.corridas.map((c) => c.gpu))],
  nota:
    "La corrida cruzó el despliegue de #210: repetición 1 con el build 01fce868922703fd (ultra sin el primer bloque), " +
    "repeticiones 2 y 3 con f12372a6c2d7742c (ultra con el bloque: dibujar a 1.5×, sombras de 8192 hasta 250 m, 16 luminarias). " +
    "Alta es igual en los dos builds y se resume con las tres.",
  alta: { rango_fps: rango(alta), por_escena: alta },
  ultra_con_bloque: {
    build: "f12372a6c2d7742c",
    rango_fps: rango(ultraConBloque),
    por_escena: ultraConBloque,
  },
  ultra_sin_bloque: {
    build: "01fce868922703fd",
    rango_fps: rango(ultraSinBloque),
    por_escena: ultraSinBloque,
  },
};
writeFileSync(
  join(RAIZ, "eval/results/e6_unity_web_demo_por_build.json"),
  `${JSON.stringify(doc, null, 2)}\n`,
);
console.log(
  `alta ${doc.alta.rango_fps.join("–")} · ultra con bloque ${doc.ultra_con_bloque.rango_fps.join("–")} · ultra sin bloque ${doc.ultra_sin_bloque.rango_fps.join("–")}`,
);
