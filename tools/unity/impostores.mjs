#!/usr/bin/env node
/**
 * Hornea los impostores de los árboles del visor Unity (U2, segunda pasada; ADR 0113): por cada
 * especie, 8 vistas alrededor del modelo CC0 de Poly Haven, en un atlas de 4 × 2. Sustituyen a las
 * tarjetas cruzadas, que de cerca dejaban ver su costura.
 *
 *   node tools/unity/impostores.mjs [--solo fresno]
 *
 * Necesita Blender 5 (`CROQUIS_BLENDER`) y los modelos en `data/raw/polyhaven-arboles/` (los baja
 * `uv run croquis-assets trees download`). Escribe en `tools/unity/arboles/`, que sí va en git: son
 * 6 WebP chicos y sin ellos el build pediría Blender. `recursos.mjs` los pasa a PNG para Unity.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "../..");
const deWeb = createRequire(join(RAIZ, "apps/web/package.json"));
const sharp = createRequire(deWeb.resolve("next/package.json"))("sharp");
const BLENDER =
  process.env.CROQUIS_BLENDER ?? "D:/dev-cache/tools/blender/blender-5.2.3-windows-x64/blender.exe";
const CRUDOS = join(RAIZ, "data/raw/polyhaven-arboles");
const SALIDA = join(RAIZ, "tools/unity/arboles");
const VISTAS = 8;
const COLUMNAS = 4;
/** 1024 por vista: a la altura de la acera un árbol llena la pantalla. WebGL lo importa a la mitad. */
const PX = 1024;
/** La normal va a la mitad: se nota menos y pesa la cuarta parte. */
const PX_NORMAL = 512;

const especies = JSON.parse(
  readFileSync(join(RAIZ, "apps/web/public/arboles/arboles.json"), "utf8"),
).especies;
const solo = process.argv.includes("--solo")
  ? process.argv[process.argv.indexOf("--solo") + 1]
  : null;
const previo = existsSync(join(SALIDA, "impostores.json"))
  ? JSON.parse(readFileSync(join(SALIDA, "impostores.json"), "utf8")).especies
  : {};
mkdirSync(SALIDA, { recursive: true });

const salida = {};
for (const [especie, e] of Object.entries(especies)) {
  if (solo && solo !== especie) {
    if (previo[especie]) salida[especie] = previo[especie];
    continue;
  }
  const id = e.modelo.polyhaven;
  const blend = join(CRUDOS, id, `${id}_1k.blend`);
  if (!existsSync(blend)) throw new Error(`Falta ${blend}: corre «croquis-assets trees download».`);
  const horneado = join(CRUDOS, "impostores", especie);
  console.log(`Horneando ${especie} (${VISTAS} vistas de ${PX} px)…`);
  execFileSync(
    BLENDER,
    [
      "-b",
      "--factory-startup",
      "-P",
      join(RAIZ, "assets/pipeline/blender/hornear_impostor.py"),
      "--",
      blend,
      horneado,
      String(PX),
      String(VISTAS),
    ],
    { stdio: ["ignore", "ignore", "inherit"], maxBuffer: 1 << 28 },
  );
  const medidas = JSON.parse(readFileSync(join(horneado, "impostor.json"), "utf8"));
  const archivos = {};
  for (const [mapa, px, calidad] of [
    ["diff", PX, 84],
    ["nor", PX_NORMAL, 88],
  ]) {
    const cuadros = [];
    for (let k = 0; k < VISTAS; k++) {
      cuadros.push({
        input: await sharp(join(horneado, `az${k}_${mapa}.png`))
          .resize(px, px)
          .png()
          .toBuffer(),
        left: (k % COLUMNAS) * px,
        top: Math.floor(k / COLUMNAS) * px,
      });
    }
    const datos = await sharp({
      create: {
        width: COLUMNAS * px,
        height: (VISTAS / COLUMNAS) * px,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(cuadros)
      .webp({ quality: calidad, alphaQuality: 92, effort: 6 })
      .toBuffer();
    const nombre = `${especie}_atlas_${mapa}.webp`;
    writeFileSync(join(SALIDA, nombre), datos);
    archivos[mapa] = {
      archivo: nombre,
      sha256: createHash("sha256").update(datos).digest("hex"),
      bytes: datos.length,
      px: [COLUMNAS * px, (VISTAS / COLUMNAS) * px],
    };
    console.log(`  ${nombre}: ${(datos.length / 1024).toFixed(0)} KB`);
  }
  salida[especie] = {
    modelo: e.modelo,
    vistas: VISTAS,
    columnas: COLUMNAS,
    lado_m: medidas.lado_m,
    alto_m: medidas.alto_m,
    archivos,
  };
}

writeFileSync(
  join(SALIDA, "impostores.json"),
  `${JSON.stringify(
    {
      _generado_por: "node tools/unity/impostores.mjs",
      _nota:
        "Árboles CC0 de Poly Haven horneados a impostores de 8 vistas (ADR 0113); ver assets/ASSETS.md.",
      especies: salida,
    },
    null,
    2,
  )}\n`,
);
console.log(`Escrito ${join(SALIDA, "impostores.json")}`);
