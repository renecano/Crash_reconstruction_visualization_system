#!/usr/bin/env node
/**
 * U4, e2e del cambio de cámaras en el build WebGL del visor (no corre en CI: el build necesita
 * licencia y tarda más de 10 min, ADR 0111). Abre el build en Chromium, carga un caso por el puente
 * y comprueba, para cada cámara (`cenital`, `cinematica`, `orbita`, `acera`, `libre` y la de cada
 * conductor), que Unity contesta `camara` con ese modo y que la imagen cambia. Después, que «Ver
 * todo» desde la cinematográfica pasa a la órbita y avisa, que «Ir al impacto» acerca la vista y que
 * el minimapa está en su esquina. Con `--capturas <carpeta>` guarda una imagen por paso para el
 * «Resumen para René».
 *
 *   powershell tools/unity/build-web.ps1
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-escenas.ts u3 motociclista
 *   node tools/unity/e2e-camaras.mjs [--caso apps/visor-unity/Build/u3/motociclista.json] [--t 0.3] [--capturas docs/cesvi/u4]
 *
 * Sale con 1 si algo falla. Sirve también `/modelos/` desde `apps/web/public`, como el sitio, para que
 * las personas lleven el cuerpo de MakeHuman.
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "../..");
const BUILD = join(RAIZ, "apps/visor-unity/Build/web");
const PUBLICO = join(RAIZ, "apps/web/public");
const deWeb = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = deWeb("@playwright/test");
const sharp = createRequire(deWeb.resolve("next/package.json"))("sharp");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const CASO = resolve(RAIZ, arg("caso", "apps/visor-unity/Build/u3/motociclista.json"));
const T = Number(arg("t", 0.3));
const CAPTURAS = arg("capturas", null) ? resolve(RAIZ, arg("capturas")) : null;
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
};

const servidor = createServer((q, s) => {
  const ruta = decodeURIComponent(new URL(q.url, "http://x").pathname);
  const f = ruta.startsWith("/modelos/")
    ? join(PUBLICO, ruta)
    : join(BUILD, ruta === "/" ? "index.html" : ruta);
  if (!existsSync(f)) return s.writeHead(404).end();
  s.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream" });
  s.end(readFileSync(f));
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });

const fallas = [];
const ok = (cond, texto) => {
  console.log(`${cond ? "✓" : "✗"} ${texto}`);
  if (!cond) fallas.push(texto);
};

/** Qué tan distintas son dos imágenes: la diferencia media por canal, de 0 a 255 (a 160 × 90). */
async function diferencia(a, b) {
  const [x, y] = await Promise.all(
    [a, b].map((i) => sharp(i).resize(160, 90).removeAlpha().raw().toBuffer()),
  );
  let suma = 0;
  for (let k = 0; k < x.length; k++) suma += Math.abs(x[k] - y[k]);
  return suma / x.length;
}

const navegador = await chromium.launch({
  headless: false,
  args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
try {
  const pagina = await (
    await navegador.newContext({ viewport: { width: 1600, height: 900 } })
  ).newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(String(e)));
  await pagina.goto(`http://127.0.0.1:${servidor.address().port}/`);
  const recibidos = () => pagina.evaluate(() => window.croquisVisorRecibidos.length);
  const espera = async (tipo, desde, ms = 180_000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      const m = await pagina.evaluate(
        ([t, d]) =>
          window.croquisVisorRecibidos.slice(d).find((x) => x.tipo === t || x.tipo === "error"),
        [tipo, desde],
      );
      if (m?.tipo === "error") throw new Error(`Unity: ${m.codigo}: ${m.mensaje}`);
      if (m) return m;
      await pagina.waitForTimeout(150);
    }
    return null;
  };
  const enviar = (metodo, campos) =>
    pagina.evaluate(
      ([m, c]) => window.unityInstance.SendMessage("VisorPuente", m, JSON.stringify(c)),
      [metodo, campos],
    );
  const foto = async (nombre) => {
    await pagina.waitForTimeout(1800);
    const png = await pagina.screenshot();
    if (CAPTURAS)
      await sharp(png)
        .webp({ quality: 86 })
        .toFile(join(CAPTURAS, `${nombre}.webp`));
    return png;
  };

  await espera("listo", 0);
  const caso = readFileSync(CASO, "utf8");
  const conductores = JSON.parse(caso)
    .resultado.vehiculos.filter((v) => v.involucrado)
    .map((v) => `conductor:${v.id}`);
  let desde = await recibidos();
  await enviar("cargarCaso", { json: caso });
  ok(Boolean(await espera("cargado", desde)), "el caso se carga");
  await enviar("fijarTiempo", { t: T });

  // 1. Cada cámara contesta con su modo y se ve distinta de la anterior.
  const modos = ["cinematica", "cenital", "orbita", "acera", ...conductores, "libre"];
  let previa = null;
  for (const modo of modos) {
    desde = await recibidos();
    await enviar("camara", { modo });
    const r = await espera("camara", desde, 15_000);
    ok(r?.modo === modo, `«${modo}»: Unity contesta camara = ${r?.modo ?? "nada"}`);
    const png = await foto(`camara-${modo.replace(":", "-")}`);
    if (previa) {
      const d = await diferencia(previa, png);
      ok(d > 4, `«${modo}» se ve distinta de la cámara anterior (diferencia ${d.toFixed(1)})`);
    }
    previa = png;
  }

  // 2. «Ver todo» desde la cinematográfica pasa a la órbita y lo dice; «Ir al impacto» acerca.
  await enviar("camara", { modo: "cinematica" });
  await pagina.waitForTimeout(800);
  desde = await recibidos();
  await enviar("encuadrar", { zona: "todo" });
  const r = await espera("camara", desde, 15_000);
  ok(r?.modo === "orbita", `«Ver todo» desde la cinematográfica pasa a la órbita (${r?.modo})`);
  const todo = await foto("ver-todo");
  await enviar("encuadrar", { zona: "impacto" });
  const impacto = await foto("ir-al-impacto");
  const d = await diferencia(todo, impacto);
  ok(d > 4, `«Ir al impacto» cambia la vista (diferencia ${d.toFixed(1)})`);

  // 3. El minimapa: la esquina de abajo a la derecha no es la escena de atrás. Se compara con la
  // cenital, donde el minimapa se esconde.
  const esquina = (png) =>
    sharp(png).extract({ left: 1290, top: 650, width: 280, height: 220 }).png().toBuffer();
  await enviar("camara", { modo: "orbita" });
  const conMapa = await esquina(await foto("minimapa"));
  await enviar("camara", { modo: "cenital" });
  const sinMapa = await esquina(await foto("cenital-sin-minimapa"));
  ok(
    (await diferencia(conMapa, sinMapa)) > 4,
    "el minimapa está en su esquina y se esconde en la cenital",
  );

  // 4. Una cámara que no existe contesta con un error, sin cambiar la que está.
  desde = await recibidos();
  await enviar("camara", { modo: "submarina" });
  const e = await pagina.evaluate(
    (d0) => window.croquisVisorRecibidos.slice(d0).find((x) => x.tipo === "error"),
    desde,
  );
  await pagina.waitForTimeout(500);
  const e2 =
    e ??
    (await pagina.evaluate(
      (d0) => window.croquisVisorRecibidos.slice(d0).find((x) => x.tipo === "error"),
      desde,
    ));
  ok(Boolean(e2), "una cámara que no existe contesta con un error");
  ok(errores.length === 0, `sin errores en la página (${errores.length})`);
} catch (e) {
  fallas.push(String(e));
  console.error(e);
} finally {
  await navegador.close();
  servidor.close();
}
console.log(fallas.length ? `\n${fallas.length} fallas` : "\nTodo en verde");
process.exit(fallas.length ? 1 : 0);
