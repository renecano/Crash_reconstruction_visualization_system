#!/usr/bin/env node
/**
 * F11a — Accesibilidad y carga de las páginas (PLAN §11.6): Lighthouse en modo celular (Moto G
 * Power emulado, CPU 4×) con red 4G, sobre el build de producción, de dos formas:
 *
 * - **Limitación aplicada** (`throttlingMethod: "devtools"`): Chrome de verdad recibe la red 4G de
 *   Lighthouse (562.5 ms de ida y vuelta, 1.47 Mbps) y la CPU 4× más lenta, y se mide lo que pasa.
 *   Con esta se evalúa el criterio (ADR 0045).
 * - **Estimación de Lantern** (`"simulate"`, la de PageSpeed Insights): carga sin limitar y estima
 *   el tiempo con un modelo. En estas páginas su LCP queda varias veces arriba del medido porque
 *   suma al LCP los scripts que se piden al inicio aunque el LCP ocurra antes de que terminen. Se
 *   reporta junto a la medición, sin esconderla.
 *
 * Para cada página mide: puntaje de accesibilidad (meta ≥ 95), LCP (≤ 2.5 s), CLS (< 0.1), bytes
 * transferidos durante la carga (≤ 8 MB) y, como información, el puntaje de rendimiento y el TBT.
 * Cada página se mide `--repeats` veces (3 por omisión) y se reporta la corrida mediana por LCP;
 * todas quedan en el resultado.
 *
 * Requisito: `pnpm --filter @croquis/web build`. El script levanta `next start` en `--port` (3200)
 * si no hay un servidor ahí y usa el Chromium de Playwright.
 * Uso: `node eval/f11_portada.mjs [--repeats 3] [--paginas /,/en] [--port 3200] [--out ruta] [--bateria]`.
 * Cada página se guarda al terminar en `eval/results/f11_portada/<página>.json`, así una corrida
 * puede ir por partes (en la laptop de 8 GB, una corrida larga en segundo plano se puede cortar por
 * memoria); `node eval/f11_portada.mjs --unir` junta las páginas en `eval/results/f11_portada.json`.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const require = createRequire(join(WEB, "package.json"));
const { chromium } = require("@playwright/test");
// Lighthouse y chrome-launcher son módulos ES instalados en apps/web.
const desdeWeb = (m) => import(pathToFileURL(require.resolve(m)).href);
const lighthouse = (await desdeWeb("lighthouse")).default;
const chromeLauncher = await desdeWeb("chrome-launcher");

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
const PARTES = join(ROOT, "eval", "results", "f11_portada");
const slug = (ruta) =>
  ruta === "/"
    ? "inicio"
    : ruta
        .replace(/^\//, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/-$/, "");
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
  const proc = spawn(`pnpm start --port ${PORT}`, {
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

/** El elemento LCP: Lighthouse 13 lo reporta en sus «insights» como un nodo con su fragmento. */
function nodoLcp(audits) {
  const buscar = (x) => {
    if (!x || typeof x !== "object") return null;
    if (x.type === "node" && typeof x.snippet === "string") return x.snippet;
    for (const v of Object.values(x)) {
      const r = buscar(v);
      if (r) return r;
    }
    return null;
  };
  return (
    buscar(audits["lcp-breakdown-insight"]?.details) ??
    buscar(audits["largest-contentful-paint"]?.details)
  );
}

/** ¿La laptop está conectada? Con batería el CPU va más lento y las cifras no son comparables. */
function corriente() {
  if (process.platform !== "win32") return null;
  try {
    const estado = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", "(Get-CimInstance Win32_Battery).BatteryStatus"],
      { encoding: "utf8" },
    ).trim();
    // Win32_Battery.BatteryStatus: 1 = descargándose (con batería); sin batería no hay valor.
    return estado === "" ? "ca" : estado === "1" ? "bateria" : "ca";
  } catch {
    return null;
  }
}

async function medir(port, url, metodo) {
  // Celular con 4G: la configuración móvil por omisión de Lighthouse, con el método de limitación
  // pedido (devtools = aplicada; simulate = Lantern).
  const res = await lighthouse(
    url,
    { port, output: "json", logLevel: "error", onlyCategories: ["accessibility", "performance"] },
    { extends: "lighthouse:default", settings: { throttlingMethod: metodo } },
  );
  const lhr = res.lhr;
  // Una corrida fallida no se promedia: Lighthouse la reporta en runtimeError con métricas vacías.
  if (lhr.runtimeError) {
    throw new Error(`${url} (${metodo}): ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
  }
  const a = lhr.audits;
  return {
    accesibilidad: r2(lhr.categories.accessibility.score * 100, 0),
    rendimiento: r2(lhr.categories.performance.score * 100, 0),
    lcp_ms: r2(a["largest-contentful-paint"].numericValue, 0),
    cls: r2(a["cumulative-layout-shift"].numericValue, 3),
    tbt_ms: r2(a["total-blocking-time"].numericValue, 0),
    fcp_ms: r2(a["first-contentful-paint"].numericValue, 0),
    carga_mb: r2(a["total-byte-weight"].numericValue / 1048576, 2),
    elemento_lcp: nodoLcp(a),
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
    // Velocidad del CPU de esta máquina en ese momento (la CPU 4× se aplica encima).
    benchmark_index: lhr.environment?.benchmarkIndex ?? null,
    corriente: corriente(),
    entorno: {
      formFactor: lhr.configSettings.formFactor,
      throttlingMethod: lhr.configSettings.throttlingMethod,
      throttling: lhr.configSettings.throttling,
    },
  };
}

const UNIR = process.argv.includes("--unir");
if (!UNIR && corriente() === "bateria" && !process.argv.includes("--bateria")) {
  console.error(
    "La laptop está con batería: el CPU va más lento y las cifras no se comparan con las demás. Conéctala (o pasa --bateria y anótalo).",
  );
  process.exit(1);
}
const proc = UNIR ? null : await servidor();
const chrome = UNIR
  ? null
  : await chromeLauncher.launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ["--headless=new", "--no-first-run", "--disable-extensions"],
    });
let cerrado = false;
async function cerrar() {
  if (cerrado) return;
  cerrado = true;
  await chrome?.kill();
  // Con shell: true, proc es la consola; en Windows hay que cerrar también a next start, su hijo.
  if (proc && process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
  } else if (proc) proc.kill();
}
// Lighthouse a veces rechaza una promesa que no espera nadie (p. ej. «Target closed»): sin esto el
// proceso terminaría sin cerrar Chrome ni el servidor.
process.on("uncaughtException", async (e) => {
  console.error(e);
  await cerrar();
  process.exit(1);
});
const paginas = [];
mkdirSync(PARTES, { recursive: true });
try {
  for (const ruta of UNIR ? [] : PAGINAS) {
    const corridas = { devtools: [], simulate: [] };
    for (let k = 0; k < REPEATS; k++) {
      for (const metodo of ["devtools", "simulate"]) {
        corridas[metodo].push(await medir(chrome.port, `${BASE}${ruta}`, metodo));
        console.log(ruta, metodo, k + 1, JSON.stringify(corridas[metodo].at(-1)).slice(0, 150));
      }
    }
    const m = mediana(corridas.devtools, "lcp_ms");
    const lantern = mediana(corridas.simulate, "lcp_ms");
    paginas.push({
      ruta,
      ...m,
      cumple: {
        accesibilidad: m.accesibilidad >= META.accesibilidad,
        lcp: m.lcp_ms <= META.lcp_ms,
        cls: m.cls < META.cls,
        carga: m.carga_mb <= META.carga_mb,
      },
      lantern: {
        lcp_ms: lantern.lcp_ms,
        fcp_ms: lantern.fcp_ms,
        tbt_ms: lantern.tbt_ms,
        cls: lantern.cls,
        rendimiento: lantern.rendimiento,
        lcp_cumpliria: lantern.lcp_ms <= META.lcp_ms,
      },
      corridas,
    });
    writeFileSync(
      join(PARTES, `${slug(ruta)}.json`),
      `${JSON.stringify(paginas.at(-1), null, 2)}
`,
    );
  }
} finally {
  await cerrar();
}
if (!UNIR) {
  console.log(`Páginas guardadas en ${PARTES}; únelas con --unir.`);
  process.exit(0);
}
// --unir: las páginas medidas, en el orden de PAGINAS (todas tienen que estar).
for (const ruta of PAGINAS) {
  const f = join(PARTES, `${slug(ruta)}.json`);
  if (!existsSync(f)) throw new Error(`Falta la medición de ${ruta} (${f})`);
  paginas.push(JSON.parse(readFileSync(f, "utf8")));
}

const resultado = {
  evaluacion: "F11a: accesibilidad, LCP, CLS y carga inicial (Lighthouse, celular con 4G simulada)",
  generado_por: "node eval/f11_portada.mjs",
  momento: new Date().toISOString(),
  metas: META,
  metodo: `Lighthouse en modo celular por omisión con red 4G, build de producción, ${REPEATS} corridas por página y por método; se reporta la corrida mediana por LCP. El criterio se evalúa con la limitación aplicada (devtools); la estimación de Lantern (simulate) va en «lantern» de cada página.`,
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
    `${p.ruta.padEnd(36)} a11y ${p.accesibilidad}  LCP ${p.lcp_ms} ms (Lantern ${p.lantern.lcp_ms})  CLS ${p.cls}  ${p.carga_mb} MB`,
  );
}
