#!/usr/bin/env node
/**
 * Lo gráfico del video de Unity que no dibuja el visor (René, 2026-11-17), a partir del logo de
 * `assets/brand` (que sale de `marca.json`; aquí no se redibuja):
 *
 * - `video-marca.png`: el logotipo blanco, fondo transparente, para la esquina de cada cuadro (lo pone
 *   el modo foto del visor de escritorio, campo `marca` del plan).
 * - `video-tarjeta.jpg`: 3840×2160, el logotipo al centro sobre grafito (el fondo de la app) y la
 *   leyenda ilustrativa abajo. Abre y cierra cada video. Sin cifras ni textos técnicos.
 *
 * Los dibuja Chromium (el de Playwright de apps/web) y quedan en la carpeta que se le pase; van en el
 * paquete de fotos del release, no en git.
 *
 *   node tools/unity/video-unity-tarjetas.mjs <carpeta>
 */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "../..");
const { chromium } = createRequire(join(RAIZ, "apps/web/package.json"))("@playwright/test");
const color = JSON.parse(readFileSync(join(RAIZ, "assets/brand/tokens.json"), "utf8")).color;
const salida = resolve(process.argv[2] ?? ".");
mkdirSync(salida, { recursive: true });

const logo = readFileSync(join(RAIZ, "assets/brand/logotipo-blanco.svg"), "utf8");
const geist = join(RAIZ, "apps/web/node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2");
const fuente = (() => {
  try {
    return `@font-face{font-family:Geist;src:url(data:font/woff2;base64,${readFileSync(geist).toString("base64")})}`;
  } catch {
    return "";
  }
})();
const LEYENDA = "Reconstrucción ilustrativa · entorno procedural: no es el lugar real";

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({
    viewport: { width: 3840, height: 2160 },
    deviceScaleFactor: 1,
  });

  // El logo para la esquina: alto de 240 px, sin fondo.
  await pagina.setContent(
    `<html><body style="margin:0;background:transparent"><div id="l" style="display:inline-block;height:240px">${logo.replace("<svg ", '<svg style="height:240px;width:auto;display:block" ')}</div></body></html>`,
  );
  await pagina
    .locator("#l")
    .screenshot({ path: join(salida, "video-marca.png"), omitBackground: true });

  // La tarjeta de inicio y fin.
  await pagina.setContent(`<html><head><style>${fuente}
    html,body{margin:0;width:3840px;height:2160px;background:${color.grafito.value}}
    .c{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
    .c svg{height:300px;width:auto}
    .l{position:absolute;left:0;right:0;bottom:150px;text-align:center;font:400 56px Geist,system-ui,sans-serif;color:${color.gris.value};letter-spacing:-0.01em}
  </style></head><body><div class="c">${logo}</div><div class="l">${LEYENDA}</div></body></html>`);
  await pagina.screenshot({ path: join(salida, "video-tarjeta.jpg"), type: "jpeg", quality: 95 });
} finally {
  await navegador.close();
}
process.stdout.write(`Listo: video-marca.png y video-tarjeta.jpg en ${salida}\n`);
