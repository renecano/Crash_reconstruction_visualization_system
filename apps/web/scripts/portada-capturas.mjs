/**
 * Las imágenes de la portada: capturas reales de la app (`e2e/capturas-portada.spec.ts`, ejemplos
 * inventados) en AVIF con respaldo WebP, en dos anchos, y `imagenes.json` con lo que mide cada una. El
 * service worker no las precarga (`serwist/[path]/route.ts`): solo las baja quien llega a verlas.
 *
 *   node scripts/portada-capturas.mjs <capturas> <capturas-inicio>
 *
 * - `<capturas>`: `claro/` y `oscuro/` de «alcance-deformacion»;
 * - `<capturas-inicio>`: `oscuro/` de «crucero-noche» (el 3D de noche, antes del impacto).
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
const [base, inicio] = process.argv.slice(2);
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
  // El formato y la firma, sin la hoja (lleva los resultados).
  dictamen: ["6-dictamen", [962, 420, 464, 434]],
  "detalle-rango": ["5-supuestos", [0, 0, 446, 293]],
  "detalle-cita": ["1-hecho", [14, 160, 960, 632]],
  "detalle-supuestos": ["5-analisis", [968, 356, 456, 270]],
  "detalle-dictamen": ["6-dictamen", [962, 96, 464, 278]],
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const medidas = {};

/** Cada imagen en dos anchos y dos formatos. */
async function guardar(nombre, img, anchos, calidad) {
  for (const ancho of anchos) {
    const x = img.clone().resize(ancho);
    await x
      .clone()
      .avif({ quality: calidad, effort: 6 })
      .toFile(join(OUT, `${nombre}-${ancho}.avif`));
    await x
      .clone()
      .webp({ quality: calidad + 18, effort: 6 })
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
// Sin la leyenda de la esquina: la portada la escribe como texto.
const foto = sharp(
  await sharp(join(inicio, "oscuro/3-antes-del-impacto.png"))
    .extract({ left: 900, top: 0, width: 3420, height: 2540 })
    .png()
    .toBuffer(),
);
// 760: lo que pide un celular de 412 px con densidad 1.75 (721); 1100, uno con densidad 2.6.
const anchos = [480, 760, 1100, 1800];
await guardar("inicio", foto, anchos, 46);
medidas.inicio = { w: 1800, h: Math.round((1800 * 2540) / 3420), anchos };
writeFileSync(
  join(WEB, "src/components/portada-v3/imagenes.json"),
  `${JSON.stringify(medidas, null, 2).replace(/\[\s+([\d,\s]+?)\s+\]/g, (_, n) => `[${n.replace(/\s+/g, " ")}]`)}\n`,
);
