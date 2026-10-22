/**
 * La voz del video demo: un WAV por segmento del guion con Piper (voz es_MX-claude-high, ver
 * assets/ASSETS.md) y su duración medida con ffprobe → salida/voz.json. La grabación espera cada
 * segmento el tiempo de su voz, y el montaje coloca cada WAV donde empezó su segmento.
 *
 * Uso: node demo/video/voz.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FFPROBE, PIPER, PIPER_VOZ, SALIDA, segmentosDelGuion } from "./comun.mjs";

const dir = join(SALIDA, "voz");
mkdirSync(dir, { recursive: true });
const voz = segmentosDelGuion().map(({ id, texto }) => {
  const wav = join(dir, `${id}.wav`);
  const r = spawnSync(PIPER, ["-m", PIPER_VOZ, "-f", wav], { input: texto, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Piper falló en «${id}»: ${r.stderr}`);
  const duracion = Number(
    execFileSync(
      FFPROBE,
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav],
      {
        encoding: "utf8",
      },
    ).trim(),
  );
  console.log(`${id}: ${duracion.toFixed(2)} s`);
  return { id, texto, wav, duracion_s: Number(duracion.toFixed(3)) };
});
writeFileSync(join(SALIDA, "voz.json"), `${JSON.stringify(voz, null, 2)}\n`);
console.log(
  `Total de voz: ${voz.reduce((a, v) => a + v.duracion_s, 0).toFixed(1)} s en ${voz.length} segmentos`,
);
