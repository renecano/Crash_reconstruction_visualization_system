/**
 * Lo que comparten los scripts del video demo (`docs/cesvi/video/guion.md`): rutas, herramientas
 * y la lectura del guion. Las herramientas se instalan fuera del repositorio (ver PROGRESS):
 *   CROQUIS_FFMPEG_DIR  carpeta con ffmpeg y ffprobe
 *   CROQUIS_PIPER       ejecutable de Piper
 *   CROQUIS_PIPER_VOZ   modelo de voz (.onnx), es_MX-claude-high
 *   CROQUIS_KOKORO_PYTHON  Python con kokoro-onnx y soundfile (los modelos: CROQUIS_KOKORO_MODELOS)
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(AQUI, "../..");
export const SALIDA = join(AQUI, "salida");
export const VIDEO_FINAL = join(AQUI, "croquis-cesvi-demo.mp4");

const HERRAMIENTAS = "D:/dev-cache/tools";
export const FFMPEG_DIR =
  process.env.CROQUIS_FFMPEG_DIR ?? `${HERRAMIENTAS}/ffmpeg/ffmpeg-9.0.2-essentials_build/bin`;
export const FFMPEG = join(FFMPEG_DIR, "ffmpeg.exe");
export const FFPROBE = join(FFMPEG_DIR, "ffprobe.exe");
export const PIPER = process.env.CROQUIS_PIPER ?? `${HERRAMIENTAS}/piper-venv/Scripts/piper.exe`;
export const PIPER_VOZ =
  process.env.CROQUIS_PIPER_VOZ ?? `${HERRAMIENTAS}/piper-voices/es_MX-claude-high.onnx`;
export const KOKORO_PYTHON =
  process.env.CROQUIS_KOKORO_PYTHON ?? `${HERRAMIENTAS}/kokoro-venv/Scripts/python.exe`;

/** Los segmentos del guion: `## id` y el texto que sigue (sin las indicaciones `>`). */
export function segmentosDelGuion() {
  const md = readFileSync(join(RAIZ, "docs/cesvi/video/guion.md"), "utf8");
  const partes = md.split(/^## /m).slice(1);
  return partes.map((p) => {
    const [id, ...lineas] = p.split("\n");
    const texto = lineas
      .filter((l) => l.trim() && !l.startsWith(">"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return { id: id.trim(), texto };
  });
}
