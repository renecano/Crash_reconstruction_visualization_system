/**
 * Cuánto tarda AXA A2010930 en el navegador (ADR 0091; René, 2026-10-25): el Web Worker del solver
 * de producción (`apps/web/public/workers/reconstruct.js`, el mismo que usa la app) en Chromium, en
 * esta máquina.
 *
 * Sirve solo el worker y una página en blanco (sin la app), le manda la escena de AXA como la arma
 * la app (`eval/results/axa_spec_app.json`, que escribe `cesvi_axa_multiarranque.mts`) y mide cuándo
 * llega la reconstrucción (lo que el visor dibuja) y cuándo el resultado completo (Monte Carlo,
 * inversión con multiarranque, consistencia y la otra hipótesis). Tres corridas, cada una en una
 * pestaña nueva; se informa cada una y la mediana.
 *
 * «antes» es el worker desplegado en producción sin el multiarranque (se descarga a la carpeta
 * temporal y se pasa su ruta); «despues», el que construye `build-worker.mjs` con el código actual.
 *
 *   node eval/axa_tiempo_navegador.mjs antes <ruta del worker de producción>
 *   node apps/web/scripts/build-worker.mjs && node eval/axa_tiempo_navegador.mjs despues
 *     → eval/results/axa_tiempo_navegador.json
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
// Playwright está en apps/web: se resuelve desde ahí.
const { chromium } = createRequire(join(RAIZ, "apps/web/package.json"))("@playwright/test");
const etiqueta = process.argv[2] ?? "despues";
const SALIDA = join(RAIZ, "eval/results/axa_tiempo_navegador.json");
const rutaWorker = process.argv[3] ?? join(RAIZ, "apps/web/public/workers/reconstruct.js");
const worker = readFileSync(rutaWorker);
const spec = readFileSync(join(RAIZ, "eval/results/axa_spec_app.json"), "utf8");

const servidor = createServer((req, res) => {
  if (req.url === "/workers/reconstruct.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(worker);
  } else {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>tiempo</title>");
  }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${servidor.address().port}/`;

const navegador = await chromium.launch();
const corridas = [];
for (let k = 0; k < 3; k++) {
  const pagina = await navegador.newPage();
  await pagina.goto(url);
  const t = await pagina.evaluate(
    (texto) =>
      new Promise((ok, mal) => {
        const w = new Worker("/workers/reconstruct.js");
        const t0 = performance.now();
        let reconstruccion = null;
        w.onmessage = (ev) => {
          if (ev.data.error) return mal(new Error(ev.data.error));
          if (ev.data.fase === "reconstruccion") reconstruccion = performance.now() - t0;
          else ok({ reconstruccion_ms: reconstruccion, completo_ms: performance.now() - t0 });
        };
        w.postMessage({ id: 1, spec: JSON.parse(texto), completo: true });
      }),
    spec,
  );
  corridas.push({
    reconstruccion_ms: Math.round(t.reconstruccion_ms),
    completo_ms: Math.round(t.completo_ms),
  });
  console.log(etiqueta, k + 1, JSON.stringify(corridas.at(-1)));
  await pagina.close();
}
const version = navegador.version();
await navegador.close();
servidor.close();

const mediana = (xs) => [...xs].sort((a, b) => a - b)[1];
const previo = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, "utf8")) : {};
const doc = {
  ...previo,
  name: "axa_tiempo_navegador",
  descripcion:
    "AXA A2010930 en el Web Worker del solver de producción, en Chromium (Playwright) en la laptop de desarrollo (Windows, 8 GB de RAM): cuándo llega la reconstrucción y cuándo el resultado completo. Tres corridas por versión, cada una en una pestaña nueva.",
  chromium: version,
  [etiqueta]: {
    generated_at: new Date().toISOString().slice(0, 19) + "Z",
    worker:
      etiqueta === "antes"
        ? "el de producción (https://croquis-sage.vercel.app/workers/reconstruct.js)"
        : "apps/web/public/workers/reconstruct.js, construido con el código de este commit",
    git_commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
    corridas,
    mediana_reconstruccion_ms: mediana(corridas.map((c) => c.reconstruccion_ms)),
    mediana_completo_ms: mediana(corridas.map((c) => c.completo_ms)),
  },
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 1)}\n`);
console.log(JSON.stringify(doc[etiqueta]));
