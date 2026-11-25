/**
 * Las imágenes de la portada: capturas reales de la app (`e2e/capturas-portada.spec.ts`, ejemplos
 * inventados) en AVIF con respaldo WebP, en dos anchos, y `imagenes.json` con lo que mide cada una. El
 * service worker no las precarga (`serwist/[path]/route.ts`): solo las baja quien llega a verlas.
 *
 *   node scripts/portada-capturas.mjs <capturas> <portada-4k> <cuadro-trailer>
 *
 * - `<capturas>`: `claro/` y `oscuro/` de «alcance-deformacion»;
 * - `<portada-4k>`: `croquis-promo-v3/sin-logo/01-portada.jpg` (3840×2160, render del tráiler con el
 *   3D de Croquis; René, 2026-11-25), la foto del inicio;
 * - `<cuadro-trailer>`: el cuadro de 15.5 s de `croquis-trailer-3840x2160.mp4` (sin texto), el
 *   póster del tráiler: `ffmpeg -ss 15.5 -i croquis-trailer-3840x2160.mp4 -frames:v 1 cuadro.png`.
 *
 * Los recortes dejan fuera toda cifra de la reconstrucción (velocidades, rangos, energía y Δv).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desdeNext = createRequire(
  createRequire(join(WEB, "package.json")).resolve("next/package.json"),
);
const sharp = desdeNext("sharp");
const OUT = join(WEB, "public/portada/app");
const [base, portada4k, cuadroTrailer] = process.argv.slice(2);
/** Píxeles de la captura por píxel de CSS. */
const DPR = 3;

// Recortes: [x, y, ancho, alto] en px de CSS de la captura (1440×900); sin recorte, entera.
const IMAGENES = {
  hecho: ["1-hecho"],
  escena: ["2-escena"],
  // El 3D a pantalla completa, sin el panel de la velocidad.
  reconstruccion: ["3-reconstruccion-completa"],
  versiones: ["4-versiones"],
  // El perfil medido, sin la energía ni el Δv de abajo.
  analisis: ["5-analisis", [0, 84, 958, 488]],
  "detalle-rango": ["5-supuestos", [0, 0, 446, 293]],
  "detalle-cita": ["1-hecho", [14, 160, 960, 632]],
  "detalle-supuestos": ["5-analisis", [968, 356, 456, 270]],
  "detalle-dictamen": ["6-dictamen", [962, 96, 464, 278]],
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const medidas = {};

/** Cada imagen en dos anchos y dos formatos. */
async function guardar(nombre, img, anchos, calidad, avif = { effort: 6 }, webp = calidad + 18) {
  for (const ancho of anchos) {
    const x = img.clone().resize(ancho);
    await x
      .clone()
      .avif({ quality: calidad, ...avif })
      .toFile(join(OUT, `${nombre}-${ancho}.avif`));
    await x
      .clone()
      .webp({ quality: webp, effort: 6 })
      .toFile(join(OUT, `${nombre}-${ancho}.webp`));
  }
}

for (const [nombre, [archivo, recorte]] of Object.entries(IMAGENES)) {
  for (const tema of ["claro", "oscuro"]) {
    let img = sharp(join(base, tema, `${archivo}.png`));
    const { width, height } = await img.metadata();
    const [x, y, w, h] = recorte?.map((v) => v * DPR) ?? [0, 0, width, height];
    img = sharp(await img.extract({ left: x, top: y, width: w, height: h }).png().toBuffer());
    const anchos = w > 1600 ? [800, 1600] : [Math.round(w / 2), w];
    await guardar(`${nombre}-${tema}`, img, anchos, 52);
    medidas[nombre] = { w: anchos[1], h: Math.round((anchos[1] * h) / w), anchos };
  }
}
// Dos páginas del PDF del dictamen, sin cifras de la reconstrucción (lo revisa el spec), sobre el
// fondo suave de la app (`lab-dia-soft` y `lab-noche-soft`).
for (const [tema, fondo] of [
  ["claro", "#ECEEF1"],
  ["oscuro", "#1E2B47"],
]) {
  const paginas = await Promise.all(
    [1, 4].map((p) =>
      sharp(join(base, `claro/6-pdf-${p}.png`))
        .resize(748)
        .png()
        .toBuffer(),
    ),
  );
  const { height } = await sharp(paginas[0]).metadata();
  const hoja = { w: 1600, h: height + 72 };
  const img = sharp(
    await sharp({ create: { width: hoja.w, height: hoja.h, channels: 3, background: fondo } })
      .composite(paginas.map((input, k) => ({ input, left: 36 + k * 780, top: 36 })))
      .png()
      .toBuffer(),
  );
  await guardar(`dictamen-${tema}`, img, [800, 1600], 56);
  medidas.dictamen = { ...hoja, anchos: [800, 1600] };
}
// La foto 4K sin la leyenda de abajo (los últimos 120 px): la portada la escribe como texto. Una foto
// con mucho detalle fino: con calidad 24, esfuerzo 9 y color 4:2:0 el AVIF de 2560 pesa 52 KB y no se
// distingue de calidad 46 (133 KB) en el frente del choque.
const ALTO_SIN_LEYENDA = 2040;
const foto = sharp(
  await sharp(portada4k)
    .extract({ left: 0, top: 0, width: 3840, height: ALTO_SIN_LEYENDA })
    .toBuffer(),
);
const anchos = [640, 960, 1280, 1600, 2048, 2560];
await guardar("inicio", foto, anchos, 24, { effort: 9, chromaSubsampling: "4:2:0" }, 62);
medidas.inicio = { w: 2560, h: Math.round((2560 * ALTO_SIN_LEYENDA) / 3840), anchos };
// El póster del tráiler: se pide solo al acercarse (loading="lazy").
await guardar(
  "trailer-poster",
  sharp(cuadroTrailer),
  [960, 1280, 1920],
  26,
  {
    effort: 9,
    chromaSubsampling: "4:2:0",
  },
  66,
);
writeFileSync(
  join(WEB, "src/components/portada-v3/imagenes.json"),
  `${JSON.stringify(medidas, null, 2).replace(/\[\s+([\d,\s]+?)\s+\]/g, (_, n) => `[${n.replace(/\s+/g, " ")}]`)}\n`,
);
