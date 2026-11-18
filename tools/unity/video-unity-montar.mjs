#!/usr/bin/env node
/**
 * Monta el video de Unity (René, 2026-11-17) con los cuadros que dibujó el visor de escritorio
 * (`video-unity.mjs` hace el plan): H.264 en MP4, con cortes limpios entre cámaras, la tarjeta del
 * logo al abrir y al cerrar, y el reposo final sostenido. Sin música. El logo de la esquina y la
 * leyenda ilustrativa ya vienen en cada cuadro (los dibuja el visor).
 *
 * Usa el ffmpeg que trae Remotion (`apps/trailer`): no hay que instalar nada más.
 *
 *   node tools/unity/video-unity-montar.mjs --paquete <carpeta del plan> --cuadros <carpeta> --salida <carpeta>
 *        [--caso <nombre>]   solo ese caso, en cuanto tiene todos sus cuadros (después se borran)
 *        [--combinar]        solo los videos de dos casos, a partir de los MP4 de cada caso
 *
 * Deja, por caso, `croquis-unity-<caso>[-SOLO-CESVI]-4k.mp4` y `-1080p.mp4`, y los dos videos que
 * juntan dos casos: el de CESVI (AXA y el lateral) y el público (el alcance inventado y el lateral).
 * Si los cuadros son de 1080p (la prueba), solo sale la versión de 1080p.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const opcion = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const PAQUETE = resolve(opcion("paquete", "."));
const CUADROS = resolve(opcion("cuadros", PAQUETE));
const SALIDA = resolve(opcion("salida", "."));
mkdirSync(SALIDA, { recursive: true });

/** El ffmpeg de Remotion (Windows x64 en la RTX y en la laptop de René). */
function ffmpeg() {
  if (process.env.CROQUIS_FFMPEG) return process.env.CROQUIS_FFMPEG;
  // El compositor (con ffmpeg) es dependencia de @remotion/renderer, que es la del tráiler.
  const req = createRequire(
    createRequire(join(RAIZ, "apps/trailer/package.json")).resolve("@remotion/renderer"),
  );
  const paquete = `@remotion/compositor-${process.platform}-${process.arch}${process.platform === "win32" ? "-msvc" : process.platform === "linux" ? "-gnu" : ""}`;
  const dir = dirname(req.resolve(paquete));
  return join(dir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
}
const FFMPEG = ffmpeg();

const montaje = JSON.parse(readFileSync(join(PAQUETE, "video-montaje.json"), "utf8"));
const { fps, ancho, alto } = montaje;
const TARJETA = join(PAQUETE, "video-tarjeta.jpg");
/** Segundos de la tarjeta al abrir y al cerrar, y del reposo final sostenido. */
const ABRE = 2;
const CIERRA = 3;
const REPOSO = 2;

const ruta = (p) => p.replaceAll("\\", "/").replaceAll("'", "'\\''");

/** Las líneas del concat de ffmpeg para un caso: sus cuadros, con el último sostenido. */
function lineasDe(caso) {
  const out = [];
  let ultimo = null;
  for (const t of caso.tomas) {
    for (let k = 1; k <= t.cuadros; k++) {
      const f = join(CUADROS, `${caso.nombre}_${t.toma}_${String(k).padStart(5, "0")}.jpg`);
      if (!existsSync(f)) throw new Error(`Falta el cuadro ${f}: la corrida no terminó.`);
      out.push(`file '${ruta(f)}'`, `duration ${(1 / fps).toFixed(6)}`);
      ultimo = f;
    }
  }
  // El reposo final: el último cuadro, sostenido.
  out.push(`file '${ruta(ultimo)}'`, `duration ${REPOSO}`);
  return out;
}

/** Las resoluciones que salen: 4K y 1080p si los cuadros son 4K; si no, solo 1080p (la prueba). */
const SALIDAS =
  alto >= 2160
    ? [
        ["4k", 3840, 2160, 18],
        ["1080p", 1920, 1080, 20],
      ]
    : [["1080p", 1920, 1080, 20]];

function ffmpegA(txt, mp4, w, h, crf, segundos) {
  const r = spawnSync(
    FFMPEG,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      txt,
      "-vf",
      `scale=${w}:${h}:flags=lanczos,format=yuv420p`,
      "-r",
      String(fps),
      "-fps_mode",
      "cfr",
      // La duración exacta: la tarjeta final, repetida al cierre de la lista, se alargaba ~2 s.
      "-t",
      segundos.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      String(crf),
      "-profile:v",
      "high",
      "-movflags",
      "+faststart",
      "-an",
      mp4,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (r.status !== 0) throw new Error(`ffmpeg falló con ${mp4} (código ${r.status}).`);
}

/** Un caso: la tarjeta, sus cuadros con el reposo sostenido y la tarjeta otra vez. */
function codificar(nombre, casos) {
  const lista = ["ffconcat version 1.0", `file '${ruta(TARJETA)}'`, `duration ${ABRE}`];
  for (const c of casos) lista.push(...lineasDe(c));
  lista.push(`file '${ruta(TARJETA)}'`, `duration ${CIERRA}`);
  // ffmpeg quiere el último archivo repetido sin duración para respetar la del penúltimo.
  lista.push(`file '${ruta(TARJETA)}'`);
  const txt = join(SALIDA, `${nombre}.ffconcat`);
  writeFileSync(txt, `${lista.join("\n")}\n`);
  const hechos = [];
  for (const [etiqueta, w, h, crf] of SALIDAS) {
    const mp4 = join(SALIDA, `${nombre}-${etiqueta}.mp4`);
    ffmpegA(
      txt,
      mp4,
      w,
      h,
      crf,
      ABRE + casos.reduce((t, c) => t + duracionDe(c) - ABRE - CIERRA, 0) + CIERRA,
    );
    hechos.push({
      archivo: `${nombre}-${etiqueta}.mp4`,
      mb: Math.round(statSync(mp4).size / 1e5) / 10,
    });
    process.stdout.write(`  ${nombre}-${etiqueta}.mp4 (${hechos.at(-1).mb} MB)\n`);
  }
  return hechos;
}

/** Segundos de un video de un caso: tarjeta, cuadros, reposo y tarjeta. */
const duracionDe = (c) => ABRE + c.tomas.reduce((s, t) => s + t.cuadros, 0) / fps + REPOSO + CIERRA;

/**
 * Dos casos en un video, a partir de los MP4 de cada caso (sus cuadros ya se borraron): el primero
 * sin su tarjeta final y el segundo sin la inicial (`outpoint` / `inpoint` del concat: el ffmpeg de
 * Remotion no trae los filtros para recortar).
 */
function combinar(nombre, a, b) {
  const hechos = [];
  for (const [etiqueta, w, h, crf] of SALIDAS) {
    const ma = join(SALIDA, `${archivoDe(a)}-${etiqueta}.mp4`);
    const mb = join(SALIDA, `${archivoDe(b)}-${etiqueta}.mp4`);
    if (!existsSync(ma) || !existsSync(mb)) {
      process.stdout.write(`  ${nombre}-${etiqueta}: falta el video de un caso; no se junta.\n`);
      continue;
    }
    const txt = join(SALIDA, `${nombre}-${etiqueta}.ffconcat`);
    writeFileSync(
      txt,
      [
        "ffconcat version 1.0",
        `file '${ruta(ma)}'`,
        `outpoint ${(duracionDe(a) - CIERRA).toFixed(3)}`,
        `file '${ruta(mb)}'`,
        `inpoint ${ABRE.toFixed(3)}`,
        "",
      ].join("\n"),
    );
    const mp4 = join(SALIDA, `${nombre}-${etiqueta}.mp4`);
    ffmpegA(txt, mp4, w, h, crf, duracionDe(a) - CIERRA + duracionDe(b) - ABRE);
    hechos.push({
      archivo: `${nombre}-${etiqueta}.mp4`,
      mb: Math.round(statSync(mp4).size / 1e5) / 10,
    });
    process.stdout.write(`  ${nombre}-${etiqueta}.mp4 (${hechos.at(-1).mb} MB)\n`);
  }
  return hechos;
}

const porNombre = Object.fromEntries(montaje.casos.map((c) => [c.nombre, c]));
const archivoDe = (c) => `croquis-unity-${c.nombre}${c.publico ? "" : "-SOLO-CESVI"}`;
const soloCaso = opcion("caso", null);
const juntar = args.includes("--combinar");
if (soloCaso) {
  const c = porNombre[soloCaso];
  if (!c) throw new Error(`No hay un caso «${soloCaso}» en video-montaje.json.`);
  codificar(archivoDe(c), [c]);
} else if (juntar) {
  const lateral = porNombre["lateral-interseccion"];
  if (lateral && porNombre.axa)
    combinar("croquis-unity-dos-casos-SOLO-CESVI", porNombre.axa, lateral);
  if (lateral && porNombre["alcance-inventado"])
    combinar("croquis-unity-dos-casos-publico", porNombre["alcance-inventado"], lateral);
} else {
  // Todo de una vez, desde los cuadros (como antes).
  for (const c of montaje.casos) codificar(archivoDe(c), [c]);
  const lateral = porNombre["lateral-interseccion"];
  if (lateral && porNombre.axa)
    codificar("croquis-unity-dos-casos-SOLO-CESVI", [porNombre.axa, lateral]);
  if (lateral && porNombre["alcance-inventado"])
    codificar("croquis-unity-dos-casos-publico", [porNombre["alcance-inventado"], lateral]);
}

// El LEEME y el informe, con todos los videos que hay en la carpeta (de esta corrida o de antes).
const hechos = readdirSync(SALIDA)
  .filter((f) => f.endsWith(".mp4"))
  .sort()
  .map((f) => ({ archivo: f, mb: Math.round(statSync(join(SALIDA, f)).size / 1e5) / 10 }));
writeFileSync(
  join(SALIDA, "LEEME.txt"),
  [
    "Videos de Unity de Croquis (René, 2026-11-17). Sin música.",
    "",
    "- «SOLO-CESVI» lleva el caso de AXA: es solo para CESVI, no para uso público.",
    "- Los demás son escenas inventadas (el alcance y el lateral en intersección): de uso público.",
    "- Cada video: la tarjeta del logo, el caso completo con cuatro cámaras (llegada, detrás del",
    "  vehículo A con cámara lenta al final, el daño en el impacto en cámara lenta y cenital hasta el",
    "  reposo final) y la tarjeta otra vez. La leyenda ilustrativa va en cada cuadro.",
    "",
    ...hechos.map((h) => `${h.archivo}  ${h.mb} MB`),
    "",
  ].join("\r\n"),
);
writeFileSync(
  join(SALIDA, "video_unity.json"),
  `${JSON.stringify({ fps, ancho, alto, videos: hechos }, null, 2)}\n`,
);
