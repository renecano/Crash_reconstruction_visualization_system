#!/usr/bin/env node
/**
 * Captura las escenas de D1 en el build WebGL del visor: cada paquete de `Build/casos/` con la
 * cámara cinematográfica y la de la acera, en el instante pedido. Son las capturas que revisa René:
 * salen del mismo build que se publica, no del editor.
 *
 *   powershell tools/unity/build-web.ps1
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts
 *   node tools/unity/capturas.mjs [--salida docs/cesvi/u2/capturas] [--t 0.4]
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "../..");
const BUILD = join(RAIZ, "apps/visor-unity/Build");
const deWeb = createRequire(join(RAIZ, "apps/web/package.json"));
const { chromium } = deWeb("@playwright/test");
const sharp = createRequire(deWeb.resolve("next/package.json"))("sharp");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SALIDA = resolve(RAIZ, arg("salida", "docs/cesvi/u2/capturas"));
const T = Number(arg("t", 0.4));
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
};

const casos = readdirSync(join(BUILD, "casos")).filter((f) => f.endsWith(".json"));
const servidor = createServer((q, s) => {
  const ruta = decodeURIComponent(new URL(q.url, "http://x").pathname);
  const f = join(BUILD, "web", ruta === "/" ? "index.html" : ruta);
  if (!existsSync(f)) return s.writeHead(404).end();
  s.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream" });
  s.end(readFileSync(f));
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
mkdirSync(SALIDA, { recursive: true });

const navegador = await chromium.launch({
  headless: false,
  args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
const fps = {};
try {
  const pagina = await (
    await navegador.newContext({ viewport: { width: 1600, height: 900 } })
  ).newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(String(e)));
  await pagina.goto(`http://127.0.0.1:${servidor.address().port}/`);
  const espera = async (tipo, desde) => {
    const fin = Date.now() + 180_000;
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
    throw new Error(`Sin «${tipo}»`);
  };
  const enviar = (metodo, campos) =>
    pagina.evaluate(
      ([m, c]) => window.unityInstance.SendMessage("VisorPuente", m, JSON.stringify(c)),
      [metodo, campos],
    );
  await espera("listo", 0);
  for (const f of casos) {
    const nombre = f.replace(/\.json$/, "");
    const paquete = readFileSync(join(BUILD, "casos", f), "utf8");
    const desde = await pagina.evaluate(() => window.croquisVisorRecibidos.length);
    await enviar("cargarCaso", { json: paquete });
    await espera("cargado", desde);
    await enviar("fijarTiempo", { t: T });
    for (const vista of ["cinematica", "acera"]) {
      await enviar("camara", { modo: vista });
      await pagina.waitForTimeout(2500);
      const archivo = join(SALIDA, `${nombre}-${vista}.webp`);
      await sharp(await pagina.screenshot())
        .webp({ quality: 86 })
        .toFile(archivo);
      console.log(`Captura ${archivo.slice(RAIZ.length + 1)}`);
    }
    // Los fps que reporta Unity con el caso quieto en la cámara cinematográfica (cada 5 s).
    await enviar("camara", { modo: "cinematica" });
    const antes = await pagina.evaluate(() => window.croquisVisorRecibidos.length);
    await pagina.waitForTimeout(11_000);
    const muestras = await pagina.evaluate(
      (d) =>
        window.croquisVisorRecibidos
          .slice(d)
          .filter((m) => m.tipo === "fps")
          .map((m) => m.p50),
      antes,
    );
    fps[nombre] = muestras;
    console.log(`fps ${nombre}: ${muestras.join(", ")}`);
  }
  if (errores.length) console.log("Errores de la página:", errores);
} finally {
  await navegador.close();
  servidor.close();
}
// Las listas de números, en un renglón: así lo deja Prettier, que revisa CI.
const texto = JSON.stringify({ fecha: new Date().toISOString(), t: T, fps }, null, 2).replace(
  /\[\s+([\d.,\s]+?)\s+\]/g,
  (_, n) => `[${n.split(/,\s*/).join(", ")}]`,
);
writeFileSync(join(SALIDA, "fps.json"), `${texto}\n`);
