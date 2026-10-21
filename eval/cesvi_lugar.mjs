/**
 * Paso 3 del recorrido de /cesvi (ADR 0053): cuánto tarda del clic en «Marcar el impacto» a ver las
 * calles y las versiones, con Overpass sin responder (el peor caso: el paso no lo espera).
 *
 * Abre la página en Chromium con mosaicos reales, marca el impacto sobre la MEX 15 y lee `data-ms`
 * (lo mide la página, del clic al segundo cuadro después de dibujar). Repite N veces con un navegador
 * nuevo cada vez y guarda `eval/results/cesvi_lugar.json`.
 *
 * Uso: `node eval/cesvi_lugar.mjs [url] [repeticiones]` (por omisión, producción y 5).
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const URL_BASE = process.argv[2] ?? "https://croquis-sage.vercel.app";
const N = Number(process.argv[3] ?? 5);
const META_MS = 1000;
// Sobre el eje de la MEX 15, al norte de Los Mochis (del tramo precargado).
const COORDENADAS = "25.97385, -109.03543";

const corridas = [];
for (let i = 0; i < N; i++) {
  const navegador = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(e.message));
  let pedidasOverpass = 0;
  await pagina.route("**/api/osm?**", () => {
    pedidasOverpass++; // nunca responde
  });
  await pagina.route("**/api/relato/extraer", (r) => r.abort());
  await pagina.goto(`${URL_BASE}/cesvi`, { waitUntil: "networkidle" });
  await pagina.getByTestId("paso-3").click();
  await pagina.getByTestId("coordenadas").fill(COORDENADAS);
  await pagina.waitForTimeout(2500); // que termine el vuelo de la cámara al tramo
  const t0 = Date.now();
  await pagina.getByRole("button", { name: "Marcar el impacto" }).click();
  const marcado = pagina.getByTestId("impacto-marcado");
  await marcado.waitFor();
  await pagina.waitForFunction(() =>
    document.querySelector('[data-testid="impacto-marcado"]')?.hasAttribute("data-ms"),
  );
  const msPagina = Number(await marcado.getAttribute("data-ms"));
  const msPlaywright = Date.now() - t0;
  await pagina.getByTestId("ver-detalle").click();
  const via = await pagina.getByTestId("via-cercana").textContent();
  corridas.push({ msPagina, msPlaywright, pedidasOverpass, via: via?.trim() ?? null, errores });
  console.log(`corrida ${i + 1}: ${msPagina} ms (Playwright ${msPlaywright} ms), ${via?.trim()}`);
  await navegador.close();
}

const ms = corridas.map((c) => c.msPagina).sort((a, b) => a - b);
const mitad = Math.floor(ms.length / 2);
const mediana = ms.length % 2 ? ms[mitad] : (ms[mitad - 1] + ms[mitad]) / 2;
const resultado = {
  fecha: new Date().toISOString(),
  url: URL_BASE,
  repeticiones: N,
  condiciones:
    "Chromium sin interfaz (SwiftShader), 1280×800, navegador nuevo por corrida, Overpass sin responder, mosaicos reales de OpenFreeMap",
  meta_ms: META_MS,
  ms_del_clic_a_las_calles: { mediana, minimo: ms[0], maximo: ms[ms.length - 1] },
  cumple: ms[ms.length - 1] < META_MS,
  corridas,
};
writeFileSync(
  join(RAIZ, "eval/results/cesvi_lugar.json"),
  `${JSON.stringify(resultado, null, 2)}\n`,
);
console.log(
  `mediana ${mediana} ms, máximo ${ms[ms.length - 1]} ms; meta < ${META_MS} ms: ${resultado.cumple ? "sí" : "no"}`,
);
