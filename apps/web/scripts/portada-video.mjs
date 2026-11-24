/**
 * El video del inicio de la portada: un fragmento del tráiler, sin audio y en bucle (René, 2026-11-24).
 * Lo corta y comprime, saca su póster, lo sube a Vercel Blob (nunca al repositorio) y anota su URL en
 * `video.json`, que es lo que lo activa. Solo lo piden las pantallas anchas sin movimiento reducido.
 *
 *   RECURSOS_READ_WRITE_TOKEN=… node scripts/portada-video.mjs <tráiler.mp4> <inicio_s> <duración_s>
 *
 * Sin el token solo deja el archivo en `.cache/portada/` para revisarlo.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ = resolve(WEB, "../..");
const CACHE = join(RAIZ, ".cache/portada");
const TOPE = 3 * 1024 * 1024;
const [trailer, inicio, duracion] = process.argv.slice(2);
if (!trailer || !(Number(duracion) >= 5 && Number(duracion) <= 8)) {
  console.error(
    "Uso: node scripts/portada-video.mjs <tráiler.mp4> <inicio_s> <duración_s, de 5 a 8>",
  );
  process.exit(2);
}
mkdirSync(CACHE, { recursive: true });
const mp4 = join(CACHE, "inicio.mp4");
const png = join(CACHE, "inicio.png");
// El ffmpeg que ya trae Remotion (apps/trailer).
const ffmpeg = (...args) => {
  const r = spawnSync(
    "pnpm",
    ["--filter", "@croquis/trailer", "exec", "remotion", "ffmpeg", "-y", ...args],
    { cwd: RAIZ, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
};
const origen = resolve(trailer);
ffmpeg(
  ...["-ss", inicio, "-t", duracion, "-i", origen, "-an", "-vf", "scale=1600:-2"],
  ...["-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p"],
  ...["-movflags", "+faststart", mp4],
);
ffmpeg("-i", mp4, "-frames:v", "1", png);
const bytes = statSync(mp4).size;
if (bytes > TOPE) throw new Error(`El video pesa ${bytes} bytes: más de 3 MB.`);
console.log(`${mp4}: ${Math.round(bytes / 1024)} KB`);

const token = process.env.RECURSOS_READ_WRITE_TOKEN;
if (!token) {
  console.log("Sin RECURSOS_READ_WRITE_TOKEN: no se subió ni se activó.");
  process.exit(0);
}
// El póster es el primer cuadro, en los mismos formatos que las demás imágenes.
const sharp = createRequire(createRequire(join(WEB, "package.json")).resolve("next/package.json"))(
  "sharp",
);
const IMAGENES = join(WEB, "src/components/portada-v3/imagenes.json");
const medidas = JSON.parse(readFileSync(IMAGENES, "utf8"));
const meta = await sharp(png).metadata();
medidas.inicio = {
  w: 1800,
  h: Math.round((1800 * meta.height) / meta.width),
  anchos: [480, 720, 1800],
};
for (const ancho of medidas.inicio.anchos) {
  const ruta = join(WEB, `public/portada/app/inicio-${ancho}`);
  await sharp(png).resize(ancho).avif({ quality: 46, effort: 6 }).toFile(`${ruta}.avif`);
  await sharp(png).resize(ancho).webp({ quality: 64, effort: 6 }).toFile(`${ruta}.webp`);
}
const { put } = await import("@vercel/blob");
const cuerpo = readFileSync(mp4);
const huella = createHash("sha256").update(cuerpo).digest("hex").slice(0, 16);
const r = await put(`recursos/portada/${huella}.mp4`, cuerpo, {
  access: "public",
  token,
  addRandomSuffix: false,
  allowOverwrite: false,
  cacheControlMaxAge: 365 * 24 * 3600,
  contentType: "video/mp4",
});
writeFileSync(IMAGENES, `${JSON.stringify(medidas, null, 2)}\n`);
writeFileSync(
  join(WEB, "src/components/portada-v3/video.json"),
  `${JSON.stringify({ url: r.url }, null, 2)}\n`,
);
console.log(r.url);
