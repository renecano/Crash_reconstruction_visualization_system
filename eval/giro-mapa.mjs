// Medición del giro con el anillo (comentario de René, 2026-10-24, punto 3): en la laptop de René, el
// giro debe responder a ≥ 30 cuadros por segundo.
//
// Abre el caso de AXA en /cesvi con Chrome (la tarjeta de video real, 1440×800 a escala 1.5, como la
// laptop), coloca el impacto y a V1, y gira el anillo de V1 en círculos con el mouse durante
// `SEGUNDOS`. Mide:
//
// - los cuadros que dibuja la página mientras se gira (requestAnimationFrame), por segundo;
// - el trabajo de cada actualización del anillo (`window.__croquisGiro`: cuadros y ms).
//
//   cd apps/web && node ../../eval/giro-mapa.mjs [http://localhost:3000]  → eval/results/giro_mapa.json
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(join(raiz, "apps/web/package.json"))("@playwright/test");
const base = process.argv[2] ?? "http://localhost:3000";
const SEGUNDOS = 4;
const VUELTAS = 3;
const META_FPS = 30;

const browser = await chromium.launch({ channel: "chrome", headless: false });
const p = await browser.newPage({ viewport: { width: 1440, height: 800 }, deviceScaleFactor: 1.5 });
await p.addInitScript(() => localStorage.setItem("croquis:guia-colocar", "no"));
await p.goto(`${base}/cesvi/casos/a2010930`);
await p.getByTestId("recorrido-caso").waitFor();
if ((await p.getByTestId("recorrido-caso").getAttribute("data-modo")) === "presentar")
  await p.getByTestId("modo-trabajar").click();
for (let k = 0; k < 10; k++) {
  const a = Number(await p.getByTestId("panel-paso").getAttribute("data-paso"));
  if (a === 3) break;
  await p.getByTestId("siguiente").click();
}
const mapa = p.getByTestId("mapa-escena");
await mapa.locator("canvas").waitFor({ timeout: 60_000 });
await p.waitForTimeout(2000);
const caja = await mapa.boundingBox();
const cx = caja.x + caja.width / 2;
const cy = caja.y + caja.height / 2;
// El impacto en el centro y V1 arrastrado de la bandeja un poco más arriba.
await mapa.click({ position: { x: caja.width / 2, y: caja.height / 2 } });
await p.getByTestId("listo-elemento").click();
const chip = await p.getByTestId("chip-final:V1").boundingBox();
await p.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
await p.mouse.down();
await p.mouse.move(cx, cy - 120, { steps: 10 });
await p.mouse.up();
const anillo = await p.getByTestId("anillo-giro").locator("svg").boundingBox();
const ax = anillo.x + anillo.width / 2;
const ay = anillo.y + anillo.height / 2;
const radio = anillo.width / 2 - 12;

// Cuadros de la página mientras se gira.
await p.evaluate(() => {
  window.__croquisGiro = { cuadros: 0, ms: 0 };
  const t = { n: 0, t0: 0, t1: 0, activo: true };
  window.__cuadrosPagina = t;
  const bucle = (now) => {
    if (!t.t0) t.t0 = now;
    t.n += 1;
    t.t1 = now;
    if (t.activo) requestAnimationFrame(bucle);
  };
  requestAnimationFrame(bucle);
});
await p.mouse.move(ax, ay - radio);
await p.mouse.down();
const pasos = Math.round(SEGUNDOS * 120);
const inicio = Date.now();
for (let i = 1; i <= pasos; i++) {
  const a = (2 * Math.PI * VUELTAS * i) / pasos;
  await p.mouse.move(ax + radio * Math.sin(a), ay - radio * Math.cos(a));
}
const duracionMs = Date.now() - inicio;
await p.mouse.up();
const medido = await p.evaluate(() => {
  const t = window.__cuadrosPagina;
  t.activo = false;
  return { pagina: { cuadros: t.n, ms: t.t1 - t.t0 }, giro: window.__croquisGiro };
});
const gpu = await p.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
});
const chrome = browser.version();
await browser.close();

const fps = (medido.pagina.cuadros / medido.pagina.ms) * 1000;
const msPorActualizacion = medido.giro.ms / Math.max(1, medido.giro.cuadros);
const commit = execSync("git rev-parse --short HEAD", { cwd: raiz }).toString().trim();
const doc = {
  name: "giro_mapa",
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  git_commit: commit,
  descripcion:
    "Giro con el anillo en el paso del lugar de /cesvi (caso de AXA): cuadros por segundo de la página mientras se gira con el mouse y trabajo de cada actualización del anillo.",
  metodo: `Chrome ${chrome} con ventana visible, 1440×800 a escala 1.5 (la laptop de René), ${VUELTAS} vueltas del mouse alrededor del anillo en ${pasos} movimientos.`,
  equipo: { gpu },
  meta_fps: META_FPS,
  resultado: {
    duracion_giro_s: Math.round(duracionMs) / 1000,
    cuadros_pagina: medido.pagina.cuadros,
    fps_pagina: Math.round(fps * 10) / 10,
    actualizaciones_anillo: medido.giro.cuadros,
    ms_por_actualizacion: Math.round(msPorActualizacion * 1000) / 1000,
    cumple: fps >= META_FPS,
  },
};
const salida = join(raiz, "eval/results/giro_mapa.json");
writeFileSync(salida, `${JSON.stringify(doc, null, 2)}\n`);
console.log(JSON.stringify(doc.resultado), "→", salida);
