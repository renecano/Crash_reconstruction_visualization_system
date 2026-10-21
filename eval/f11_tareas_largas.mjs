/**
 * F11a (ADR 0046): cuánto bloquea el hilo principal la portada mientras arma su escena 3D, con los
 * materiales compilados por adelantado (`compileAsync`) y sin eso (`__croquisDiag.sinPrecompilar`,
 * como antes del ADR). Los horneados ceden el hilo en las dos variantes.
 *
 * Método: celular (412×823, táctil) con la CPU 4× de Lighthouse, Chromium sin interfaz (uno nuevo
 * por corrida, como en una primera visita) y build de producción. Cada corrida abre la portada y
 * registra durante VENTANA_MS las tareas largas (PerformanceObserver «longtask», > 50 ms) y el
 * momento en que la escena queda lista (`__croquisReadyAt`). Las variantes se alternan, `--repeats` veces cada una (3 por omisión), y se
 * reporta la mediana de cada cifra.
 *
 * Requisito: `pnpm --filter @croquis/web build`. Levanta `next start` en `--port` (3200) si no hay
 * un servidor ahí. Como `f11_portada.mjs`, no mide con la laptop en batería salvo con `--bateria`.
 * Uso: `node eval/f11_tareas_largas.mjs [--repeats 3] [--port 3200] [--bateria]`.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const require = createRequire(join(WEB, "package.json"));
const { chromium } = require("@playwright/test");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const REPEATS = Number(arg("repeats", "3"));
const PORT = Number(arg("port", "3200"));
const OUT = join(ROOT, "eval", "results", "f11_tareas_largas.json");
const BASE = `http://localhost:${PORT}`;
const VENTANA_MS = 60_000;
const CPU = 4;

/** ¿La laptop está conectada? Con batería el CPU va más lento y las cifras no son comparables. */
function corriente() {
  if (process.platform !== "win32") return null;
  try {
    const estado = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", "(Get-CimInstance Win32_Battery).BatteryStatus"],
      { encoding: "utf8" },
    ).trim();
    return estado === "" ? "ca" : estado === "1" ? "bateria" : "ca";
  } catch {
    return null;
  }
}
if (corriente() === "bateria" && !process.argv.includes("--bateria")) {
  console.error("La laptop está con batería: conéctala (o pasa --bateria y anótalo).");
  process.exit(1);
}

async function arriba() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}
async function servidor() {
  if (await arriba()) return null;
  const proc = spawn(`pnpm start --port ${PORT}`, { cwd: WEB, shell: true, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    if (await arriba()) return proc;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`next start no respondió en ${BASE}`);
}
function cerrarServidor(proc) {
  if (!proc) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
  } else proc.kill();
}

async function corrida(sinPrecompilar) {
  // Un navegador nuevo por corrida: sin la caché HTTP ni la de shaders de la anterior (una visita
  // por primera vez).
  const browser = await chromium.launch({ channel: "chromium" });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 823 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.addInitScript((sin) => {
    if (sin) window.__croquisDiag = { sinPrecompilar: true };
    window.__tareas = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__tareas.push(e.duration);
    }).observe({ type: "longtask", buffered: true });
  }, sinPrecompilar);
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(VENTANA_MS);
  const r = await page.evaluate(() => ({
    tareas: window.__tareas,
    listo: window.__croquisReadyAt ?? null,
  }));
  await browser.close();
  const d = r.tareas.map((x) => Math.round(x)).sort((a, b) => b - a);
  return {
    escena_lista_ms: r.listo === null ? null : Math.round(r.listo),
    tareas_largas: d.length,
    tarea_mas_larga_ms: d[0] ?? 0,
    tareas_de_mas_de_1s: d.filter((x) => x > 1000).length,
    bloqueo_total_ms: d.reduce((a, x) => a + x, 0),
    tareas_ms: d,
    corriente: corriente(),
  };
}

const mediana = (xs) => {
  const v = xs.filter((x) => x !== null).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};

const proc = await servidor();
const corridas = { precompilada: [], sin_precompilar: [] };
try {
  for (let k = 0; k < REPEATS; k++) {
    // Orden alterno: el calor o la memoria no favorecen siempre a la misma variante.
    const orden = k % 2 === 0 ? [false, true] : [true, false];
    for (const sin of orden) {
      const r = await corrida(sin);
      corridas[sin ? "sin_precompilar" : "precompilada"].push(r);
      console.log(
        sin ? "sin precompilar" : "precompilada  ",
        k + 1,
        JSON.stringify(r).slice(0, 160),
      );
    }
  }
} finally {
  cerrarServidor(proc);
}

const resumen = (lista) => ({
  escena_lista_ms: mediana(lista.map((r) => r.escena_lista_ms)),
  tarea_mas_larga_ms: mediana(lista.map((r) => r.tarea_mas_larga_ms)),
  tareas_de_mas_de_1s: mediana(lista.map((r) => r.tareas_de_mas_de_1s)),
  bloqueo_total_ms: mediana(lista.map((r) => r.bloqueo_total_ms)),
});
const resultado = {
  evaluacion:
    "F11a: bloqueo del hilo principal mientras la portada arma su escena 3D (ADR 0046), con y sin compilar los materiales por adelantado",
  generado_por: "node eval/f11_tareas_largas.mjs",
  momento: new Date().toISOString(),
  metodo: `Portada en celular (412×823) con CPU ${CPU}×, Chromium sin interfaz (uno nuevo por corrida, sin cachés) y build de producción; tareas largas (> 50 ms) durante ${VENTANA_MS / 1000} s desde la navegación y el momento en que la escena queda lista; ${REPEATS} corridas por variante en orden alterno, mediana de cada cifra.`,
  maquina: {
    cpu: os.cpus()[0]?.model ?? null,
    memoria_gb: Math.round((os.totalmem() / 1073741824) * 10) / 10,
    sistema: `${os.platform()} ${os.release()}`,
  },
  precompilada: resumen(corridas.precompilada),
  sin_precompilar: resumen(corridas.sin_precompilar),
  corridas,
};
writeFileSync(OUT, `${JSON.stringify(resultado, null, 2)}\n`);
console.log(OUT);
console.log("precompilada   ", JSON.stringify(resultado.precompilada));
console.log("sin precompilar", JSON.stringify(resultado.sin_precompilar));
