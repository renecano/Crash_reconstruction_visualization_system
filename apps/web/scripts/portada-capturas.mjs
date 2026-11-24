/**
 * Las imágenes de la portada: capturas reales de la app (`e2e/capturas-portada.spec.ts`, casos de
 * ejemplo inventados) reducidas a AVIF. En AVIF y no en WebP para que el service worker no las
 * precargue (`serwist/[path]/route.ts`): solo las baja quien llega a verlas.
 *
 *   node scripts/portada-capturas.mjs <capturas> <capturas-analisis> <capturas-rango> <foto-inicio.png>
 *
 * - `<capturas>`: `claro/` y `oscuro/` de «poste-terraceria» (los seis pasos y los detalles);
 * - `<capturas-analisis>`: las de «alcance-deformacion» (Análisis, con la deformación medida);
 * - `<capturas-rango>`: las de «carambola-lluvia» (el detalle del rango);
 * - `<foto-inicio>`: `30-carambola-lluvia-3d-camara-lenta.png` del juego público (5120×2880).
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desdeNext = createRequire(
  createRequire(join(WEB, "package.json")).resolve("next/package.json"),
);
const sharp = desdeNext("sharp");
const OUT = join(WEB, "public/portada/app");
mkdirSync(OUT, { recursive: true });
const [base, analisis, rango, inicio] = process.argv.slice(2);
const avif = (img, nombre, quality = 52) =>
  img.avif({ quality, effort: 6 }).toFile(join(OUT, `${nombre}.avif`));

const PASOS = {
  hecho: [base, "1-hecho"],
  escena: [base, "2-escena"],
  reconstruccion: [base, "3-reconstruccion"],
  versiones: [base, "4-versiones-hipotesis"],
  analisis: [analisis, "5-analisis"],
  dictamen: [base, "6-dictamen"],
};
// Detalles: rectángulo [x, y, ancho, alto] en px de CSS de la captura (1440×900, al doble).
const DETALLES = {
  rango: [rango, "3-reconstruccion", [968, 150, 456, 318]],
  cita: [base, "1-hecho", [14, 160, 960, 670]],
  supuestos: [base, "5-analisis", [968, 88, 456, 318]],
  dictamen: [base, "6-dictamen", [962, 96, 464, 324]],
};
for (const tema of ["claro", "oscuro"]) {
  for (const [paso, [dir, f]] of Object.entries(PASOS))
    for (const ancho of [800, 1600])
      await avif(sharp(join(dir, tema, `${f}.png`)).resize(ancho), `${paso}-${tema}-${ancho}`);
  for (const [d, [dir, f, [x, y, w, h]]] of Object.entries(DETALLES))
    await avif(
      sharp(join(dir, tema, `${f}.png`))
        .extract({ left: x * 2, top: y * 2, width: w * 2, height: h * 2 })
        .resize(Math.min(1000, w * 2)),
      `detalle-${d}-${tema}`,
    );
}
// El inicio: el 3D de noche con lluvia, sin los controles ni el minimapa.
for (const ancho of [900, 1800])
  await avif(
    sharp(inicio).extract({ left: 1000, top: 290, width: 2900, height: 1690 }).resize(ancho),
    `inicio-${ancho}`,
    48,
  );
