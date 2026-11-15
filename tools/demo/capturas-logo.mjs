/**
 * Capturas del logo en el sitio (René, 2026-11-15): la portada pública y las pantallas de la app,
 * para comparar antes y después de unificarlo.
 *
 *   node tools/demo/capturas-logo.mjs <antes|despues> [url base]
 *     → docs/cesvi/logo/<etiqueta>/*.png
 *
 * Sin url base va contra producción. No llama a ninguna ruta de `/api`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = createRequire(join(RAIZ, "apps/web/package.json"))("@playwright/test");
const etiqueta = process.argv[2] ?? "antes";
const BASE = (process.argv[3] ?? "https://croquis-sage.vercel.app").replace(/\/$/, "");
const DIR = join(RAIZ, "docs/cesvi/logo", etiqueta);
mkdirSync(DIR, { recursive: true });

const PAGINAS = [
  ["portada", "/"],
  ["app-inicio", "/cesvi"],
  ["app-caso-axa", "/cesvi/casos/a2010930"],
  ["app-reproduccion", "/cesvi/reproduccion"],
];
const informe = { etiqueta, base: BASE, fecha: new Date().toISOString(), paginas: [] };

const navegador = await chromium.launch();
try {
  for (const tema of ["oscuro", "claro"]) {
    const contexto = await navegador.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: tema === "claro" ? "light" : "dark",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    // El tema de la app se guarda por modo; la portada no tiene tema claro.
    await contexto.addInitScript((t) => {
      try {
        localStorage.setItem("croquis.cesvi.tema.trabajar", t);
        localStorage.setItem("croquis.cesvi.tema.presentar", t);
      } catch {
        /* sin almacenamiento */
      }
    }, tema);
    for (const [nombre, ruta] of PAGINAS) {
      if (tema === "claro" && nombre === "portada") continue;
      const page = await contexto.newPage();
      await page.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForTimeout(nombre === "portada" ? 6000 : 3500);
      // Qué se usa de logo: los <img> de la marca y los textos «Croquis» de la cabecera.
      const marca = await page.evaluate(() => ({
        imagenes: [...document.querySelectorAll('img[src*="/marca/"]')].map((i) => ({
          src: new URL(i.src).pathname,
          ancho: Math.round(i.getBoundingClientRect().width),
        })),
        texto: [...document.querySelectorAll(".wordmark, .intro-word")].map((e) =>
          (e.textContent ?? "").trim(),
        ),
        iconos: [
          ...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'),
        ].map((l) => new URL(l.href).pathname),
      }));
      const archivo = `${nombre}-${tema}.png`;
      await page.screenshot({
        path: join(DIR, archivo),
        clip: { x: 0, y: 0, width: 1440, height: 150 },
      });
      informe.paginas.push({ nombre, ruta, tema, archivo, ...marca });
      await page.close();
    }
    await contexto.close();
  }
  // Las transiciones y la apertura: el logo animado. Con movimiento (sin «reducir movimiento»),
  // varias capturas a media animación.
  {
    const contexto = await navegador.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: "dark",
      serviceWorkers: "block",
    });
    const page = await contexto.newPage();
    const centro = { x: 320, y: 120, width: 800, height: 620 };
    // Las capturas se cuentan desde que la animación está en pantalla, no desde el clic: así los
    // instantes son comparables entre producción y el servidor local.
    const rafaga = async (nombre, instantes, selector = '[data-testid="transicion-acto"]') => {
      await page
        .waitForSelector(selector, { state: "attached", timeout: 30_000 })
        .catch(() => null);
      const t0 = Date.now();
      for (const ms of instantes) {
        const falta = ms - (Date.now() - t0);
        if (falta > 0) await page.waitForTimeout(falta);
        await page.screenshot({
          path: join(DIR, `transicion-${nombre}-${ms}ms.png`),
          clip: centro,
        });
      }
    };
    // La apertura de la portada.
    await page.goto(BASE + "/", { waitUntil: "commit", timeout: 120_000 });
    await rafaga("portada-apertura", [900, 1700, 2500], "#intro .intro-word");
    // Entrar a un caso: la transición completa.
    await page.goto(BASE + "/cesvi", { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(3000);
    await page.getByTestId("ir-axa").click();
    await rafaga("entrar-al-caso", [150, 450, 750, 1050]);
    await page.waitForTimeout(2500);
    // Entre actos: la corta.
    await page.getByTestId("siguiente").click();
    await rafaga("entre-actos", [40, 160, 300]);
    await page.waitForTimeout(2000);
    // Al presentar.
    await page.getByTestId("modo-presentar").click();
    await rafaga("presentar", [150, 450, 750, 1050]);
    informe.transiciones = await page.evaluate(() => ({
      monta: !!document.querySelector('[data-testid="transicion-acto"]'),
    }));
    await contexto.close();
  }
  // Los archivos de la marca tal cual, sobre su fondo.
  const contexto = await navegador.newContext({ viewport: { width: 900, height: 300 } });
  const page = await contexto.newPage();
  for (const [archivo, fondo] of [
    ["logotipo.svg", "#0B0C0F"],
    ["logotipo-sobre-claro.svg", "#F4F2EC"],
    ["simbolo.svg", "#0B0C0F"],
    ["favicon.svg", "#0B0C0F"],
  ]) {
    await page.setContent(
      `<body style="margin:0;background:${fondo};display:grid;place-items:center;height:300px">` +
        `<img src="${BASE}/marca/${archivo}" style="max-width:760px;height:${archivo.startsWith("logotipo") ? "auto" : "200px"}"></body>`,
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(DIR, `archivo-${archivo.replace(".svg", "")}.png`) });
  }
  await contexto.close();
} finally {
  await navegador.close();
}
writeFileSync(join(DIR, "informe.json"), `${JSON.stringify(informe, null, 2)}\n`);
console.log(
  JSON.stringify(
    informe.paginas.map((p) => [p.nombre, p.tema, p.imagenes, p.texto]),
    null,
    1,
  ),
);
