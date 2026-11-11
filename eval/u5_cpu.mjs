#!/usr/bin/env node
/**
 * Perfil de CPU del visor Unity en la web (U5, ADR 0115): en qué funciones se va el hilo principal.
 * Abre un caso en el build WebGL, lo reproduce en bucle y toma un perfil de CPU de Chromium (CDP
 * `Profiler`) durante unos segundos. Las órdenes de WebGL salen con su nombre (`_glDrawElements`,
 * `_glUniform4fv`…); el código de Unity sale junto, como wasm, salvo que el build lleve símbolos.
 *
 *   node eval/u5_cpu.mjs [--caso lateral_interseccion-noche] [--nivel media] [--segundos 6]
 *                        [--extra '{"escala":0.25}'] [--nombre u5_cpu]
 *
 * Escribe `eval/results/<nombre>.json` con el tiempo propio por función (ms por cuadro).
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";
import { MEASURE_ARGS, round } from "./lib/viewer-measure.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BUILD = join(RAIZ, "apps/visor-unity/Build/web");
const CASO = arg("caso", "lateral_interseccion-noche");
const NIVEL = arg("nivel", "media");
const SEGUNDOS = Number(arg("segundos", 6));
const EXTRA = arg("extra", null);
const NOMBRE = arg("nombre", "u5_cpu");
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
};
function archivos(dir, base = dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? archivos(p, base)
      : [p.slice(base.length + 1).replaceAll("\\", "/")];
  });
}
const contenido = new Map(archivos(BUILD).map((f) => [f, readFileSync(join(BUILD, f))]));
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

const navegador = await chromium.launch({
  headless: false,
  args: [...MEASURE_ARGS, "--use-angle=d3d11", "--window-size=1920,1220"],
});
let doc;
try {
  const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
  const espera = async (tipo) => {
    const fin = Date.now() + 300_000;
    while (Date.now() < fin) {
      const m = await pagina.evaluate(
        (t) => window.croquisVisorRecibidos.find((x) => x.tipo === t || x.tipo === "error"),
        tipo,
      );
      if (m?.tipo === "error") throw new Error(`Unity: ${m.codigo}: ${m.mensaje}`);
      if (m) return m;
      await pagina.waitForTimeout(100);
    }
    throw new Error(`Sin «${tipo}»`);
  };
  const enviar = (metodo, datos) =>
    pagina.evaluate(
      ([m, d]) => window.unityInstance.SendMessage("VisorPuente", m, d),
      [metodo, JSON.stringify(datos)],
    );
  await pagina.goto(`http://127.0.0.1:${servidor.address().port}/`);
  await espera("listo");
  await enviar("calidad", { nivel: NIVEL });
  await enviar("cargarCaso", {
    json: readFileSync(join(RAIZ, `apps/visor-unity/Build/casos/${CASO}.json`), "utf8"),
  });
  await espera("cargado");
  await enviar("camara", { modo: "cinematica" });
  await enviar("depurar", { bucle: true });
  await enviar("reproducir", {});
  if (EXTRA) await enviar("depurar", JSON.parse(EXTRA));
  await pagina.waitForTimeout(5000);

  const cdp = await pagina.context().newCDPSession(pagina);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  const cuadros0 = await pagina.evaluate(
    () =>
      new Promise((ok) => {
        let n = 0;
        window.croquisCuenta = () => n;
        const paso = () => {
          n++;
          requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
        ok(0);
      }),
  );
  await cdp.send("Profiler.start");
  const t0 = Date.now();
  await pagina.waitForTimeout(SEGUNDOS * 1000);
  const { profile } = await cdp.send("Profiler.stop");
  const ms = Date.now() - t0;
  const cuadros = (await pagina.evaluate(() => window.croquisCuenta())) - cuadros0;

  // Tiempo propio por función: cada muestra vale el intervalo hasta la siguiente.
  const porNodo = new Map(profile.nodes.map((n) => [n.id, n]));
  const propio = new Map();
  profile.samples.forEach((id, i) => {
    const n = porNodo.get(id);
    const f = n.callFrame;
    const nombre =
      f.functionName ||
      (f.url.includes("wasm") ? "(wasm)" : `(anónima ${f.url.split("/").pop()}:${f.lineNumber})`);
    propio.set(nombre, (propio.get(nombre) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  });
  const total = [...propio.values()].reduce((s, x) => s + x, 0);
  const filas = [...propio.entries()]
    .map(([nombre, t]) => ({
      nombre,
      ms_por_cuadro: round(t / cuadros, 3),
      pct: round((100 * t) / total, 1),
    }))
    .sort((a, b) => b.ms_por_cuadro - a.ms_por_cuadro);
  const gl = filas.filter((f) => /^_?(gl|emscripten_gl|webgl)/i.test(f.nombre));
  // Por categoría (con símbolos en el build): a qué se dedica el hilo principal.
  const CATEGORIAS = [
    ["skinning de personas", /Skin|Deform|BlendShape/],
    [
      "órdenes de WebGL del navegador",
      /^(vertexAttribPointer|bindBuffer|bindBufferRange|bindBufferBase|drawElements|drawArrays|bindTexture|uniform|bufferSubData|bufferData|drawBuffers|activeTexture|useProgram|bindFramebuffer|invalidateFramebuffer|getParameter|createBuffer|enable|disable|viewport|clear|blend|depth|stencil|cullFace|frontFace|scissor|colorMask|bindVertexArray|bindSampler|texSubImage|deleteBuffer|blitFramebuffer|readPixels|flush|finish)/,
    ],
    [
      "guiones de Croquis",
      /^(CamaraVisor|VisorCaso|VisorPuente|ArbolesVista|VehiculoVista|PersonaVista|EscenaDinamica|Perfilado|Calidad|PanelDiagnostico|SiempreVertical|Croquis|Personas_|Reproduccion|Muestreo|Malla_)/,
    ],
    [
      "URP y guiones gestionados (C#)",
      /_m[0-9A-F]{40}|_gshared|il2cpp|Il2Cpp|RuntimeInvoker|InvokerAction|VirtualActionInvoker/,
    ],
    [
      "dibujo de Unity (lotes, estado, parámetros)",
      /Render|Gfx|GLES|Shader|Batch|Draw|GpuProgram|Material|Texture|Buffer|Vertex|Camera|Cull|Shadow|Light|Sort|Mesh|Probe/,
    ],
    ["partículas", /Particle/],
    [
      "memoria",
      /memcpy|memset|malloc|free|dlmalloc|dlfree|MemoryManager|Allocator|operator new|realloc/,
    ],
    ["interfaz (UGUI)", /Canvas|UI::|Graphic|Text|Font/],
    ["transformaciones y animación", /Transform|Animat|Hierarchy/],
  ];
  const categorias = Object.fromEntries(CATEGORIAS.map(([n]) => [n, 0]));
  categorias.otros = 0;
  for (const f of filas) {
    if (f.nombre === "(idle)") continue;
    const c = CATEGORIAS.find(([, rx]) => rx.test(f.nombre));
    categorias[c ? c[0] : "otros"] += f.ms_por_cuadro;
  }
  for (const k of Object.keys(categorias)) categorias[k] = round(categorias[k], 2);
  doc = {
    fecha: new Date().toISOString(),
    caso: CASO,
    nivel: NIVEL,
    extra: EXTRA ? JSON.parse(EXTRA) : null,
    cuadros,
    fps: round((cuadros * 1000) / ms, 1),
    ms_por_cuadro: round(ms / cuadros, 2),
    ordenes_webgl_ms_por_cuadro: round(
      gl.reduce((s, f) => s + f.ms_por_cuadro, 0),
      2,
    ),
    categorias_ms_por_cuadro: categorias,
    funciones: filas.slice(0, 80),
  };
} finally {
  await navegador.close();
  servidor.close();
}
writeFileSync(join(RAIZ, `eval/results/${NOMBRE}.json`), `${JSON.stringify(doc, null, 2)}\n`);
console.log(
  `${doc.caso}: ${doc.fps} fps (${doc.ms_por_cuadro} ms); órdenes de WebGL ${doc.ordenes_webgl_ms_por_cuadro} ms por cuadro`,
);
console.log(JSON.stringify(doc.categorias_ms_por_cuadro, null, 1));
for (const f of doc.funciones.slice(0, Number(arg("lineas", 12)))) {
  console.log(
    `  ${String(f.ms_por_cuadro).padStart(7)} ms  ${String(f.pct).padStart(5)} %  ${f.nombre}`,
  );
}
