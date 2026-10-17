/**
 * E6 (apoyo): ¿se ve la sombra de la luna de noche?
 *
 * De noche el visor no calcula la sombra de la luz direccional (la luna): cuesta un pase de
 * sombras completo y su muestreo en cada píxel, y junto a los faros y el alumbrado no debería
 * notarse. Este script lo mide: para cada escena nocturna (con su clima y forzada a despejado) y
 * varios instantes, dibuja el mismo cuadro con la sombra (`window.__croquisDiag.sombraLuna`) y sin
 * ella, y compara los píxeles en escala de grises (0-255).
 *
 * Requisito previo: `pnpm --filter @croquis/web build`. Uso: `node eval/e6_sombra_luna.mjs`.
 * Salida: eval/results/e6_sombra_luna.json.
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
const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const INSTANTES = [-1, 0, 1];

const nocturnas = fixtures(ROOT, (spec) =>
  String(spec.entorno?.iluminacion?.valor ?? "").startsWith("noche"),
);
const server = await startServer(WEB, PORT);
try {
  const browser = await chromiumFrom(WEB).launch({
    headless: false,
    args: ["--ignore-gpu-blocklist"],
  });
  const casos = [];
  for (const escena of nocturnas) {
    for (const clima of [null, "despejado"]) {
      for (const t of INSTANTES) {
        const q = new URLSearchParams({
          escena,
          calidad: "media",
          camara: "libre",
          renderer: "webgl",
          t: String(t),
        });
        if (clima) q.set("clima", clima);
        const con = await captureViewer(browser, BASE, q.toString(), { sombraLuna: true });
        const sin = await captureViewer(browser, BASE, q.toString(), { sombraLuna: false });
        const caso = {
          escena,
          clima: clima ?? "el de la escena",
          t,
          ...diffFields(await grayDiff(browser, con, sin)),
        };
        casos.push(caso);
        console.log(JSON.stringify(caso));
      }
    }
  }
  await browser.close();
  const doc = {
    name: "e6_sombra_luna",
    generated_at: new Date().toISOString(),
    git_commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
      .toString()
      .trim(),
    metodo:
      "Mismo cuadro (1920×1080, calidad media, WebGL 2, cámara libre por omisión) con y sin la sombra de la luna; diferencia por píxel en gris Rec. 601 (0-255).",
    escenas_nocturnas: nocturnas,
    resumen: summarize(casos),
    casos,
  };
  mkdirSync(join(ROOT, "eval", "results"), { recursive: true });
  writeFileSync(
    join(ROOT, "eval", "results", "e6_sombra_luna.json"),
    `${JSON.stringify(doc, null, 2)}\n`,
    "utf8",
  );
  console.log("resumen", JSON.stringify(doc.resumen));
} finally {
  server.kill();
}
