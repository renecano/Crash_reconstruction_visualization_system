#!/usr/bin/env node
/**
 * Perfil del visor Unity en la web (U5, ADR 0115): cuánto cuesta cada parte del dibujo, en un solo
 * build, con los interruptores de `depurar` (`Perfilado.cs`). No es la medición E6: es para decidir
 * qué optimizar. En una sola sesión del navegador por escena, cada experimento apaga o cambia una
 * cosa, mide los fps unos segundos y la restaura; la línea base se repite al principio, a la mitad y
 * al final para ver la deriva térmica.
 *
 *   node eval/u5_perfil.mjs [--casos lateral_interseccion-noche,axa-dia] [--nivel media]
 *                           [--segundos 5] [--ancho 1920] [--alto 1080] [--nombre u5_perfil]
 *                           [--solo escala,minimapa] [--grupos] [--abab]
 *
 * `--grupos` agrega un experimento por grupo de la escena (lo oculta). `--abab` mide la línea base
 * antes y después de cada experimento y compara contra esas dos: tarda el triple, pero quita la
 * deriva térmica, que en esta laptop mueve el cuadro varios milisegundos.
 *
 * Escribe `eval/results/<nombre>.json`: el inventario de la escena por grupo, los contadores de
 * dibujo y, por experimento, los fps y la diferencia en ms por cuadro contra la línea base.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import { extname, join, resolve } from "node:path";
import process from "node:process";
import { MEASURE_ARGS, round } from "./lib/viewer-measure.mjs";
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
const CASOS = arg("casos", "lateral_interseccion-noche,axa-dia").split(",");
const NIVEL = arg("nivel", "media");
const SEGUNDOS = Number(arg("segundos", 5));
const ANCHO = Number(arg("ancho", 1920));
const ALTO = Number(arg("alto", 1080));
const NOMBRE = arg("nombre", "u5_perfil");
const SOLO = arg("solo", null)?.split(",") ?? null;
const GRUPOS = process.argv.includes("--grupos");
const ABAB = process.argv.includes("--abab");
// Interruptores que se dejan puestos toda la sesión (JSON): por ejemplo, todo lo de pixel apagado y
// escala 0.25 para medir el costo de CPU de cada grupo sin el ruido de la GPU.
const EXTRA = arg("extra", null);
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
const url = `http://127.0.0.1:${servidor.address().port}/`;

/**
 * Los experimentos fijos: qué se manda para aplicarlo y qué para restaurarlo. Los valores de
 * restauración son los del perfil «media» de `Croquis.Core.Calidades` (o los de `--nivel`).
 */
const BASE = {
  baja: { sombra_distancia: 50, cascadas: 1, mapa_sombras: 1024, luces_max: 4, msaa_urp: 1 },
  media: { sombra_distancia: 70, cascadas: 1, mapa_sombras: 2048, luces_max: 4, msaa_urp: 1 },
}[NIVEL] ?? { sombra_distancia: 110, cascadas: 4, mapa_sombras: 4096, luces_max: 8, msaa_urp: 4 };
const ESCALA = NIVEL === "baja" ? 0.75 : 1;
// La oclusión de media en `PrepararEscenario.Oclusion`.
const SSAO = { Source: 0, Samples: 2, BlurQuality: 1, AfterOpaque: true };
const FIJOS = [
  ["escala_0.25", { escala: 0.25 }, { escala: ESCALA }],
  [
    "piso_todo_apagado",
    { ssao: false, sombras_sol: false, luces: false, msaa_urp: 1, pos: false, minimapa: false },
    {
      ssao: NIVEL !== "baja",
      sombras_sol: true,
      luces: true,
      msaa_urp: BASE.msaa_urp,
      pos: true,
      minimapa: true,
    },
  ],
  [
    "piso_todo_apagado_escala_0.25",
    {
      ssao: false,
      sombras_sol: false,
      luces: false,
      msaa_urp: 1,
      pos: false,
      minimapa: false,
      escala: 0.25,
    },
    {
      ssao: NIVEL !== "baja",
      sombras_sol: true,
      luces: true,
      msaa_urp: BASE.msaa_urp,
      pos: true,
      minimapa: true,
      escala: ESCALA,
    },
  ],
  ["escala_0.75", { escala: 0.75 }, { escala: ESCALA }],
  ["escala_0.5", { escala: 0.5 }, { escala: ESCALA }],
  ["sin_minimapa", { minimapa: false }, { minimapa: true }],
  ["sin_oclusion", { ssao: false }, { ssao: NIVEL !== "baja" }],
  ["sin_posproceso", { pos: false }, { pos: true }],
  ["sin_resplandor", { resplandor: false }, { resplandor: NIVEL !== "baja" }],
  ["sin_msaa", { msaa_urp: 1 }, { msaa_urp: BASE.msaa_urp }],
  ["sin_hdr", { hdr_urp: false }, { hdr_urp: true }],
  ["sin_sombras_sol", { sombras_sol: false }, { sombras_sol: true }],
  ["una_cascada", { cascadas: 1 }, { cascadas: BASE.cascadas }],
  ["mapa_sombras_1024", { mapa_sombras: 1024 }, { mapa_sombras: BASE.mapa_sombras }],
  ["sombras_40m", { sombra_distancia: 40 }, { sombra_distancia: BASE.sombra_distancia }],
  ["sin_luces", { luces: false }, { luces: true }],
  ["luces_max_2", { luces_max: 2 }, { luces_max: BASE.luces_max }],
  ["sin_sonda", { sonda: false }, { sonda: true }],
  ["sin_niebla", { niebla: false }, { niebla: true }],
  [
    "sin_oclusion_ni_profundidad",
    { ssao: false, profundidad: false },
    { ssao: NIVEL !== "baja", profundidad: true },
  ],
  ["lejos_400m", { lejos: 400 }, { lejos: 2000 }],
  // Oclusión: de dónde saca las normales (0: de la profundidad, sin pasada extra; 1: pasada de
  // normales), cuántas muestras (0 alta, 1 media, 2 baja), el desenfoque (0 alto, 1 medio, 2 bajo)
  // y si se aplica después de los opacos en vez de dentro del sombreador.
  ["ssao_de_profundidad", { ssao_ajuste: { Source: 0 } }, { ssao_ajuste: SSAO }],
  ["ssao_despues_de_opacos", { ssao_ajuste: { AfterOpaque: true } }, { ssao_ajuste: SSAO }],
  [
    "ssao_muestras_y_desenfoque_bajos",
    { ssao_ajuste: { Samples: 2, BlurQuality: 2 } },
    { ssao_ajuste: SSAO },
  ],
  [
    "ssao_barato",
    { ssao_ajuste: { Source: 0, Samples: 2, BlurQuality: 2, AfterOpaque: true } },
    { ssao_ajuste: SSAO },
  ],
  [
    "fxaa_sin_msaa",
    { msaa_urp: 1, fxaa: true },
    { msaa_urp: BASE.msaa_urp, fxaa: NIVEL === "media" },
  ],
  [
    "sin_msaa_ssao_de_profundidad",
    { msaa_urp: 1, ssao_ajuste: { Source: 0 } },
    { msaa_urp: BASE.msaa_urp, ssao_ajuste: SSAO },
  ],
  ["resplandor_3_pasos", { bloom_iter: 3 }, { bloom_iter: 6 }],
  ["resplandor_a_un_cuarto", { bloom_cuarto: true }, { bloom_cuarto: false }],
  ["sombras_duras", { sombras_duras: true }, { sombras_duras: false }],
  [
    "una_cascada_60m",
    { cascadas: 1, sombra_distancia: 60 },
    { cascadas: BASE.cascadas, sombra_distancia: BASE.sombra_distancia },
  ],
  ["escala_0.7_lineal", { escala: 0.7, filtro: 1 }, { escala: ESCALA, filtro: 0 }],
  ["escala_0.7_fsr", { escala: 0.7, filtro: 3 }, { escala: ESCALA, filtro: 0 }],
  [
    "candidato",
    {
      cascadas: 1,
      sombra_distancia: 60,
      ssao_ajuste: { Source: 0, Samples: 2, BlurQuality: 2, AfterOpaque: true },
      msaa_urp: 1,
      fxaa: true,
    },
    {
      cascadas: BASE.cascadas,
      sombra_distancia: BASE.sombra_distancia,
      ssao_ajuste: SSAO,
      msaa_urp: BASE.msaa_urp,
      fxaa: NIVEL === "media",
    },
  ],
  [
    "candidato_escala_0.7",
    {
      cascadas: 1,
      sombra_distancia: 60,
      ssao_ajuste: { Source: 0, Samples: 2, BlurQuality: 2, AfterOpaque: true },
      msaa_urp: 1,
      fxaa: true,
      escala: 0.7,
      filtro: 3,
    },
    {
      cascadas: BASE.cascadas,
      sombra_distancia: BASE.sombra_distancia,
      ssao_ajuste: SSAO,
      msaa_urp: BASE.msaa_urp,
      fxaa: NIVEL === "media",
      escala: ESCALA,
      filtro: 0,
    },
  ],
];

async function perfilar(caso, navegador) {
  const paquete = readFileSync(join(CASOS_DIR, `${caso}.json`), "utf8");
  const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } });
  const espera = async (tipo, ms, filtro = () => true) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      const m = await pagina.evaluate(
        (t) => window.croquisVisorRecibidos.filter((x) => x.tipo === t || x.tipo === "error"),
        tipo,
      );
      const error = m.find((x) => x.tipo === "error");
      if (error) throw new Error(`Unity: ${error.codigo}: ${error.mensaje}`);
      const ok = m.find(filtro);
      if (ok) return ok;
      await pagina.waitForTimeout(100);
    }
    throw new Error(`Sin «${tipo}» en ${ms / 1000} s`);
  };
  const enviar = (metodo, datos) =>
    pagina.evaluate(
      ([m, d]) => window.unityInstance.SendMessage("VisorPuente", m, d),
      [metodo, JSON.stringify(datos)],
    );
  let pedidos = 0;
  const preguntar = async (datos) => {
    const pedido = ++pedidos;
    await enviar("depurar", { ...datos, pedido });
    return espera("perfil", 20_000, (x) => x.pedido === pedido);
  };
  const medir = async () => {
    await pagina.waitForTimeout(2000);
    await pagina.evaluate(() => {
      window.croquisCpu.t = 0;
      window.croquisCpu.n = 0;
    });
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
    const total = cuadros.reduce((s, x) => s + x, 0);
    const cpu = await pagina.evaluate(() => ({ ...window.croquisCpu }));
    return {
      fps: (cuadros.length * 1000) / total,
      ms: total / cuadros.length,
      // Lo que tarda el hilo principal en cada cuadro de Unity (guiones, culling y órdenes de dibujo).
      cpu_ms: cpu.n ? cpu.t / cpu.n : null,
    };
  };

  // El tiempo de CPU: lo que dura cada llamada de requestAnimationFrame (el cuadro de Unity).
  await pagina.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.croquisCpu = { t: 0, n: 0 };
    window.requestAnimationFrame = (cb) =>
      raf((ts) => {
        const a = performance.now();
        cb(ts);
        const d = performance.now() - a;
        // Las llamadas de la propia medición duran microsegundos: no cuentan.
        if (d > 0.3) {
          window.croquisCpu.t += d;
          window.croquisCpu.n++;
        }
      });
  });

  await pagina.goto(url);
  await espera("listo", 300_000);
  await enviar("calidad", { nivel: NIVEL });
  await enviar("cargarCaso", { json: paquete });
  await espera("cargado", 300_000);
  await enviar("camara", { modo: "cinematica" });
  await enviar("depurar", { bucle: true });
  await enviar("reproducir", {});
  if (EXTRA) await enviar("depurar", JSON.parse(EXTRA));
  await pagina.waitForTimeout(4000);

  const inventario = await preguntar({ inventario: true });
  await preguntar({ estadisticas: true });
  await pagina.waitForTimeout(500);
  const estadisticas = await preguntar({ estadisticas: true });
  const grupos = Object.keys(inventario.grupos).filter((g) => inventario.grupos[g].renderers > 0);
  const experimentos = [
    ...FIJOS,
    ...(GRUPOS ? grupos.map((g) => [`oculto:${g}`, { ocultar: g }, { mostrar: g }]) : []),
  ].filter(([n]) => !SOLO || SOLO.some((s) => n.includes(s)));

  const bases = [await medir()];
  const filas = [];
  for (const [i, [nombre, poner, quitar]] of experimentos.entries()) {
    const antes = ABAB ? await medir() : null;
    await enviar("depurar", poner);
    const m = await medir();
    const dibujo = await preguntar({ estadisticas: true });
    await enviar("depurar", quitar);
    const despues = ABAB ? await medir() : null;
    filas.push({
      nombre,
      fps: round(m.fps, 1),
      ms: round(m.ms, 2),
      base_ms: ABAB ? round((antes.ms + despues.ms) / 2, 2) : null,
      cpu_ms: round(m.cpu_ms, 2),
      llamadas: dibujo?.llamadas,
    });
    console.log(`${caso} ${nombre}: ${m.fps.toFixed(1)} fps, cpu ${m.cpu_ms?.toFixed(1)} ms`);
    if (i === Math.floor(experimentos.length / 2)) bases.push(await medir());
  }
  bases.push(await medir());
  await pagina.close();
  const msBase = bases.reduce((s, b) => s + b.ms, 0) / bases.length;
  return {
    caso,
    base: {
      fps: bases.map((b) => round(b.fps, 1)),
      ms_promedio: round(msBase, 2),
      cpu_ms: bases.map((b) => round(b.cpu_ms, 2)),
    },
    estadisticas,
    luces: inventario.luces,
    inventario: inventario.grupos,
    experimentos: filas
      .map((f) => ({ ...f, ahorro_ms: round((f.base_ms ?? msBase) - f.ms, 2) }))
      .sort((a, b) => b.ahorro_ms - a.ahorro_ms),
  };
}

const energia = useBestPerformance();
const resultados = [];
try {
  for (const caso of CASOS) {
    const navegador = await chromium.launch({
      headless: false,
      args: [...MEASURE_ARGS, "--use-angle=d3d11", `--window-size=${ANCHO},${ALTO + 140}`],
    });
    try {
      resultados.push(await perfilar(caso, navegador));
    } finally {
      await navegador.close();
    }
  }
} finally {
  servidor.close();
  energia.restore();
}
mkdirSync(join(RAIZ, "eval/results"), { recursive: true });
const salida = join(RAIZ, `eval/results/${NOMBRE}.json`);
writeFileSync(
  salida,
  `${JSON.stringify(
    {
      fecha: new Date().toISOString(),
      metodo:
        `Build WebGL local a ${ANCHO}×${ALTO}, nivel ${NIVEL}, cámara cinematográfica en bucle. Una sesión por ` +
        `escena; cada experimento cambia una cosa, espera 2 s, mide ${SEGUNDOS} s de cuadros del navegador y la ` +
        "restaura. «ahorro_ms» es contra el promedio de tres líneas base (inicio, mitad y fin). Sin vsync. " +
        "Sirve para ordenar qué optimizar, no como cifra de E6.",
      maquina: { cpu: os.cpus()[0]?.model, ram_gb: Math.round(os.totalmem() / 2 ** 30) },
      energia: energia.registro,
      nivel: NIVEL,
      extra: EXTRA ? JSON.parse(EXTRA) : null,
      resultados,
    },
    null,
    2,
  )}\n`,
);
console.log(`Escrito ${salida}`);
for (const r of resultados) {
  console.log(
    `\n${r.caso}: base ${r.base.fps.join(" / ")} fps (${r.base.ms_promedio} ms; cpu ${r.base.cpu_ms.join(" / ")} ms)`,
  );
  console.log(JSON.stringify(r.estadisticas));
  for (const e of r.experimentos) {
    console.log(
      `  ${e.ahorro_ms.toFixed(2).padStart(7)} ms  ${String(e.fps).padStart(5)} fps  cpu ${String(e.cpu_ms).padStart(5)}  llamadas ${String(e.llamadas).padStart(4)}  ${e.nombre}`,
    );
  }
}
