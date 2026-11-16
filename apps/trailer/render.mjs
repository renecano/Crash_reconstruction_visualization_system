#!/usr/bin/env node
/**
 * Render de una composición del tráiler con Remotion, midiendo cuánto tarda por segundo de video
 * (René, 2026-11-16). Los videos y las tomas del 3D van fuera del repo, en `D:\Croquis-trailer`
 * (`CROQUIS_TRAILER` para otra carpeta); la medición, en `eval/results/trailer_render.json`.
 *
 *   pnpm --filter @croquis/trailer render:prueba
 *
 * La carpeta `tomas/` de esa ruta es la carpeta pública del bundle: `staticFile("x.png")` lee
 * `D:\Croquis-trailer\tomas\x.png`. Las tomas del 3D salen de `tools/trailer/tomas-3d.mjs`.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "../..");
const FUERA = process.env.CROQUIS_TRAILER ?? "D:\\Croquis-trailer";
const TOMAS = join(FUERA, "tomas");
const id = process.argv[2] ?? "Prueba";
mkdirSync(TOMAS, { recursive: true });

// La primera toma del 3D que haya (PNG o WebP), si hay.
const toma = existsSync(TOMAS)
  ? (readdirSync(TOMAS).find((f) => /\.(png|webp)$/i.test(f)) ?? null)
  : null;

const t0 = performance.now();
const servido = await bundle({ entryPoint: join(AQUI, "src/index.ts"), publicDir: TOMAS });
const tBundle = performance.now() - t0;
const inputProps = { toma3d: toma };
const composicion = await selectComposition({ serveUrl: servido, id, inputProps });
const salida = join(FUERA, `${id.toLowerCase()}-${composicion.width}x${composicion.height}.mp4`);
const t1 = performance.now();
await renderMedia({
  composition: composicion,
  serveUrl: servido,
  codec: "h264",
  outputLocation: salida,
  inputProps,
  // Un render a la vez en la laptop de 8 GB.
  concurrency: 2,
});
const tRender = performance.now() - t1;
const segundos = composicion.durationInFrames / composicion.fps;
const resultado = {
  descripcion:
    "Render de prueba del tráiler (Remotion 4.0.539): cuánto tarda por segundo de video. Las texturas generadas en código y, si la hay, una toma del 3D de una escena sintética.",
  script: "apps/trailer/render.mjs",
  fecha: new Date().toISOString(),
  composicion: id,
  ancho: composicion.width,
  alto: composicion.height,
  fps: composicion.fps,
  segundos_de_video: segundos,
  toma_3d: toma,
  bundle_s: Number((tBundle / 1000).toFixed(1)),
  render_s: Number((tRender / 1000).toFixed(1)),
  render_s_por_segundo_de_video: Number((tRender / 1000 / segundos).toFixed(2)),
  concurrencia: 2,
  maquina: { nucleos: cpus().length, memoria_gb: Math.round(totalmem() / 2 ** 30) },
  salida: salida.replace(/\\/g, "/"),
};
writeFileSync(
  join(RAIZ, "eval/results/trailer_render.json"),
  `${JSON.stringify(resultado, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(resultado, null, 2)}
`);
