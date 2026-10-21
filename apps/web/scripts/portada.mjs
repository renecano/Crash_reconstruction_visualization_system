/**
 * Cuadros fijos de la portada y la imagen para redes (PLAN §11.3 y §11.6, ADR 0045), renderizados
 * por el visor real a partir de la escena de Toluca; nada se dibuja a mano:
 *
 * - `public/portada/<capítulo>-ancho.jpg` (1920×1080) y `<capítulo>-alto.jpg` (860×1864): el cuadro
 *   que se ve antes de que cargue el 3D (la imagen LCP) y, con movimiento reducido o sin WebGL, en
 *   lugar del 3D. Uno por capítulo, con la misma cámara que el scroll (`components/portada/camara.ts`).
 * - `public/redes.png` (1200×630): `assets/brand/logotipo-efectos.svg` tal cual sobre un cuadro de la
 *   escena, con la leyenda de reconstrucción ilustrativa (PLAN §10).
 *
 * Necesita la app corriendo (`pnpm dev` o `pnpm start`): `node scripts/portada.mjs [--url URL]`.
 * Los JPEG dependen de la GPU y del sistema, así que `--check` no compara bytes: comprueba que estén
 * todos con sus medidas y que la escena, su resultado, la cámara y el logotipo sean los mismos con
 * que se generaron (`public/portada/fuente.json`).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ = resolve(WEB, "..", "..");
const PUB = join(WEB, "public");
const OUT = join(PUB, "portada");
const check = process.argv.includes("--check");
const iUrl = process.argv.indexOf("--url");
const URL_BASE = iUrl > 0 ? process.argv[iUrl + 1] : "http://localhost:3000";

const CAPITULOS = [
  "apertura",
  "problema",
  "c",
  "r",
  "o",
  "q",
  "u",
  "i",
  "s",
  "pruebas",
  "noes",
  "cierre",
];
const FORMATOS = [
  { sufijo: "ancho", viewport: { width: 1920, height: 1080 }, escala: 1, lado: [1920, 1080] },
  { sufijo: "alto", viewport: { width: 430, height: 932 }, escala: 2, lado: [860, 1864] },
];
const REDES = { capitulo: "q", lado: [1200, 630] };

const FUENTES = [
  "packages/scene-schema/fixtures/interseccion_toluca.json",
  "packages/scene-schema/fixtures/resultados/interseccion_toluca.json",
  "apps/web/src/components/portada/camara.ts",
  "assets/brand/logotipo-efectos.svg",
];
const huella = Object.fromEntries(
  FUENTES.map((f) => [
    f,
    createHash("sha256")
      .update(readFileSync(join(RAIZ, f), "utf8").replace(/\r\n/g, "\n"))
      .digest("hex"),
  ]),
);

/** Ancho y alto de un JPEG (primer marcador SOF). */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error("JPEG inválido");
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  throw new Error("JPEG sin SOF");
}
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

if (check) {
  const errores = [];
  let guardada = {};
  try {
    guardada = JSON.parse(readFileSync(join(OUT, "fuente.json"), "utf8"));
  } catch {
    errores.push("falta public/portada/fuente.json");
  }
  for (const f of FUENTES) {
    if (guardada[f] !== huella[f]) errores.push(`${f} cambió desde que se generaron los cuadros`);
  }
  for (const c of CAPITULOS) {
    for (const f of FORMATOS) {
      const nombre = `${c}-${f.sufijo}.jpg`;
      try {
        const { w, h } = jpegSize(readFileSync(join(OUT, nombre)));
        if (w !== f.lado[0] || h !== f.lado[1]) errores.push(`${nombre} mide ${w}×${h}`);
      } catch {
        errores.push(`falta ${nombre}`);
      }
    }
  }
  try {
    const { w, h } = pngSize(readFileSync(join(PUB, "redes.png")));
    if (w !== REDES.lado[0] || h !== REDES.lado[1]) errores.push(`redes.png mide ${w}×${h}`);
  } catch {
    errores.push("falta redes.png");
  }
  if (errores.length) {
    console.error(
      `Cuadros de la portada desactualizados (corre \`pnpm portada\`): ${errores.join("; ")}`,
    );
    process.exit(1);
  }
  console.log(
    `Cuadros de la portada al día: ${CAPITULOS.length * FORMATOS.length} JPEG y redes.png.`,
  );
} else {
  const { chromium } = createRequire(join(WEB, "package.json"))("@playwright/test");
  // La GPU de la máquina si la hay; si no, SwiftShader (más lento, mismo resultado).
  const browser = await chromium.launch({
    args: ["--ignore-gpu-blocklist", "--enable-gpu", "--enable-unsafe-swiftshader"],
  });
  mkdirSync(OUT, { recursive: true });

  /** Abre la portada en `calidad=media`, sin texto ni capas encima, con el 3D listo. */
  async function abrir(viewport, escala) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: escala });
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`${URL_BASE}/?calidad=media`, { waitUntil: "networkidle" });
    await page.addStyleTag({
      content: `header, footer, nav, [data-velo], [data-testid="portada"] .pagina, [role="note"],
        [data-testid="lecturas"], [data-testid="cuadro-portada"], .vidrio, nextjs-portal { display: none !important; }`,
    });
    await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 180000 });
    return { page, errores };
  }
  /** Lleva el scroll a la mitad del capítulo y espera a que la cámara (suavizada) llegue. */
  async function irA(page, capitulo) {
    const i = CAPITULOS.indexOf(capitulo);
    await page.evaluate((i) => window.scrollTo(0, (i + 0.5) * window.innerHeight * 1.5), i);
    // «Simula» calcula su hipótesis en el navegador al llegar: más tiempo.
    await page.waitForTimeout(capitulo === "s" ? 6000 : 3000);
  }

  for (const f of FORMATOS) {
    const { page, errores } = await abrir(f.viewport, f.escala);
    for (const c of CAPITULOS) {
      await irA(page, c);
      await page.screenshot({ path: join(OUT, `${c}-${f.sufijo}.jpg`), type: "jpeg", quality: 80 });
      console.log(`${c}-${f.sufijo}.jpg`);
    }
    if (errores.length) throw new Error(`Errores en la página: ${errores.join("; ")}`);
    await page.close();
  }

  // Imagen para redes: el logotipo con efectos, sin redibujar, sobre un cuadro real de la escena.
  const [w, h] = REDES.lado;
  const { page } = await abrir({ width: w, height: h }, 1);
  await irA(page, REDES.capitulo);
  const fondo = (await page.screenshot({ type: "png" })).toString("base64");
  await page.close();
  const logo = readFileSync(join(RAIZ, "assets/brand/logotipo-efectos.svg")).toString("base64");
  const fuente = readFileSync(
    join(
      WEB,
      "node_modules/@fontsource-variable/anybody/files/anybody-latin-standard-normal.woff2",
    ),
  ).toString("base64");
  const leyenda = "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje.";
  const comp = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await comp.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Anybody; src: url(data:font/woff2;base64,${fuente}) format("woff2"); font-weight: 100 900; font-stretch: 50% 150%; }
    html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: #0B0D0F; }
    .fondo { position: absolute; inset: 0; background: url(data:image/png;base64,${fondo}) center / cover; }
    .velo { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 60% at 50% 50%, rgba(11,13,15,.72), rgba(11,13,15,.25) 70%, rgba(11,13,15,.1)); }
    .logo { position: absolute; left: 50%; top: 46%; width: 660px; transform: translate(-50%, -50%); }
    .leyenda { position: absolute; left: 32px; bottom: 24px; font: 500 16px/1.3 Anybody; color: #B7BCC1; }
  </style></head><body><div class="fondo"></div><div class="velo"></div>
  <img class="logo" alt="" src="data:image/svg+xml;base64,${logo}"><p class="leyenda">${leyenda}</p></body></html>`);
  await comp.evaluate(() => document.fonts.ready);
  await comp.screenshot({ path: join(PUB, "redes.png"), type: "png" });
  await browser.close();

  writeFileSync(join(OUT, "fuente.json"), `${JSON.stringify(huella, null, 2)}\n`);
  console.log(`Listo: ${CAPITULOS.length * FORMATOS.length} cuadros y redes.png.`);
}
