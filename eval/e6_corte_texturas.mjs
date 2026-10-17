/**
 * E6 (apoyo): ¿se ve el corte por nivel de mip de las texturas del entorno?
 *
 * Histórico: el corte se revirtió porque E6 lo mostró más lento en la GPU de referencia (ADR 0024,
 * decisión 6; ADR 0025). El visor ya no tiene el interruptor `texturasSinCorte`, así que correr
 * este script hoy compara dos cuadros iguales. Se conserva con su resultado como evidencia.
 *
 * Donde un píxel cubre muchos texeles, el visor no lee la textura y usa su promedio, que es el
 * color calibrado (ADR 0024, `env-textures.ts`). Este script lo mide: para cada escena canónica,
 * en calidad media y alta y varios instantes, dibuja el mismo cuadro con el corte y sin él
 * (`window.__croquisDiag.texturasSinCorte`) y compara los píxeles en escala de grises (0-255).
 *
 * Requisito previo: `pnpm --filter @croquis/web build`. Uso: `node eval/e6_corte_texturas.mjs`.
 * Salida: eval/results/e6_corte_texturas.json.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureViewer,
  chromiumFrom,
  diffFields,
  fixtures,
  grayDiff,
  startServer,
  summarize,
} from "./lib/visual-diff.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const PORT = 3211;
const BASE = `http://localhost:${PORT}`;
// El corte depende de la cámara, no del instante: con la cámara libre por omisión basta uno.
const INSTANTES = [0];
const CALIDADES = ["media", "alta"];

const server = await startServer(WEB, PORT);
try {
  const browser = await chromiumFrom(WEB).launch({
    headless: false,
    args: ["--ignore-gpu-blocklist"],
  });
  const escenas = fixtures(ROOT);
  const casos = [];
  for (const escena of escenas) {
    for (const calidad of CALIDADES) {
      for (const t of INSTANTES) {
        const q = new URLSearchParams({
          escena,
          calidad,
          camara: "libre",
          renderer: "webgl",
          t: String(t),
        });
        const con = await captureViewer(browser, BASE, q.toString(), {});
        const sin = await captureViewer(browser, BASE, q.toString(), { texturasSinCorte: true });
        const caso = { escena, calidad, t, ...diffFields(await grayDiff(browser, con, sin)) };
        casos.push(caso);
        console.log(JSON.stringify(caso));
      }
    }
  }
  await browser.close();
  const doc = {
    name: "e6_corte_texturas",
    generated_at: new Date().toISOString(),
    git_commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
      .toString()
      .trim(),
    metodo:
      "Mismo cuadro (1920×1080, WebGL 2, cámara libre por omisión) con el corte por nivel de mip de las texturas y sin él; diferencia por píxel en gris Rec. 601 (0-255).",
    escenas,
    resumen: summarize(casos),
    casos,
  };
  mkdirSync(join(ROOT, "eval", "results"), { recursive: true });
  writeFileSync(
    join(ROOT, "eval", "results", "e6_corte_texturas.json"),
    `${JSON.stringify(doc, null, 2)}\n`,
    "utf8",
  );
  console.log("resumen", JSON.stringify(doc.resumen));
} finally {
  server.kill();
}
