/**
 * Monta el video demo: la grabación (salida/recorrido.webm) con la voz de cada segmento puesta donde
 * empezó (salida/linea-de-tiempo.json), en MP4 H.264 y AAC. Escribe también los subtítulos .srt con
 * el mismo texto de la voz. Sin música.
 *
 * Uso: node demo/video/montar.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FFMPEG, FFPROBE, SALIDA, VIDEO_FINAL } from "./comun.mjs";

const linea = JSON.parse(readFileSync(join(SALIDA, "linea-de-tiempo.json"), "utf8"));
const voz = new Map(
  JSON.parse(readFileSync(join(SALIDA, "voz.json"), "utf8")).map((v) => [v.id, v]),
);
const video = join(SALIDA, "recorrido.webm");

// Audio: cada WAV con su retraso, mezclados sin normalizar (no se encimen: la grabación espera).
const entradas = ["-i", video];
const filtros = [];
linea.segmentos.forEach((s, k) => {
  entradas.push("-i", voz.get(s.id).wav);
  const ms = Math.round(s.inicio_s * 1000);
  filtros.push(`[${k + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${k}]`);
});
filtros.push(
  `${linea.segmentos.map((_, k) => `[a${k}]`).join("")}amix=inputs=${linea.segmentos.length}:normalize=0:dropout_transition=0,apad[voz]`,
);
execFileSync(
  FFMPEG,
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...entradas,
    "-filter_complex",
    filtros.join(";"),
    "-map",
    "0:v",
    "-map",
    "[voz]",
    "-shortest",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    VIDEO_FINAL,
  ],
  { stdio: "inherit" },
);

// Subtítulos: el texto de cada segmento en frases, con el tiempo repartido por su largo.
const hhmmss = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const cues = [];
for (const s of linea.segmentos) {
  const frases = s.texto
    .match(/[^.!?:]+[.!?:]?/g)
    .map((f) => f.trim())
    .filter(Boolean);
  const total = frases.reduce((a, f) => a + f.length, 0);
  let t = s.inicio_s;
  for (const f of frases) {
    const d = (s.duracion_s * f.length) / total;
    cues.push({ desde: t, hasta: t + d, texto: f });
    t += d;
  }
}
writeFileSync(
  VIDEO_FINAL.replace(/\.mp4$/, ".srt"),
  cues
    .map((c, k) => `${k + 1}\n${hhmmss(c.desde)} --> ${hhmmss(c.hasta)}\n${c.texto}\n`)
    .join("\n"),
);

const duracion = Number(
  execFileSync(
    FFPROBE,
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", VIDEO_FINAL],
    {
      encoding: "utf8",
    },
  ).trim(),
);
const mb = statSync(VIDEO_FINAL).size / 1e6;
console.log(`${VIDEO_FINAL}: ${(duracion / 60).toFixed(2)} min, ${mb.toFixed(1)} MB`);
