#!/usr/bin/env node
/**
 * E6 del visor Unity en la web (U5, ADR 0115): fps por escena y por nivel de calidad del build WebGL,
 * en esta computadora, con el protocolo de E6 (ADR 0026):
 *
 * - un navegador nuevo por medición, con la GPU real y sin tope de vsync ni de fps;
 * - tres repeticiones, en orden alterno de escenas (directo e inverso), y se reporta la mediana;
 * - modo de energía «Mejor rendimiento» durante la medición, restaurado al terminar;
 * - condiciones del equipo (batería, plan, memoria, carga) al inicio y al final.
 *
 *   powershell tools/unity/build-web.ps1
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts
 *   node eval/e6_unity.mjs [--niveles media,baja] [--casos axa-dia,axa-noche] [--corridas 3]
 *                          [--segundos 12] [--ancho 1920] [--alto 1080] [--nombre e6_unity_web]
 *                          [--minimapa no]
 *
 * Cada medición: carga el caso con el nivel fijo (sin automático, para que no baje a media
 * medición), lo reproduce en bucle con la cámara cinematográfica y toma los tiempos de cuadro del
 * navegador durante `--segundos`, después de 3 s de calentamiento. Escribe
 * `eval/results/<nombre>.json`.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import { extname, join, resolve } from "node:path";
import process from "node:process";
import { MEASURE_ARGS, percentile, round } from "./lib/viewer-measure.mjs";
import { useBestPerformance } from "./lib/power-mode.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BUILD = join(RAIZ, "apps/visor-unity/Build/web");
const CASOS_DIR = join(RAIZ, "apps/visor-unity/Build/casos");
const NIVELES = arg("niveles", "media,baja").split(",");
const CORRIDAS = Number(arg("corridas", 3));
const SEGUNDOS = Number(arg("segundos", 12));
const ANCHO = Number(arg("ancho", 1920));
const ALTO = Number(arg("alto", 1080));
const NOMBRE = arg("nombre", "e6_unity_web");
const MINIMAPA = arg("minimapa", "si") !== "no";
// Interruptores de `depurar` (JSON) que se dejan puestos al medir: para probar un ajuste de la
// canalización antes de fijarlo en el nivel. Queda anotado en el resultado.
const DEPURAR = arg("depurar", null);
// Lo mismo, pero antes de cargar el caso: para lo que se decide al armar la escena.
const ANTES = arg("antes", null);
const CASOS = (
  arg("casos", null)?.split(",") ??
  readdirSync(CASOS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort()
).filter(Boolean);
// Presupuesto de PLAN §7.8 a 1080p: media ≥ 60 y baja ≥ 30. Alta y ultra se miden en la laptop solo
// como información (ADR 0026): su meta es la computadora con tarjeta de video.
const META = { baja: 30, media: 60 };
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
};

if (!existsSync(join(BUILD, "index.html"))) {
  console.error(`No hay build en ${BUILD}. Corre tools/unity/build-web.ps1.`);
  process.exit(1);
}

function archivos(dir, base = dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? archivos(p, base)
      : [p.slice(base.length + 1).replaceAll("\\", "/")];
  });
}

const contenido = new Map(archivos(BUILD).map((f) => [f, readFileSync(join(BUILD, f))]));
// Los cuerpos de las personas los busca el build en /modelos/ del mismo origen (U3).
const MODELOS = join(RAIZ, "apps/web/public");
const servidor = createServer((req, res) => {
  const f = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1)) || "index.html";
  let cuerpo = contenido.get(f);
  if (!cuerpo && f.startsWith("modelos/") && existsSync(join(MODELOS, f))) {
    cuerpo = readFileSync(join(MODELOS, f));
  }
  if (!cuerpo) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-type": TIPOS[extname(f)] ?? "application/octet-stream",
    "content-length": cuerpo.length,
    "cache-control": "no-store",
  });
  res.end(cuerpo);
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${servidor.address().port}/`;

/** Condiciones del equipo (Windows: energía, batería, plan, memoria y carga del CPU), como E6. */
function condiciones() {
  const out = {
    momento: new Date().toISOString(),
    memoria_libre_mb: Math.round(os.freemem() / 1048576),
    memoria_total_mb: Math.round(os.totalmem() / 1048576),
  };
  if (process.platform !== "win32") return out;
  try {
    const ps = [
      "$b = Get-CimInstance Win32_Battery",
      "$c = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average",
      "$p = (powercfg /getactivescheme) -replace '^.*\\((.*)\\).*$', '$1'",
      "[pscustomobject]@{ bateria = $b.EstimatedChargeRemaining; estado_bateria = $b.BatteryStatus; carga_cpu = $c; plan = $p } | ConvertTo-Json -Compress",
    ].join("; ");
    const j = JSON.parse(
      execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }),
    );
    out.conectada = j.estado_bateria === null ? null : j.estado_bateria !== 1;
    out.bateria_pct = j.bateria;
    out.carga_cpu_pct = j.carga_cpu;
    out.plan_energia = j.plan;
  } catch (err) {
    out.error = String(err).slice(0, 200);
  }
  return out;
}

async function medir(caso, nivel) {
  const paquete = readFileSync(join(CASOS_DIR, `${caso}.json`), "utf8");
  const navegador = await chromium.launch({
    headless: false,
    args: [...MEASURE_ARGS, "--use-angle=d3d11", `--window-size=${ANCHO},${ALTO + 140}`],
  });
  try {
    const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } });
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
    const espera = async (tipo, ms) => {
      const fin = Date.now() + ms;
      while (Date.now() < fin) {
        const m = await pagina.evaluate(
          (t) => window.croquisVisorRecibidos.find((x) => x.tipo === t || x.tipo === "error"),
          tipo,
        );
        if (m?.tipo === "error") throw new Error(`Unity: ${m.codigo}: ${m.mensaje}`);
        if (m) return m;
        await pagina.waitForTimeout(100);
      }
      throw new Error(`Sin «${tipo}» en ${ms / 1000} s`);
    };
    const enviar = (metodo, datos) =>
      pagina.evaluate(
        ([m, d]) => window.unityInstance.SendMessage("VisorPuente", m, d),
        [metodo, JSON.stringify(datos)],
      );

    await pagina.goto(url);
    await espera("listo", 300_000);
    const gpu = await pagina.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    });
    // El nivel antes del caso: lo del escenario (matas, luminarias, faros) se arma con él.
    await enviar("calidad", { nivel });
    if (ANTES) await enviar("depurar", JSON.parse(ANTES));
    if (!MINIMAPA) await enviar("depurar", { minimapa: false });
    const t0 = Date.now();
    await enviar("cargarCaso", { json: paquete });
    await espera("cargado", 300_000);
    const cargaS = (Date.now() - t0) / 1000;
    if (DEPURAR) await enviar("depurar", JSON.parse(DEPURAR));
    await enviar("camara", { modo: "cinematica" });
    await enviar("depurar", { bucle: true });
    await enviar("reproducir", {});
    await pagina.waitForTimeout(3000);
    const cuadros = await pagina.evaluate(
      (ms) =>
        new Promise((ok) => {
          const tiempos = [];
          let previo = performance.now();
          const fin = previo + ms;
          const paso = (ahora) => {
            tiempos.push(ahora - previo);
            previo = ahora;
            if (ahora < fin) requestAnimationFrame(paso);
            else ok(tiempos);
          };
          requestAnimationFrame(paso);
        }),
      SEGUNDOS * 1000,
    );
    const diag = await pagina.evaluate(() =>
      window.croquisVisorRecibidos.filter((m) => m.tipo === "fps").map((m) => m.p50),
    );
    const orden = [...cuadros].sort((a, b) => a - b);
    const total = cuadros.reduce((s, x) => s + x, 0);
    return {
      caso,
      nivel,
      gpu,
      carga_s: round(cargaS, 1),
      cuadros: cuadros.length,
      fps_promedio: round((cuadros.length * 1000) / total, 1),
      fps_mediana: round(1000 / percentile(orden, 50), 1),
      fps_1pct_bajo: round(1000 / percentile(orden, 99), 1),
      ms_p95: round(percentile(orden, 95), 1),
      cuadros_mas_50ms: cuadros.filter((x) => x > 50).length,
      fps_unity_p50: diag,
      errores,
    };
  } finally {
    await navegador.close();
  }
}

const mediana = (xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

const energia = useBestPerformance();
const inicio = condiciones();
if (inicio.conectada === false) {
  console.warn("ADVERTENCIA: el equipo está en batería; la medición no es comparable (ADR 0026).");
}
const corridas = [];
try {
  for (let rep = 0; rep < CORRIDAS; rep++) {
    const orden = rep % 2 === 0 ? CASOS : [...CASOS].reverse();
    for (const caso of orden) {
      for (const nivel of NIVELES) {
        let r = null;
        for (let intento = 1; intento <= 2 && !r; intento++) {
          try {
            r = { repeticion: rep + 1, intento, ...(await medir(caso, nivel)) };
          } catch (e) {
            console.error(`${caso} ${nivel} rep ${rep + 1}: ${String(e).slice(0, 200)}`);
          }
        }
        if (r) {
          corridas.push(r);
          console.log(
            `${caso} ${nivel} rep ${rep + 1}: ${r.fps_mediana} fps (prom ${r.fps_promedio}, 1% ${r.fps_1pct_bajo})`,
          );
        }
      }
    }
  }
} finally {
  servidor.close();
  energia.restore();
}
const fin = condiciones();

const resumen = {};
for (const nivel of NIVELES) {
  resumen[nivel] = {};
  for (const caso of CASOS) {
    const rs = corridas.filter((c) => c.caso === caso && c.nivel === nivel);
    const promedios = rs.map((c) => c.fps_promedio);
    resumen[nivel][caso] = {
      fps_promedio_mediana: mediana(promedios),
      fps_mediana_mediana: mediana(rs.map((c) => c.fps_mediana)),
      fps_1pct_bajo_mediana: mediana(rs.map((c) => c.fps_1pct_bajo)),
      carga_s_mediana: mediana(rs.map((c) => c.carga_s)),
      repeticiones: rs.length,
      cumple: META[nivel] === undefined ? null : (mediana(promedios) ?? 0) >= META[nivel],
    };
  }
}
const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8" }).trim();
const version = readFileSync(
  join(RAIZ, "apps/visor-unity/ProjectSettings/ProjectVersion.txt"),
  "utf8",
).match(/m_EditorVersion: (.+)/)?.[1];
const doc = {
  fecha: new Date().toISOString(),
  commit: git("rev-parse", "HEAD"),
  unity: version,
  navegador: `Chromium de Playwright ${chromium.name()}`,
  metodo:
    `Build WebGL servido localmente; ${ANCHO}×${ALTO}; un navegador nuevo por medición; ${CORRIDAS} repeticiones ` +
    `en orden alterno; cámara cinematográfica, reproducción en bucle; 3 s de calentamiento y ${SEGUNDOS} s de ` +
    "tiempos de cuadro del navegador (requestAnimationFrame). Se reporta la mediana del promedio de fps. " +
    "Nivel fijo, sin el automático. vsync desactivado (--disable-gpu-vsync --disable-frame-rate-limit) para medir capacidad.",
  minimapa: MINIMAPA,
  depurar: DEPURAR ? JSON.parse(DEPURAR) : null,
  antes_de_cargar: ANTES ? JSON.parse(ANTES) : null,
  meta: "PLAN §7.8: media ≥ 60 fps y baja ≥ 30 fps a 1080p; alta y ultra en la laptop solo como información.",
  maquina: {
    cpu: os.cpus()[0]?.model,
    nucleos: os.cpus().length,
    ram_gb: Math.round(os.totalmem() / 2 ** 30),
    so: `${os.type()} ${os.release()}`,
    gpu: corridas.find((c) => c.gpu)?.gpu ?? null,
  },
  condiciones: {
    energia: energia.registro,
    inicio,
    fin,
    validas: inicio.conectada !== false && fin.conectada !== false,
  },
  resumen,
  corridas,
};
mkdirSync(join(RAIZ, "eval/results"), { recursive: true });
const salida = join(RAIZ, `eval/results/${NOMBRE}.json`);
writeFileSync(salida, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Escrito ${salida}`);
console.log(JSON.stringify(resumen, null, 1));
