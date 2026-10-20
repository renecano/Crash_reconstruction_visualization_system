#!/usr/bin/env node
/**
 * F11a — Accesibilidad y carga de las páginas (PLAN §11.6): Lighthouse en modo celular con red 4G
 * simulada (su configuración móvil por omisión), sobre el build de producción.
 *
 * Para cada página mide: puntaje de accesibilidad (meta ≥ 95), LCP (≤ 2.5 s), CLS (< 0.1), bytes
 * transferidos durante la carga (≤ 8 MB) y, como información, el puntaje de rendimiento y el TBT.
 * Cada página se mide `--repeats` veces (3 por omisión) y se reporta la corrida mediana por LCP;
 * todas quedan en el resultado.
 *
 * Requisito: `pnpm --filter @croquis/web build`. El script levanta `next start` en `--port` (3200)
 * si no hay un servidor ahí y usa el Chromium de Playwright.
 * Uso: `node eval/f11_portada.mjs [--repeats 3] [--paginas /,/en] [--port 3200] [--out ruta]`.
 * Salida: `eval/results/f11_portada.json`.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const require = createRequire(join(WEB, "package.json"));
const { chromium } = require("@playwright/test");
const lighthouse = (await import(require.resolve("lighthouse"))).default;
const chromeLauncher = await import(require.resolve("chrome-launcher"));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const REPEATS = Number(arg("repeats", "3"));
const PORT = Number(arg("port", "3200"));
const PAGINAS = arg(
  "paginas",
  "/,/en,/cuenta,/demo,/recorrido,/historia,/croquis,/visor?escena=interseccion_toluca,/e9,/medicion",
).split(",");
const OUT = arg("out", join(ROOT, "eval", "results", "f11_portada.json"));
/** Metas de PLAN §11.6 y §7.8. */
const META = { accesibilidad: 95, lcp_ms: 2500, cls: 0.1, carga_mb: 8 };

const BASE = `http://localhost:${PORT}`;

async function arriba() {
  try {
    const r = await fetch(BASE);
    return r.ok;
  } catch {
    return false;
  }
}

async function servidor() {
  if (await arriba()) return null;
  const proc = spawn("pnpm", ["start", "--port", String(PORT)], {
    cwd: WEB,
    shell: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 120; i++) {
    if (await arriba()) return proc;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`next start no respondió en ${BASE}`);
}

function mediana(lista, clave) {
  const orden = [...lista].sort((a, b) => (a[clave] ?? 0) - (b[clave] ?? 0));
  return orden[Math.floor((orden.length - 1) / 2)];
}

const r2 = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

async function medir(port, url) {
  const res = await lighthouse(url, {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["accessibility", "performance"],
    // Celular con 4G simulada: es la configuración por omisión de Lighthouse (formFactor mobile,
    // throttlingMethod simulate).
  });
  const lhr = res.lhr;
  const a = lhr.audits;
  return {
    accesibilidad: r2(lhr.categories.accessibility.score * 100, 0),
    rendimiento: r2(lhr.categories.performance.score * 100, 0),
    lcp_ms: r2(a["largest-contentful-paint"].numericValue, 0),
    cls: r2(a["cumulative-layout-shift"].numericValue, 3),
    tbt_ms: r2(a["total-blocking-time"].numericValue, 0),
    fcp_ms: r2(a["first-contentful-paint"].numericValue, 0),
    carga_mb: r2(a["total-byte-weight"].numericValue / 1048576, 2),
    elemento_lcp:
      a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet ?? null,
    accesibilidad_fallas: Object.values(a)
      .filter(
        (x) =>
          lhr.categories.accessibility.auditRefs.some((r) => r.id === x.id) &&
          x.score !== null &&
          x.score < 1 &&
          x.scoreDisplayMode === "binary",
      )
      .map((x) => x.id),
    lighthouse: lhr.lighthouseVersion,
    entorno: {
      formFactor: lhr.configSettings.formFactor,
      throttlingMethod: lhr.configSettings.throttlingMethod,
      throttling: lhr.configSettings.throttling,
    },
  };
}

const proc = await servidor();
const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ["--headless=new", "--no-first-run", "--disable-extensions"],
});
const paginas = [];
try {
  for (const ruta of PAGINAS) {
    const corridas = [];
    for (let k = 0; k < REPEATS; k++) {
      corridas.push(await medir(chrome.port, `${BASE}${ruta}`));
      console.log(ruta, k + 1, JSON.stringify(corridas.at(-1)).slice(0, 160));
    }
    const m = mediana(corridas, "lcp_ms");
    paginas.push({
      ruta,
      ...m,
      cumple: {
        accesibilidad: m.accesibilidad >= META.accesibilidad,
        lcp: m.lcp_ms <= META.lcp_ms,
        cls: m.cls < META.cls,
        carga: m.carga_mb <= META.carga_mb,
      },
      corridas,
    });
  }
} finally {
  await chrome.kill();
  if (proc) proc.kill();
}

const resultado = {
  evaluacion: "F11a: accesibilidad, LCP, CLS y carga inicial (Lighthouse, celular con 4G simulada)",
  generado_por: "node eval/f11_portada.mjs",
  momento: new Date().toISOString(),
  metas: META,
  metodo: `Lighthouse en modo celular por omisión (4G simulada), build de producción, ${REPEATS} corridas por página; se reporta la mediana por LCP.`,
  maquina: {
    cpu: os.cpus()[0]?.model ?? null,
    memoria_gb: r2(os.totalmem() / 1073741824, 1),
    sistema: `${os.platform()} ${os.release()}`,
  },
  cumple_todo: paginas.every((p) => Object.values(p.cumple).every(Boolean)),
  paginas,
};
writeFileSync(OUT, `${JSON.stringify(resultado, null, 2)}\n`);
console.log(`${OUT}: ${resultado.cumple_todo ? "cumple" : "NO cumple"} todas las metas.`);
for (const p of paginas) {
  console.log(
    `${p.ruta.padEnd(36)} a11y ${p.accesibilidad}  LCP ${p.lcp_ms} ms  CLS ${p.cls}  ${p.carga_mb} MB`,
  );
}
