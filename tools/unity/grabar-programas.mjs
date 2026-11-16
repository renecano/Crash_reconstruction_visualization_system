#!/usr/bin/env node
/**
 * Graba los programas de shaders que enlaza el build web de Unity (René, 2026-11-16: el 3D no puede
 * trabar la página). Unity compila cada shader y pregunta su estado en el acto, y esa espera bloqueaba
 * el hilo principal hasta 6.6 s en la laptop. Con esta lista, la web los manda a compilar en el
 * contexto de Unity en cuanto lo crea, sin esperar (`apps/web/src/lib/visor-unity/programas.ts`).
 *
 * Recorre, en el nivel con que arranca la web (medio), las escenas de D1 y las de cámaras con varias
 * cámaras e instantes. Guarda las fuentes una vez y los programas en el orden en que Unity los pidió
 * por primera vez: `apps/visor-unity/Build/web/programas.json.gz`, que `publicar-web.mjs` sube con el
 * build. Un programa que no esté en la lista sigue el camino de siempre.
 *
 *   powershell tools/unity/build-web.ps1
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts
 *   node tools/unity/grabar-programas.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const RAIZ = resolve(import.meta.dirname, "../..");
const BUILD = join(RAIZ, "apps/visor-unity/Build");
const WEB = join(BUILD, "web");
const PUBLICO = join(RAIZ, "apps/web/public");
const SALIDA = join(WEB, "programas.json.gz");
const deWeb = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = deWeb("@playwright/test");
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
};
const CARPETAS = ["casos", "casos-camaras"];
const CAMARAS = ["cinematica", "acera", "orbita", "cenital", "libre"];
const INSTANTES = [0, 0.4, 3];

const servidor = createServer((q, s) => {
  const ruta = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (ruta.includes("..")) return s.writeHead(404).end();
  const f = ruta.startsWith("/modelos/")
    ? join(PUBLICO, ruta)
    : join(WEB, ruta === "/" ? "index.html" : ruta);
  if (!existsSync(f)) return s.writeHead(404).end();
  s.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream" });
  s.end(readFileSync(f));
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));

const navegador = await chromium.launch({
  headless: false,
  args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
let lista;
try {
  const pagina = await (
    await navegador.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  // Solo el contexto del lienzo de Unity (su cargador crea antes otro, de prueba).
  await pagina.addInitScript(() => {
    const w = window;
    w.__programas = { fuentes: [], indice: new Map(), programas: [], claves: new Set() };
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) {
      const gl = original.call(this, tipo, ...resto);
      if (!gl || tipo !== "webgl2" || this.id !== "unity-canvas" || gl.__grabando) return gl;
      gl.__grabando = true;
      const g = w.__programas;
      const fuente = new WeakMap();
      const adjuntos = new WeakMap();
      const atributos = new WeakMap();
      const ss = gl.shaderSource.bind(gl);
      const as = gl.attachShader.bind(gl);
      const ba = gl.bindAttribLocation.bind(gl);
      const lp = gl.linkProgram.bind(gl);
      const gsp = gl.getShaderParameter.bind(gl);
      gl.shaderSource = (s, t) => (fuente.set(s, t), ss(s, t));
      gl.attachShader = (p, s) => (adjuntos.set(p, [...(adjuntos.get(p) ?? []), s]), as(p, s));
      gl.bindAttribLocation = (p, i, n) => (
        atributos.set(p, [...(atributos.get(p) ?? []), [i, n]]),
        ba(p, i, n)
      );
      gl.linkProgram = (p) => {
        const sh = (adjuntos.get(p) ?? []).map((s) => {
          const t = fuente.get(s);
          if (!g.indice.has(t)) {
            g.indice.set(t, g.fuentes.length);
            g.fuentes.push(t);
          }
          return [gsp(s, gl.SHADER_TYPE), g.indice.get(t)];
        });
        const attrs = atributos.get(p) ?? [];
        const clave = JSON.stringify([sh, attrs]);
        if (!g.claves.has(clave)) {
          g.claves.add(clave);
          g.programas.push({ sh, attrs });
        }
        return lp(p);
      };
      return gl;
    };
  });
  await pagina.goto(`http://127.0.0.1:${servidor.address().port}/`);
  const espera = async (tipo, desde) => {
    const fin = Date.now() + 300_000;
    while (Date.now() < fin) {
      const m = await pagina.evaluate(
        ([t, d]) =>
          window.croquisVisorRecibidos.slice(d).find((x) => x.tipo === t || x.tipo === "error"),
        [tipo, desde],
      );
      if (m?.tipo === "error") throw new Error(`Unity: ${m.codigo}: ${m.mensaje}`);
      if (m) return m;
      await pagina.waitForTimeout(100);
    }
    throw new Error(`Sin «${tipo}»`);
  };
  const enviar = (metodo, campos) =>
    pagina.evaluate(
      ([m, c]) => window.unityInstance.SendMessage("VisorPuente", m, JSON.stringify(c)),
      [metodo, campos],
    );
  await espera("listo", 0);
  // AXA primero: es el caso que más se abre, y el orden de la lista es el de compilación.
  const casos = CARPETAS.flatMap((c) =>
    existsSync(join(BUILD, c))
      ? readdirSync(join(BUILD, c))
          .filter((f) => f.endsWith(".json"))
          .map((f) => join(BUILD, c, f))
          // Solo paquetes caso-3d (en `casos-camaras/` también está la lista de cámaras).
          .filter((f) => readFileSync(f, "utf8").includes('"version_caso3d"'))
      : [],
  ).sort((a, b) => Number(!a.endsWith("axa-dia.json")) - Number(!b.endsWith("axa-dia.json")));
  for (const archivo of casos) {
    const desde = await pagina.evaluate(() => window.croquisVisorRecibidos.length);
    await enviar("cargarCaso", { json: readFileSync(archivo, "utf8") });
    await espera("cargado", desde);
    for (const t of INSTANTES)
      for (const modo of CAMARAS) {
        await enviar("fijarTiempo", { t });
        await enviar("camara", { modo });
        await pagina.waitForTimeout(700);
      }
    const n = await pagina.evaluate(() => window.__programas.programas.length);
    console.log(`${archivo.slice(BUILD.length + 1)}: ${n} programas en total`);
  }
  lista = await pagina.evaluate(() => ({
    fuentes: window.__programas.fuentes,
    programas: window.__programas.programas,
  }));
} finally {
  await navegador.close();
  servidor.close();
}

// El build al que pertenece: la web la usa solo si el .wasm es el mismo.
const code = readdirSync(join(WEB, "Build")).find((f) => f.endsWith(".wasm"));
const cuerpo = gzipSync(
  JSON.stringify({ version: 1, code, fuentes: lista.fuentes, programas: lista.programas }),
  { level: 9 },
);
writeFileSync(SALIDA, cuerpo);
console.log(
  `${lista.programas.length} programas, ${lista.fuentes.length} fuentes, ${(cuerpo.length / 1024).toFixed(0)} KB comprimido: ${SALIDA.slice(RAIZ.length + 1)}`,
);
