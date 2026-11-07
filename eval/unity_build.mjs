#!/usr/bin/env node
/**
 * Mide el build WebGL del visor en esta computadora (plan v4 §3.3, U1): cuánto pesa y cuánto tarda
 * en cargar. El riesgo más grande del plan se mide desde el principio.
 *
 *   powershell tools/unity/build-web.ps1
 *   node eval/unity_build.mjs [--corridas 3] [--caso axa_alcance] [--mbps 20] [--proyecto ruta]
 *
 * Por corrida: navegador nuevo y sin caché, con la tarjeta de video de la computadora. Mide hasta
 * `listo` (Unity arrancó) y hasta `cargado` (el caso se ve, con sus modelos bajados de Blob), con el
 * límite de red que se pida, y los fps que reporta Unity. Se guarda la mediana.
 *
 * El servidor local entrega el build con Brotli de calidad 9, porque Vercel Blob también comprime al
 * servir. No sabemos con qué calidad, así que el peso comprimido es una referencia: la cifra de
 * producción se mide en U6.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import { extname, join, resolve } from "node:path";
import process from "node:process";
import { brotliCompressSync, constants } from "node:zlib";

const RAIZ = resolve(import.meta.dirname, "..");
const SALIDA = join(RAIZ, "eval/results/unity_build.json");
const CAPTURA = join(RAIZ, "eval/results/unity_build.png");
const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const PROYECTO = resolve(RAIZ, arg("proyecto", "apps/visor-unity"));
const BUILD = join(PROYECTO, "Build/web");
const CORRIDAS = Number(arg("corridas", 3));
const CASO = arg("caso", "axa_alcance");
const MBPS = Number(arg("mbps", 20));
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
};
const mediana = (xs) => {
  const v = [...xs].filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const unDecimal = (x) => (x === null ? null : Math.round(x * 10) / 10);

function archivos(dir, base = dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? archivos(p, base)
      : [p.slice(base.length + 1).replaceAll("\\", "/")];
  });
}

if (!existsSync(join(BUILD, "index.html"))) {
  console.error(`No hay build en ${BUILD}. Corre tools/unity/build-web.ps1.`);
  process.exit(1);
}

// Peso, crudo y comprimido.
const comprimidos = new Map();
const lista = archivos(BUILD).map((f) => {
  const crudo = readFileSync(join(BUILD, f));
  const br = brotliCompressSync(crudo, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 9,
      [constants.BROTLI_PARAM_SIZE_HINT]: crudo.length,
    },
  });
  comprimidos.set(f, br);
  return { archivo: f, bytes: crudo.length, bytes_br_q9: br.length };
});
const total = (k) => lista.reduce((s, a) => s + a[k], 0);

const servidor = createServer((req, res) => {
  const f = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1)) || "index.html";
  const br = comprimidos.get(f);
  if (!br) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-type": TIPOS[extname(f)] ?? "application/octet-stream",
    "content-encoding": "br",
    "content-length": br.length,
    "cache-control": "no-store",
  });
  res.end(br);
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${servidor.address().port}/`;

const paquete = readFileSync(
  join(RAIZ, `packages/scene-schema/fixtures/caso3d/${CASO}.json`),
  "utf8",
);

async function corrida(n) {
  const navegador = await chromium.launch({
    headless: false,
    args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11"],
  });
  try {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 720 } });
    const pagina = await contexto.newPage();
    const cdp = await contexto.newCDPSession(pagina);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 40,
      downloadThroughput: (MBPS * 1e6) / 8,
      uploadThroughput: (MBPS * 1e6) / 8,
    });
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(String(e)));

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

    await pagina.goto(url);
    const listo = await espera("listo", 300_000);
    await pagina.evaluate(() => (window.croquisCargaInicio = performance.now()));
    await pagina.evaluate((json) => {
      window.unityInstance.SendMessage("VisorPuente", "cargarCaso", JSON.stringify({ json }));
    }, paquete);
    const cargado = await espera("cargado", 300_000);
    const inicioCaso = await pagina.evaluate(() => window.croquisCargaInicio);

    await pagina.evaluate(() =>
      window.unityInstance.SendMessage("VisorPuente", "reproducir", "{}"),
    );
    await pagina.waitForTimeout(16_000);
    const fps = await pagina.evaluate(() =>
      window.croquisVisorRecibidos.filter((m) => m.tipo === "fps").map((m) => m.p50),
    );
    const memoria = await pagina.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    if (n === 0) await pagina.screenshot({ path: CAPTURA });
    return {
      hasta_listo_s: unDecimal(listo.ms / 1000),
      caso_cargado_s: unDecimal((cargado.ms - inicioCaso) / 1000),
      total_s: unDecimal(cargado.ms / 1000),
      fps_p50: mediana(fps),
      fps_muestras: fps.length,
      heap_js_mb: memoria === null ? null : unDecimal(memoria / 1048576),
      errores,
    };
  } finally {
    await navegador.close();
  }
}

const corridas = [];
try {
  for (let i = 0; i < CORRIDAS; i++) {
    const r = await corrida(i);
    corridas.push(r);
    console.log(`Corrida ${i + 1}:`, JSON.stringify(r));
  }
} finally {
  servidor.close();
}

const version = readFileSync(join(PROYECTO, "ProjectSettings/ProjectVersion.txt"), "utf8").match(
  /m_EditorVersion: (.+)/,
)?.[1];
const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8" }).trim();
mkdirSync(join(RAIZ, "eval/results"), { recursive: true });
const m = (k) => mediana(corridas.map((c) => c[k]));
const resultado = {
  fecha: new Date().toISOString(),
  commit: git("rev-parse", "HEAD"),
  unity: version,
  maquina: {
    cpu: os.cpus()[0]?.model,
    nucleos: os.cpus().length,
    ram_gb: Math.round(os.totalmem() / 2 ** 30),
    so: `${os.type()} ${os.release()}`,
  },
  metodo:
    `Mediana de ${CORRIDAS} corridas con navegador nuevo y sin caché, ${MBPS} Mbps y 40 ms al servidor local; ` +
    "los modelos se bajan de Vercel Blob por la red real con el mismo límite. Brotli calidad 9 hecho aquí: " +
    "es referencia, la cifra de producción se mide en U6.",
  caso: CASO,
  peso: {
    bytes: total("bytes"),
    mb: unDecimal(total("bytes") / 1048576),
    br_q9_bytes: total("bytes_br_q9"),
    br_q9_mb: unDecimal(total("bytes_br_q9") / 1048576),
    archivos: lista,
  },
  carga: {
    hasta_listo_s: m("hasta_listo_s"),
    caso_cargado_s: m("caso_cargado_s"),
    total_s: m("total_s"),
    fps_p50: m("fps_p50"),
  },
  corridas,
};
writeFileSync(SALIDA, `${JSON.stringify(resultado, null, 2)}\n`);
console.log(`Escrito ${SALIDA}`);
console.log(
  JSON.stringify({
    peso_mb: resultado.peso.mb,
    br_mb: resultado.peso.br_q9_mb,
    ...resultado.carga,
  }),
);
