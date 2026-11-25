/**
 * El video del inicio de la portada: un fragmento del tráiler, sin audio y en bucle (René, 2026-11-24).
 * Lo corta y comprime, lo sube a Vercel Blob (nunca al repositorio) y anota su URL en `video.json`, que
 * es lo que lo activa. Solo lo piden las pantallas anchas sin movimiento reducido; el póster es la foto
 * fija de la portada, que no se toca.
 *
 *   RECURSOS_READ_WRITE_TOKEN=… node apps/web/scripts/portada-video.mjs <tráiler.mp4> <inicio_s> <duración_s>
 *
 * Sin el token solo deja el archivo en `.cache/portada/` para revisarlo. Corre en Windows y en macOS.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ = resolve(WEB, "../..");
const TOPE = 3 * 1024 * 1024;
const [trailer, inicio, duracion] = process.argv.slice(2);
if (!trailer || !(Number(inicio) >= 0) || !(Number(duracion) >= 5 && Number(duracion) <= 8)) {
  console.error(
    "Uso: node apps/web/scripts/portada-video.mjs <tráiler.mp4> <inicio_s> <duración_s, de 5 a 8>",
  );
  process.exit(2);
}
const cache = join(RAIZ, ".cache/portada");
mkdirSync(cache, { recursive: true });
const mp4 = join(cache, "inicio.mp4");
// El ffmpeg que ya trae Remotion (apps/trailer), llamado con Node: en Windows `pnpm` no es un .exe.
const paquete = createRequire(join(RAIZ, "apps/trailer/package.json")).resolve(
  "@remotion/cli/package.json",
);
const r = spawnSync(
  process.execPath,
  [
    ...[join(dirname(paquete), "remotion-cli.js"), "ffmpeg", "-y"],
    ...["-ss", inicio, "-t", duracion, "-i", resolve(trailer), "-an", "-vf", "scale=1600:-2"],
    ...["-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p"],
    ...["-movflags", "+faststart", mp4],
  ],
  { cwd: join(RAIZ, "apps/trailer"), encoding: "utf8" },
);
if (r.status !== 0) throw new Error(r.stderr || String(r.error));
const bytes = statSync(mp4).size;
if (bytes > TOPE) throw new Error(`El video pesa ${bytes} bytes: más de 3 MB.`);
console.log(`${mp4}: ${Math.round(bytes / 1024)} KB`);

const token = process.env.RECURSOS_READ_WRITE_TOKEN;
if (!token) {
  console.log("Sin RECURSOS_READ_WRITE_TOKEN: no se subió ni se activó.");
  process.exit(0);
}
const { put } = await import("@vercel/blob");
const cuerpo = readFileSync(mp4);
const huella = createHash("sha256").update(cuerpo).digest("hex").slice(0, 16);
const { url } = await put(`recursos/portada/${huella}.mp4`, cuerpo, {
  access: "public",
  token,
  addRandomSuffix: false,
  allowOverwrite: true, // el nombre es la huella: es el mismo archivo
  cacheControlMaxAge: 365 * 24 * 3600,
  contentType: "video/mp4",
});
writeFileSync(
  join(WEB, "src/components/portada-v3/video.json"),
  `${JSON.stringify({ url }, null, 2)}\n`,
);
console.log(url);
