#!/usr/bin/env node
/**
 * Render de una composición del tráiler con Remotion (René, 2026-11-16). Los videos, las tomas del 3D
 * y la música van en `trailer-salida/`, en la raíz del repo, que git ignora completa
 * (`CROQUIS_TRAILER` para otra carpeta); la
 * medición de cada render, en `eval/results/trailer_render.json`.
 *
 *   node render.mjs Trailer                    el tráiler a 1920×1080
 *   node render.mjs Trailer4K                  a 3840×2160
 *   node render.mjs TrailerVertical            a 1080×1920
 *   node render.mjs Trailer --cuadros 30,240   solo esos cuadros, en PNG (para revisar)
 *   node render.mjs Trailer --previo           acepta las tomas de prueba de `tomas/previo/`
 *   node render.mjs Prueba                     la prueba técnica del pipeline
 *
 * La carpeta `tomas/` es la carpeta pública del bundle. Cada hueco del tráiler (`src/tomas.tsx`) se
 * llena con una secuencia (`tomas/<hueco>/0001.png`… o `tomas/<hueco>_0001.png`…, como las entrega
 * `tools/colaborador/desde-release.ps1 -Paso trailer`) o una foto (`tomas/<hueco>.png`); con
 * `--previo`, también con `tomas/previo/<hueco>.png`. Un hueco sin toma no se rellena con nada: la
 * escena de papel sigue, y el archivo sale con «-sin-3d» en el nombre para que no se confunda con el
 * tráiler terminado. La música es `musica/croquis-trailer.wav` (`node tools/trailer/musica.mjs`).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus, totalmem } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "../..");
const FUERA = process.env.CROQUIS_TRAILER ?? join(RAIZ, "trailer-salida");
const TOMAS = join(FUERA, "tomas");
const MUSICA = join(FUERA, "musica", "croquis-trailer.wav");
// Los modelos de los vehículos para la tinta (`node tools/trailer/modelos-tinta.mjs`).
const MODELOS = join(FUERA, "modelos");
// Los autos se dibujan con three.js: Chrome con ANGLE usa la tarjeta de video si la hay.
const chromiumOptions = { gl: "angle" };
const id = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "Prueba";
const opcion = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? (process.argv[i + 1] ?? "") : null;
};
const conPrevio = process.argv.includes("--previo");
const cuadros = opcion("cuadros")
  ?.split(",")
  .map(Number)
  .filter((n) => Number.isInteger(n));
mkdirSync(TOMAS, { recursive: true });

/** Los huecos del tráiler: los mismos de `src/tomas.tsx`. */
const HUECOS = ["heroe", "faros", "impacto", "aerea", "detalle-1", "detalle-2"];
const esImagen = (f) => /\.(png|jpe?g|webp)$/i.test(f);

/** Qué toma hay para cada hueco, y cuáles son solo de prueba. */
function tomasDisponibles() {
  const tomas = {};
  const dePrueba = [];
  for (const h of HUECOS) {
    const carpeta = join(TOMAS, h);
    if (existsSync(carpeta) && statSync(carpeta).isDirectory()) {
      const serie = readdirSync(carpeta).filter(esImagen).sort();
      if (serie.length) {
        tomas[h] = serie.map((f) => `${h}/${f}`);
        continue;
      }
    }
    // Como las entrega el modo foto del visor: `<hueco>_0001.png`, todas en la misma carpeta.
    const plana = readdirSync(TOMAS)
      .filter((f) => esImagen(f) && f.startsWith(`${h}_`))
      .sort();
    if (plana.length) {
      tomas[h] = plana;
      continue;
    }
    const foto = readdirSync(TOMAS).find((f) => esImagen(f) && f.replace(/\.[^.]+$/, "") === h);
    if (foto) {
      tomas[h] = [foto];
      continue;
    }
    const previo = join(TOMAS, "previo");
    const prueba =
      conPrevio && existsSync(previo)
        ? readdirSync(previo).find((f) => esImagen(f) && f.replace(/\.[^.]+$/, "") === h)
        : null;
    if (prueba) {
      tomas[h] = [`previo/${prueba}`];
      dePrueba.push(h);
    }
  }
  return { tomas, dePrueba };
}

const esTrailer = id.startsWith("Trailer");
const { tomas, dePrueba } = esTrailer ? tomasDisponibles() : { tomas: {}, dePrueba: [] };
const faltan = esTrailer ? HUECOS.filter((h) => !tomas[h]) : [];
const conMusica = esTrailer && existsSync(MUSICA);
// La toma de la prueba técnica: la primera que haya.
const tomaDePrueba = readdirSync(TOMAS).find(esImagen) ?? null;

const t0 = performance.now();
const servido = await bundle({ entryPoint: join(AQUI, "src/index.ts"), publicDir: TOMAS });
if (conMusica) copyFileSync(MUSICA, join(servido, "public", "croquis-trailer.wav"));
let modelos = null;
if (esTrailer && existsSync(join(MODELOS, "modelos.json"))) {
  modelos = JSON.parse(readFileSync(join(MODELOS, "modelos.json"), "utf8"));
  mkdirSync(join(servido, "public", "modelos"), { recursive: true });
  for (const m of Object.values(modelos))
    copyFileSync(join(FUERA, m.archivo), join(servido, "public", m.archivo));
}
const tBundle = performance.now() - t0;
const inputProps = esTrailer
  ? { tomas, musica: conMusica ? "croquis-trailer.wav" : null, modelos }
  : { toma3d: tomaDePrueba };
const composicion = await selectComposition({
  serveUrl: servido,
  id,
  inputProps,
  chromiumOptions,
});

if (cuadros?.length) {
  const carpeta = join(FUERA, "cuadros");
  mkdirSync(carpeta, { recursive: true });
  for (const n of cuadros) {
    const salida = join(carpeta, `${id.toLowerCase()}-${String(n).padStart(4, "0")}.png`);
    await renderStill({
      composition: composicion,
      serveUrl: servido,
      output: salida,
      frame: n,
      inputProps,
      chromiumOptions,
    });
    process.stdout.write(`${salida}\n`);
  }
  process.exit(0);
}

// El nombre dice qué le falta: nadie confunde un previo con el tráiler terminado.
const marca =
  (faltan.length ? "-sin-3d" : "") +
  (dePrueba.length ? "-previo" : "") +
  (esTrailer && !conMusica ? "-mudo" : "");
const nombre = esTrailer ? `croquis-trailer${marca}` : id.toLowerCase();
const salida = join(FUERA, `${nombre}-${composicion.width}x${composicion.height}.mp4`);
// En la laptop de 8 GB: dos cuadros a la vez a 1080, uno solo a 4K.
const concurrencia = composicion.width * composicion.height > 1920 * 1080 ? 1 : 2;
const t1 = performance.now();
let ultimo = 0;
await renderMedia({
  composition: composicion,
  serveUrl: servido,
  codec: "h264",
  outputLocation: salida,
  inputProps,
  concurrency: concurrencia,
  chromiumOptions,
  onProgress: ({ renderedFrames }) => {
    if (renderedFrames - ultimo >= 120) {
      ultimo = renderedFrames;
      process.stderr.write(`  ${renderedFrames} de ${composicion.durationInFrames} cuadros\n`);
    }
  },
});
const tRender = performance.now() - t1;
// El texto para la descripción del video donde se publique: el crédito de los modelos (CC-BY).
if (modelos)
  writeFileSync(
    join(FUERA, "DESCRIPCION.txt"),
    [
      "Croquis · Reconstrucción de hechos de tránsito para peritos",
      "",
      "Créditos",
      ...Object.values(modelos).map(
        (m) => `Modelo 3D «${m.nombre}», de ${m.autor}, licencia ${m.licencia}: ${m.url}`,
      ),
      "Dibujados en tinta a partir de su geometría. Música original, compuesta en código.",
      "",
    ].join("\n"),
  );
const segundos = composicion.durationInFrames / composicion.fps;
const resultado = {
  descripcion:
    "Render del tráiler (Remotion 4.0.539): cuánto tarda por segundo de video, con qué tomas del 3D y si lleva la música.",
  script: "apps/trailer/render.mjs",
  fecha: new Date().toISOString(),
  composicion: id,
  ancho: composicion.width,
  alto: composicion.height,
  fps: composicion.fps,
  segundos_de_video: segundos,
  ...(esTrailer
    ? {
        tomas_3d: Object.fromEntries(Object.entries(tomas).map(([h, a]) => [h, a.length])),
        tomas_de_prueba: dePrueba,
        huecos_sin_toma: faltan,
        con_musica: conMusica,
      }
    : { toma_3d: tomaDePrueba }),
  bundle_s: Number((tBundle / 1000).toFixed(1)),
  render_s: Number((tRender / 1000).toFixed(1)),
  render_s_por_segundo_de_video: Number((tRender / 1000 / segundos).toFixed(2)),
  concurrencia,
  maquina: { nucleos: cpus().length, memoria_gb: Math.round(totalmem() / 2 ** 30) },
  // Relativa a la raíz del repo: el registro no depende de dónde esté clonado.
  salida: relative(RAIZ, salida).replace(/\\/g, "/"),
};
// Una entrada por composición: la medición de la prueba técnica no se pierde al renderizar el tráiler.
const archivo = join(
  RAIZ,
  "eval/results",
  esTrailer ? `trailer_render_${id.toLowerCase()}.json` : "trailer_render.json",
);
writeFileSync(archivo, `${JSON.stringify(resultado, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(resultado, null, 2)}\n`);
