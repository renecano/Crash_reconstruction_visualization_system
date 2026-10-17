/**
 * Utilidades de las evaluaciones visuales de E6: servidor de producción, captura del visor con
 * interruptores de diagnóstico (`window.__croquisDiag`) y diferencia por píxel en gris.
 */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/** Umbrales de diferencia reportados (niveles de gris de 0 a 255). */
export const UMBRALES = [3, 8];

export function chromiumFrom(web) {
  return createRequire(join(web, "package.json"))("@playwright/test").chromium;
}

/** Escenas canónicas (nombre del archivo) cuyo spec cumple `pred`. */
export function fixtures(root, pred = () => true) {
  const dir = join(root, "packages", "scene-schema", "fixtures");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ escena: f.slice(0, -5), spec: JSON.parse(readFileSync(join(dir, f), "utf8")) }))
    .filter(({ spec }) => pred(spec))
    .map(({ escena }) => escena)
    .sort();
}

/** Levanta `next start` y espera a que responda; devuelve el proceso. */
export async function startServer(web, port) {
  const server = spawn(
    process.execPath,
    [join(web, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)],
    { cwd: web, stdio: "ignore" },
  );
  const url = `http://localhost:${port}/visor`;
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    try {
      if ((await fetch(url)).ok) return server;
    } catch {
      // el servidor aún no responde
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  server.kill();
  throw new Error("El servidor no respondió en 60 s");
}

/** Captura el visor 3D (1920×1080) con los interruptores de diagnóstico dados. */
export async function captureViewer(browser, base, query, diag) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript((d) => {
    window.__croquisDiag = d;
  }, diag);
  await page.goto(`${base}/visor?${query}`);
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
  await page.waitForTimeout(1000);
  const png = await page.getByTestId("visor-3d").screenshot();
  await context.close();
  return png;
}

/** Diferencia por píxel en gris (Rec. 601, 0-255), calculada en el navegador con canvas. */
export async function grayDiff(browser, a, b) {
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

export const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/** Campos de diferencia de un caso, con los nombres que usan los resultados. */
export function diffFields(d) {
  return {
    diferencia_max_niveles: round(d.max, 1),
    ...Object.fromEntries(UMBRALES.map((u, k) => [`pct_pixeles_dif_ge_${u}`, round(d.pct[k], 3)])),
  };
}

/** Resumen: el peor caso de cada medida. */
export function summarize(casos) {
  return {
    diferencia_max_niveles: Math.max(...casos.map((c) => c.diferencia_max_niveles)),
    ...Object.fromEntries(
      UMBRALES.map((u) => [
        `pct_pixeles_dif_ge_${u}_max`,
        Math.max(...casos.map((c) => c[`pct_pixeles_dif_ge_${u}`])),
      ]),
    ),
  };
}
