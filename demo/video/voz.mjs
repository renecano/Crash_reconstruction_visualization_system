/**
 * La voz del video demo: un WAV por segmento del guion y su duración medida con ffprobe →
 * salida/voz.json. La grabación espera cada segmento el tiempo de su voz, y el montaje coloca cada
 * WAV donde empezó su segmento.
 *
 * La voz se elige con CROQUIS_VOZ (ver assets/ASSETS.md y eval/results/voz_video.json):
 *   kokoro:ef_dora               Kokoro-82M, acento es-419 (por omisión)
 *   piper                        Piper, es_MX-claude-high (la del primer video)
 *   azure:es-MX-DaliaNeural      voz de catálogo de Azure; pide AZURE_SPEECH_KEY y
 *                                AZURE_SPEECH_REGION en .env.local
 *
 * Uso: node demo/video/voz.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AQUI,
  FFPROBE,
  KOKORO_PYTHON,
  PIPER,
  PIPER_VOZ,
  RAIZ,
  SALIDA,
  segmentosDelGuion,
} from "./comun.mjs";

const VOZ = process.env.CROQUIS_VOZ ?? "kokoro:ef_dora";
const [motor, nombre] = VOZ.split(":");
const dir = join(SALIDA, "voz");
mkdirSync(dir, { recursive: true });
const segmentos = segmentosDelGuion();

/** Las variables de .env.local que no estén ya en el entorno (solo las de Azure). */
function envLocal(clave) {
  if (process.env[clave]) return process.env[clave];
  const archivo = join(RAIZ, ".env.local");
  if (!existsSync(archivo)) return undefined;
  const linea = readFileSync(archivo, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${clave}=`));
  return linea?.slice(clave.length + 1).replace(/^["']|["']$/g, "");
}

const xml = (t) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

if (motor === "piper") {
  for (const { id, texto } of segmentos) {
    const r = spawnSync(PIPER, ["-m", PIPER_VOZ, "-f", join(dir, `${id}.wav`)], {
      input: texto,
      encoding: "utf8",
      // Sin PYTHONUTF8, Piper lee la entrada como ANSI en Windows y dice «narraci-A tilde…».
      env: { ...process.env, PYTHONUTF8: "1" },
    });
    if (r.status !== 0) throw new Error(`Piper falló en «${id}»: ${r.stderr}`);
  }
} else if (motor === "kokoro") {
  const r = spawnSync(KOKORO_PYTHON, ["-I", "-X", "utf8", join(AQUI, "kokoro.py")], {
    input: JSON.stringify({ carpeta: dir, voz: nombre, segmentos }),
    encoding: "utf8",
    stdio: ["pipe", "inherit", "pipe"],
  });
  if (r.status !== 0) throw new Error(`Kokoro falló: ${r.stderr}`);
} else if (motor === "azure") {
  const llave = envLocal("AZURE_SPEECH_KEY");
  const region = envLocal("AZURE_SPEECH_REGION");
  if (!llave || !region) throw new Error("Faltan AZURE_SPEECH_KEY y AZURE_SPEECH_REGION");
  for (const { id, texto } of segmentos) {
    // REST de texto a voz: https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": llave,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "croquis-video-demo",
      },
      body: `<speak version="1.0" xml:lang="es-MX"><voice name="${nombre}">${xml(texto)}</voice></speak>`,
    });
    if (!res.ok) throw new Error(`Azure respondió ${res.status} en «${id}»`);
    writeFileSync(join(dir, `${id}.wav`), Buffer.from(await res.arrayBuffer()));
  }
} else {
  throw new Error(`CROQUIS_VOZ desconocida: ${VOZ}`);
}

const voz = segmentos.map(({ id, texto }) => {
  const wav = join(dir, `${id}.wav`);
  const duracion = Number(
    execFileSync(
      FFPROBE,
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav],
      { encoding: "utf8" },
    ).trim(),
  );
  console.log(`${id}: ${duracion.toFixed(2)} s`);
  return { id, texto, wav, duracion_s: Number(duracion.toFixed(3)) };
});
writeFileSync(join(SALIDA, "voz.json"), `${JSON.stringify(voz, null, 2)}\n`);
console.log(
  `Voz ${VOZ}: ${voz.reduce((a, v) => a + v.duracion_s, 0).toFixed(1)} s en ${voz.length} segmentos`,
);
