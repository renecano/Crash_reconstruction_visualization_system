#!/usr/bin/env node
/**
 * Qué parte del armado de un caso tarda más en Unity (René, 2026-11-16): el build web local, en
 * Chromium con ventana y la GPU de esta computadora. Por corrida, una instancia nueva de Unity que
 * carga varios casos seguidos (el primero, en frío; los siguientes, con lo que Unity ya reusa). De
 * cada carga: el tiempo hasta «cargado» y hasta el primer cuadro con el caso, el desglose que escribe
 * Unity en la consola («[carga] paso ms, …», acumulado desde que empieza a armar) y las tareas largas
 * del hilo principal.
 *
 *   powershell tools/unity/build-web.ps1
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts
 *   node tools/unity/perfil-carga.mjs [--corridas 3] [--casos axa-dia,lateral_interseccion-dia,axa-dia]
 *     [--salida eval/results/unity_carga_perfil.json] [--build web|antes]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import { extname, join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "../..");
const BUILD = join(RAIZ, "apps/visor-unity/Build");
const deWeb = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = deWeb("@playwright/test");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const CORRIDAS = Number(arg("corridas", 3));
const CASOS = arg("casos", "axa-dia,lateral_interseccion-dia,axa-dia").split(",");
const SALIDA = resolve(RAIZ, arg("salida", "eval/results/unity_carga_perfil.json"));
// Qué build se mide: `web` (el que acaba de compilar build-web.ps1) o `antes` (el publicado, para comparar).
const WEB = join(BUILD, arg("build", "web"));
const PUBLICO = join(RAIZ, "apps/web/public");
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".data": "application/octet-stream",
  ".glb": "model/gltf-binary",
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
const base = `http://127.0.0.1:${servidor.address().port}/`;

/** «[carga] leer_sobre 1.2 ms, vehiculos 340 ms, …» → { leer_sobre: 1.2, vehiculos: 340, … }. */
function pasos(linea) {
  // Unity escribe los decimales con la cultura del navegador (en es-MX, «3046,2»): se aceptan los dos.
  const o = {};
  const cuerpo = linea.replace(/^.*\[carga\]\s*/, "");
  for (const m of cuerpo.matchAll(/([a-z_][\w-]*) (-?\d+(?:[.,]\d+)?)(?: ms)?(?=, [a-z_]|$)/gi))
    o[m[1]] = Number(m[2].replace(",", "."));
  return o;
}

const corridas = [];
const navegador = await chromium.launch({
  headless: false,
  args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
try {
  for (let c = 0; c < CORRIDAS; c++) {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    const pagina = await ctx.newPage();
    const consola = [];
    pagina.on("console", (m) => {
      const t = m.text();
      if (t.includes("[carga]")) consola.push(t);
    });
    await pagina.addInitScript(() => {
      window.__largas = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries())
          window.__largas.push({ t: e.startTime, d: Math.round(e.duration) });
      }).observe({ type: "longtask", buffered: true });
    });
    const t0 = Date.now();
    await pagina.goto(base);
    const espera = async (tipo, desde) => {
      const fin = Date.now() + 300_000;
      while (Date.now() < fin) {
        const m = await pagina.evaluate(
          ([t, d]) =>
            window.croquisVisorRecibidos
              .slice(d)
              .find((x) => t.split("|").includes(x.tipo) || x.tipo === "error"),
          [tipo, desde],
        );
        if (m?.tipo === "error") throw new Error(`Unity: ${m.codigo}: ${m.mensaje}`);
        if (m) return m;
        await pagina.waitForTimeout(50);
      }
      throw new Error(`Sin «${tipo}»`);
    };
    await espera("listo", 0);
    const corrida = { arranque_ms: Date.now() - t0, cargas: [] };
    for (const caso of CASOS) {
      const paquete = readFileSync(join(BUILD, "casos", `${caso}.json`), "utf8");
      const desde = await pagina.evaluate(() => window.croquisVisorRecibidos.length);
      const lineas = consola.length;
      const inicio = await pagina.evaluate(() => performance.now());
      await pagina.evaluate(
        (j) =>
          window.unityInstance.SendMessage(
            "VisorPuente",
            "cargarCaso",
            JSON.stringify({ json: j }),
          ),
        paquete,
      );
      // Desde el puente 1.3.0, «visible» llega antes que «cargado»: el caso ya se ve y el entorno sigue.
      // Con un build anterior (sin «visible»), lo primero que llega es «cargado».
      await espera("visible|cargado", desde);
      const visible = await pagina.evaluate(() => performance.now());
      await espera("cargado", desde);
      const cargado = await pagina.evaluate(() => performance.now());
      // Lo que siga armando después de «cargado» (el entorno por partes): hasta el renglón de Unity.
      const fin = Date.now() + 120_000;
      while (consola.length === lineas && Date.now() < fin) await pagina.waitForTimeout(50);
      await pagina.waitForTimeout(500);
      const largas = await pagina.evaluate((a) => window.__largas.filter((x) => x.t >= a), inicio);
      corrida.cargas.push({
        caso,
        hasta_visible_ms: Math.round(visible - inicio),
        hasta_cargado_ms: Math.round(cargado - inicio),
        tarea_mas_larga_ms: Math.max(0, ...largas.map((x) => x.d)),
        tareas_de_mas_de_200_ms: largas.filter((x) => x.d > 200).length,
        tiempo_bloqueado_ms: largas.reduce((a, x) => a + Math.max(0, x.d - 50), 0),
        // Las tareas de más de 100 ms, con su inicio desde que se mandó el caso: para ubicarlas en el armado.
        tareas_largas: largas
          .filter((x) => x.d > 100)
          .map((x) => ({ desde_ms: Math.round(x.t - inicio), ms: x.d })),
        unity: consola[lineas] ? pasos(consola[lineas]) : null,
        renglon: consola[lineas] ?? null,
      });
    }
    corridas.push(corrida);
    await ctx.close();
  }
} finally {
  await navegador.close();
  servidor.close();
}

const mediana = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const resumen = CASOS.map((caso, k) => {
  const cs = corridas.map((c) => c.cargas[k]);
  const claves = [...new Set(cs.flatMap((x) => Object.keys(x.unity ?? {})))];
  return {
    carga: k + 1,
    caso,
    hasta_visible_ms: mediana(cs.map((x) => x.hasta_visible_ms)),
    hasta_cargado_ms: mediana(cs.map((x) => x.hasta_cargado_ms)),
    tarea_mas_larga_ms: mediana(cs.map((x) => x.tarea_mas_larga_ms)),
    tareas_de_mas_de_200_ms: mediana(cs.map((x) => x.tareas_de_mas_de_200_ms)),
    unity_acumulado_ms: Object.fromEntries(
      claves.map((c) => [c, mediana(cs.map((x) => x.unity?.[c]))]),
    ),
  };
});
writeFileSync(
  SALIDA,
  `${JSON.stringify(
    {
      descripcion:
        "El armado de un caso en Unity, por partes: el build web local en Chromium con ventana y GPU (ANGLE d3d11), 1440×900. Por corrida, una instancia nueva que carga los casos en orden (el primero en frío). `unity_acumulado_ms` es lo que escribe Unity en su renglón «[carga]»: ms acumulados desde que empieza a armar el caso. Mediana de las corridas.",
      script: "tools/unity/perfil-carga.mjs",
      fecha: new Date().toISOString(),
      maquina: {
        cpu: os.cpus()[0]?.model,
        nucleos: os.cpus().length,
        ram_gb: Math.round(os.totalmem() / 2 ** 30),
      },
      corridas: CORRIDAS,
      resumen,
      detalle: corridas,
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify(resumen, null, 1));
