#!/usr/bin/env node
/**
 * El build recién compilado (`apps/visor-unity/Build/web`) a la copia local
 * `.cache/visor-unity/<huella>/`, con la misma forma que la del release, y el manifiesto del sitio
 * apuntando a él. Sirve para probarlo y medirlo con la demo local (`visor-local.mjs preparar`) sin
 * subir ni bajar nada de Vercel Blob (René, 2026-11-17). Ronda 4: el build 1.3.0 se mide aquí antes
 * de publicarlo.
 *
 *   node tools/unity/build-a-cache.mjs            copia y escribe el manifiesto (huella nueva)
 *   git restore apps/web/public/visor-unity/manifest.json    vuelve al build publicado
 *
 * La huella es la de `publicar-web.mjs` (la misma función): si después se publica, la ruta en Blob
 * coincide con la de la copia.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { huellaCarpeta } from "../../apps/web/scripts/recursos-hash.mjs";
import { carpetaDeCopia, manifiestoDelSitio, RAIZ } from "./visor-local.mjs";

const BUILD = join(RAIZ, "apps/visor-unity/Build/web");
const CASO = join(RAIZ, "packages/scene-schema/fixtures/caso3d/axa_alcance.json");
const CASOS_D1 = join(RAIZ, "apps/visor-unity/Build/casos");
if (!existsSync(join(BUILD, "Build")))
  throw new Error("No hay build en apps/visor-unity/Build/web.");

const huella = huellaCarpeta(BUILD);
const destino = carpetaDeCopia(huella);
mkdirSync(destino, { recursive: true });
cpSync(BUILD, destino, { recursive: true });
cpSync(CASO, join(destino, "axa_alcance.json"));
const casos = existsSync(CASOS_D1) ? readdirSync(CASOS_D1).filter((f) => f.endsWith(".json")) : [];
if (casos.length) cpSync(CASOS_D1, join(destino, "casos"), { recursive: true });

const enBuild = readdirSync(join(BUILD, "Build"));
const de = (sufijo) => {
  const f = enBuild.find((x) => x.endsWith(sufijo));
  if (!f) throw new Error(`El build no trae ningún *${sufijo}`);
  return f;
};
const anterior = manifiestoDelSitio();
const manifiesto = {
  ...anterior,
  huella,
  prefijo: `recursos/visor-unity/${huella}/`,
  loader: de(".loader.js"),
  data: de(".data"),
  framework: de(".framework.js"),
  code: de(".wasm"),
  casos: casos.map((f) => f.replace(/\.json$/, "")),
};
writeFileSync(
  join(RAIZ, "apps/web/public/visor-unity/manifest.json"),
  `${JSON.stringify(manifiesto, null, 2)}\n`,
);
const mb = (f) => (readFileSync(join(BUILD, "Build", f)).length / 1048576).toFixed(1);
process.stdout.write(
  `Huella ${huella} (antes ${anterior.huella}) en ${destino}\n` +
    `wasm ${mb(manifiesto.code)} MB · data ${mb(manifiesto.data)} MB\n`,
);
