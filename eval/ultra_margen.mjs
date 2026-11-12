#!/usr/bin/env node
/**
 * Lo que costaría cada mejora de «ultra con el margen» (René, 2026-11-12; propuesta, sin hacerla):
 * el costo relativo, en tiempo de cuadro, de las mejoras que se pueden probar con los interruptores
 * de `depurar` en el build web, sin código nuevo. Mide ultra tal como está y cada variante, en un
 * navegador nuevo por medición (protocolo de E6, ADR 0026), en las escenas pedidas.
 *
 * En la laptop de desarrollo (Intel UHD) las cifras absolutas no dicen nada de la computadora de demo:
 * sirve la razón contra ultra tal como está, que luego se aplica a lo medido en la RTX 4070
 * (`eval/results/e6_unity_escritorio.json`). Es una estimación hasta medirlo allá.
 *
 *   node eval/ultra_margen.mjs [--casos axa-dia,lateral_interseccion-noche] [--segundos 8]
 *
 * Reanudable: lo medido queda en `eval/results/ultra_margen.json` en cuanto termina cada medición.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { useBestPerformance } from "./lib/power-mode.mjs";
import { condiciones, medirEscena, servirBuild } from "./lib/unity-e6.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const CASOS = arg("casos", "axa-dia,lateral_interseccion-noche").split(",");
const SEGUNDOS = Number(arg("segundos", 8));
const SALIDA = join(RAIZ, "eval/results/ultra_margen.json");

/** Las variantes: cada una cambia una cosa sobre ultra (`depurar` después de cargar). */
const VARIANTES = [
  { nombre: "ultra", depurar: null, que: "Ultra tal como está (escala 1 con dpr 1)." },
  { nombre: "escala_1.5", depurar: { escala: 1.5 }, que: "Dibujar a 1.5× y reducir (sobremuestreo 2.25× pixeles): bordes y texturas lejanas más finos." },
  { nombre: "escala_2", depurar: { escala: 2 }, que: "Dibujar a 2× y reducir (4× pixeles)." },
  { nombre: "sombras_8192", depurar: { mapa_sombras: 8192 }, que: "Mapa de sombras del sol de 8192 (hoy 4096): sombras más nítidas." },
  { nombre: "sombras_250m", depurar: { sombra_distancia: 250 }, que: "Sombras del sol hasta 250 m (hoy 150 m)." },
  { nombre: "msaa_8", depurar: { msaa_urp: 8 }, que: "MSAA 8× (hoy 4×)." },
  { nombre: "luces_16", depurar: { luces_max: 16 }, que: "Hasta 16 luces por objeto (hoy 8): más luminarias y faros iluminando." },
];

const estado = existsSync(SALIDA)
  ? JSON.parse(readFileSync(SALIDA, "utf8"))
  : { mediciones: [] };
const guardar = () => {
  estado.fecha = new Date().toISOString();
  estado.metodo =
    "Build web local (apps/visor-unity/Build/web), Chromium con la GPU, 1920×1080, un navegador nuevo por medición, " +
    `nivel ultra, cámara cinematográfica en bucle, 3 s de calentamiento y ${SEGUNDOS} s de tiempos de cuadro, sin vsync. ` +
    "Cada variante cambia una cosa con `depurar` después de cargar. Vale la razón contra ultra, no la cifra absoluta.";
  writeFileSync(SALIDA, `${JSON.stringify(estado, null, 2)}\n`);
};

const servidor = await servirBuild(join(RAIZ, "apps/visor-unity/Build/web"), RAIZ);
const energia = useBestPerformance();
estado.energia = energia.registro;
estado.condiciones_inicio ??= condiciones();
try {
  for (const caso of CASOS) {
    const paquete = readFileSync(join(RAIZ, `apps/visor-unity/Build/casos/${caso}.json`), "utf8");
    for (const v of VARIANTES) {
      if (estado.mediciones.some((m) => m.caso === caso && m.variante === v.nombre && !m.error)) continue;
      let r;
      try {
        r = await medirEscena({
          chromium,
          url: servidor.url,
          paquete,
          nivel: "ultra",
          depurar: v.depurar,
          segundos: SEGUNDOS,
        });
      } catch (e) {
        r = { error: String(e).slice(0, 200) };
      }
      estado.mediciones = estado.mediciones.filter((m) => !(m.caso === caso && m.variante === v.nombre));
      estado.mediciones.push({ caso, variante: v.nombre, que: v.que, depurar: v.depurar, ...r });
      guardar();
      console.log(`${caso} ${v.nombre}: ${r.fps_promedio ?? r.error} fps`);
    }
  }
} finally {
  await servidor.cerrar();
  energia.restore();
}
estado.condiciones_fin = condiciones();
// La razón de cada variante contra ultra, por escena: ms de la variante / ms de ultra.
estado.razon = {};
for (const caso of CASOS) {
  const base = estado.mediciones.find((m) => m.caso === caso && m.variante === "ultra");
  estado.razon[caso] = Object.fromEntries(
    estado.mediciones
      .filter((m) => m.caso === caso && m.fps_promedio && base?.fps_promedio)
      .map((m) => [m.variante, Math.round((base.fps_promedio / m.fps_promedio) * 100) / 100]),
  );
}
guardar();
console.log(JSON.stringify(estado.razon, null, 2));
