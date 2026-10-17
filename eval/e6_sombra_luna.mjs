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
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const require = createRequire(join(WEB, "package.json"));
const { chromium } = require("@playwright/test");
const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const INSTANTES = [-1, 0, 1];
/** Umbrales de diferencia reportados (niveles de gris de 0 a 255). */
const UMBRALES = [3, 8];

const FIXTURES = join(ROOT, "packages", "scene-schema", "fixtures");
const nocturnas = readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    escena: f.slice(0, -5),
    spec: JSON.parse(readFileSync(join(FIXTURES, f), "utf8")),
  }))
  .filter(({ spec }) => String(spec.entorno?.iluminacion?.valor ?? "").startsWith("noche"))
  .map(({ escena }) => escena)
  .sort();

async function waitForServer(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // el servidor aún no responde
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor no respondió en ${ms} ms`);
}

async function capture(browser, query, sombraLuna) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript((on) => {
    window.__croquisDiag = { sombraLuna: on };
  }, sombraLuna);
  await page.goto(`${BASE}/visor?${query}`);
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
  await page.waitForTimeout(1000);
  const png = await page.getByTestId("visor-3d").screenshot();
  await context.close();
  return png;
}

/** Diferencia por píxel en gris (Rec. 601), calculada en el navegador con canvas. */
async function diff(browser, a, b) {
  const page = await browser.newPage();
  const out = await page.evaluate(
    async ([da, db, umbrales]) => {
      const load = (src) =>
        new Promise((ok, err) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = err;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(da), load(db)]);
      const px = (img) => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height).data;
      };
      const pa = px(ia);
      const pb = px(ib);
      const gray = (p, i) => 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      let max = 0;
      const sobre = umbrales.map(() => 0);
      const n = pa.length / 4;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.abs(gray(pa, i) - gray(pb, i));
        if (d > max) max = d;
        umbrales.forEach((u, k) => {
          if (d >= u) sobre[k] += 1;
        });
      }
      return { max, pct: sobre.map((s) => (100 * s) / n) };
    },
    [
      `data:image/png;base64,${a.toString("base64")}`,
      `data:image/png;base64,${b.toString("base64")}`,
      UMBRALES,
    ],
  );
  await page.close();
  return out;
}

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

async function main() {
  const server = spawn(
    process.execPath,
    [join(WEB, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
    { cwd: WEB, stdio: "ignore" },
  );
  try {
    await waitForServer(`${BASE}/visor`, 60_000);
    const browser = await chromium.launch({ headless: false, args: ["--ignore-gpu-blocklist"] });
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
          const con = await capture(browser, q.toString(), true);
          const sin = await capture(browser, q.toString(), false);
          const d = await diff(browser, con, sin);
          const caso = {
            escena,
            clima: clima ?? "el de la escena",
            t,
            diferencia_max_niveles: round(d.max, 1),
            ...Object.fromEntries(
              UMBRALES.map((u, k) => [`pct_pixeles_dif_ge_${u}`, round(d.pct[k], 3)]),
            ),
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
      resumen: {
        diferencia_max_niveles: Math.max(...casos.map((c) => c.diferencia_max_niveles)),
        ...Object.fromEntries(
          UMBRALES.map((u) => [
            `pct_pixeles_dif_ge_${u}_max`,
            Math.max(...casos.map((c) => c[`pct_pixeles_dif_ge_${u}`])),
          ]),
        ),
      },
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
}

await main();
