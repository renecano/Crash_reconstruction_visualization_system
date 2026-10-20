/**
 * Íconos de la marca (PLAN §11.2, ADR 0045), a partir de `assets/brand/favicon.svg` y
 * `assets/brand/app-icon.svg`, sin redibujarlos:
 *
 * - `public/iconos/icono-{16,32,48}.png` desde `favicon.svg` (trazos engrosados para tamaños
 *   chicos) y `icono-{180,192,512}.png` desde `app-icon.svg`;
 * - `icono-512-maskable.png`: el ícono de app sobre asfalto noche de borde a borde, para que el
 *   recorte del sistema (círculo de 80 %) no deje esquinas transparentes;
 * - `public/favicon.ico` con los PNG de 16, 32 y 48 (PNG dentro de ICO);
 * - `public/manifest.webmanifest`.
 *
 * Chromium (Playwright) rasteriza los SVG. Sus PNG pueden variar algunos bytes entre sistemas,
 * así que `--check` no compara bytes: comprueba tamaños y que el SHA-256 de los SVG de origen
 * sea el mismo con que se generaron (`public/iconos/fuente.json`).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = resolve(WEB, "..", "..", "assets", "brand");
const PUB = join(WEB, "public");
const OUT = join(PUB, "iconos");
const check = process.argv.includes("--check");

const tokens = JSON.parse(readFileSync(join(BRAND, "tokens.json"), "utf8"));
const FONDO = tokens.color["asfalto-noche"].value;

const FUENTES = ["favicon.svg", "app-icon.svg"];
const sha = (f) =>
  createHash("sha256")
    .update(readFileSync(join(BRAND, f)))
    .digest("hex");
const huella = Object.fromEntries(FUENTES.map((f) => [f, sha(f)]));

const PNGS = [
  { nombre: "icono-16.png", fuente: "favicon.svg", lado: 16 },
  { nombre: "icono-32.png", fuente: "favicon.svg", lado: 32 },
  { nombre: "icono-48.png", fuente: "favicon.svg", lado: 48 },
  { nombre: "icono-180.png", fuente: "app-icon.svg", lado: 180 },
  { nombre: "icono-192.png", fuente: "app-icon.svg", lado: 192 },
  { nombre: "icono-512.png", fuente: "app-icon.svg", lado: 512 },
  { nombre: "icono-512-maskable.png", fuente: "app-icon.svg", lado: 512, fondo: FONDO },
];

const manifiesto = {
  name: "Croquis",
  short_name: "Croquis",
  description:
    "Cuenta un percance vial con tus palabras y Croquis lo reconstruye en 3D con física real. Reconstrucción ilustrativa, no un peritaje.",
  lang: "es-MX",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: FONDO,
  theme_color: FONDO,
  icons: [
    { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: "/iconos/icono-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};
const manifiestoTexto = `${JSON.stringify(manifiesto, null, 2)}\n`;

/** Ancho y alto de un PNG (cabecera IHDR). */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** ICO con PNG dentro (válido desde Windows Vista y en todos los navegadores actuales). */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((p, i) => {
    const { w, h } = pngSize(p);
    const e = 6 + 16 * i;
    head.writeUInt8(w >= 256 ? 0 : w, e);
    head.writeUInt8(h >= 256 ? 0 : h, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(p.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += p.length;
  });
  return Buffer.concat([head, ...pngs]);
}

if (check) {
  const errores = [];
  let guardada = {};
  try {
    guardada = JSON.parse(readFileSync(join(OUT, "fuente.json"), "utf8"));
  } catch {
    errores.push("falta public/iconos/fuente.json");
  }
  for (const f of FUENTES) {
    if (guardada[f] !== huella[f]) errores.push(`${f} cambió desde que se generaron los íconos`);
  }
  for (const p of PNGS) {
    try {
      const { w, h } = pngSize(readFileSync(join(OUT, p.nombre)));
      if (w !== p.lado || h !== p.lado) errores.push(`${p.nombre} mide ${w}×${h}`);
    } catch {
      errores.push(`falta ${p.nombre}`);
    }
  }
  try {
    if (readFileSync(join(PUB, "manifest.webmanifest"), "utf8") !== manifiestoTexto) {
      errores.push("manifest.webmanifest desactualizado");
    }
    readFileSync(join(PUB, "favicon.ico"));
  } catch {
    errores.push("falta manifest.webmanifest o favicon.ico");
  }
  if (errores.length) {
    console.error(`Íconos desactualizados (corre \`pnpm iconos\`): ${errores.join("; ")}`);
    process.exit(1);
  }
  console.log(`Íconos al día: ${PNGS.length} PNG, favicon.ico y manifiesto.`);
} else {
  const { chromium } = createRequire(join(WEB, "package.json"))("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  mkdirSync(OUT, { recursive: true });
  const salida = {};
  for (const p of PNGS) {
    const svg = readFileSync(join(BRAND, p.fuente), "utf8");
    await page.setViewportSize({ width: p.lado, height: p.lado });
    const fondo = p.fondo ?? "transparent";
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:${fondo}">` +
        `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" ` +
        `width="${p.lado}" height="${p.lado}" style="display:block"></body></html>`,
    );
    await page.waitForFunction(() => document.images[0]?.complete);
    const buf = await page.screenshot({ omitBackground: !p.fondo, type: "png" });
    writeFileSync(join(OUT, p.nombre), buf);
    salida[p.nombre] = buf;
  }
  await browser.close();
  writeFileSync(
    join(PUB, "favicon.ico"),
    ico([salida["icono-16.png"], salida["icono-32.png"], salida["icono-48.png"]]),
  );
  writeFileSync(join(PUB, "manifest.webmanifest"), manifiestoTexto, "utf8");
  writeFileSync(join(OUT, "fuente.json"), `${JSON.stringify(huella, null, 2)}\n`, "utf8");
  console.log(`Escritos ${PNGS.length} PNG, favicon.ico y manifest.webmanifest.`);
}
