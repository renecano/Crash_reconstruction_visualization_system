#!/usr/bin/env node
/**
 * El trayecto previo en el build WebGL (René, 2026-11-27: «entorno de varios km sin trabarse; mide los
 * fps y el tiempo de carga»). Carga un paquete con `trayecto_previo`, mide cuánto tarda en estar
 * («cargarCaso» → «cargado»), reproduce a 1× con la cámara automática y junta los fps que reporta Unity
 * (p50 cada 5 s) durante el trayecto, y toma capturas en los instantes pedidos.
 *
 *   node tools/unity/medir-trayecto.mjs --paquete packages/scene-schema/fixtures/caso3d-previo/mex57-previo.json \
 *     --salida eval/results/u_trayecto_previo [--equipo "MacBook …"] [--tiempos -400,-60,-5,0,3]
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "../..");
const deWeb = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = deWeb("@playwright/test");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const WEB = join(RAIZ, "apps/visor-unity/Build", arg("build", "web"));
const PAQUETE = resolve(
  RAIZ,
  arg("paquete", "packages/scene-schema/fixtures/caso3d-previo/mex57-previo.json"),
);
const SALIDA = resolve(RAIZ, arg("salida", "eval/results/u_trayecto_previo"));
const TIEMPOS = arg("tiempos", "-400,-60,-5,0,3").split(",").map(Number);
const SEGUNDOS = Number(arg("segundos", 21));
const PUBLICO = join(RAIZ, "apps/web/public");
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
};

const servidor = createServer((q, s) => {
  const ruta = decodeURIComponent(new URL(q.url, "http://x").pathname);
  const f = ruta.startsWith("/modelos/")
    ? join(PUBLICO, ruta)
    : join(WEB, ruta === "/" ? "index.html" : ruta);
  if (!existsSync(f)) return s.writeHead(404).end();
  s.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream" });
  s.end(readFileSync(f));
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch({
  headless: false,
  args: [
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
try {
  const pagina = await (
    await navegador.newContext({ viewport: { width: 1600, height: 900 } })
  ).newPage();
  await pagina.goto(`http://127.0.0.1:${servidor.address().port}/`);
  const recibidos = (d = 0) => pagina.evaluate((d) => window.croquisVisorRecibidos.slice(d), d);
  const espera = async (tipo, desde) => {
    const fin = Date.now() + 240_000;
    while (Date.now() < fin) {
      const m = (await recibidos(desde)).find((x) => x.tipo === tipo || x.tipo === "error");
      if (m?.tipo === "error") throw new Error(`Unity: ${m.codigo}: ${m.mensaje}`);
      if (m) return m;
      await pagina.waitForTimeout(100);
    }
    throw new Error(`Sin «${tipo}»`);
  };
  const enviar = (m, c) =>
    pagina.evaluate(
      ([m, c]) => window.unityInstance.SendMessage("VisorPuente", m, JSON.stringify(c)),
      [m, c],
    );
  await espera("listo", 0);
  const texto = readFileSync(PAQUETE, "utf8");
  const paquete = JSON.parse(texto);
  const previo = paquete.escenario.vehiculos.map((v) => v.trayecto_previo).filter(Boolean)[0];
  const desde = (await recibidos()).length;
  const t0 = Date.now();
  await enviar("cargarCaso", { json: texto });
  await espera("cargado", desde);
  const cargaS = (Date.now() - t0) / 1000;
  await enviar("camara", { modo: "automatica" });
  // Los fps mientras recorre el trayecto, siguiéndolo.
  await enviar("fijarTiempo", { t: previo.t[0] + 5 });
  await enviar("velocidad", { x: 1 });
  const antes = (await recibidos()).length;
  await enviar("reproducir", {});
  await pagina.waitForTimeout(SEGUNDOS * 1000);
  await enviar("pausar", {});
  const fps = (await recibidos(antes)).filter((m) => m.tipo === "fps").map((m) => m.p50);
  // Referencia: el choque quieto en la cinematográfica, como `capturas.mjs`.
  await enviar("camara", { modo: "cinematica" });
  await enviar("fijarTiempo", { t: 0 });
  const quieto = (await recibidos()).length;
  await pagina.waitForTimeout(11_000);
  const fpsChoque = (await recibidos(quieto)).filter((m) => m.tipo === "fps").map((m) => m.p50);
  await enviar("camara", { modo: "automatica" });
  for (const t of TIEMPOS) {
    await enviar("fijarTiempo", { t });
    await pagina.waitForTimeout(2500);
    await pagina.screenshot({ path: join(SALIDA, `t${t}.jpg`), type: "jpeg", quality: 82 });
  }
  const resultado = {
    fecha: new Date().toISOString(),
    equipo: arg("equipo", "sin decir"),
    paquete: PAQUETE.slice(RAIZ.length + 1),
    trayecto: {
      distancia_m: previo.distancia_m,
      puntos: previo.x.length,
      duracion_s: previo.t.at(-1) - previo.t[0],
    },
    carga_s: cargaS,
    fps_p50_durante_el_trayecto: fps,
    fps_p50_choque_quieto_cinematica: fpsChoque,
  };
  writeFileSync(join(SALIDA, "medicion.json"), `${JSON.stringify(resultado, null, 2)}\n`);
  console.log(JSON.stringify(resultado));
} finally {
  await navegador.close();
  servidor.close();
}
