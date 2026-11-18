#!/usr/bin/env node
/**
 * La geometría de los vehículos de la app para dibujarlos en tinta en el tráiler (René, 2026-11-17).
 * Los modelos son los de siempre («Kiri '10» y «Shvan 92 Traveller», de Daniel Zhabotinsky, CC-BY 4.0;
 * `assets/ASSETS.md`), en `apps/web/public/modelos/vehiculos/`. Van comprimidos (Draco) y con
 * texturas (KTX2); para la tinta solo hace falta la forma, así que aquí se descomprimen y se guardan
 * sin texturas ni materiales, como glTF sencillo que three.js abre sin decodificadores.
 *
 *   node tools/trailer/modelos-tinta.mjs   → trailer-salida/modelos/<modelo>.glb y modelos.json
 *
 * La salida va en `trailer-salida/` (git la ignora): se regenera cuando haga falta.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression, KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGEN = join(RAIZ, "apps/web/public/modelos/vehiculos");
const DESTINO = join(process.env.CROQUIS_TRAILER ?? join(RAIZ, "trailer-salida"), "modelos");
/** Los modelos de la escena del tráiler: el sedán (vehículo A) y la combi (vehículo B). */
const MODELOS = ["sedan", "combi"];

// El decodificador de Draco viene con @gltf-transform/cli.
const deAqui = createRequire(import.meta.url);
const deCli = createRequire(deAqui.resolve("@gltf-transform/cli"));
const draco3d = deCli("draco3dgltf");

const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });

const indice = JSON.parse(readFileSync(join(ORIGEN, "vehiculos.json"), "utf8"));
mkdirSync(DESTINO, { recursive: true });
const salida = {};
for (const nombre of MODELOS) {
  const clase = indice.clases[nombre];
  const doc = await io.read(join(ORIGEN, clase.archivos.alta.archivo));
  const raiz = doc.getRoot();
  // Solo la forma: fuera texturas, materiales y extensiones (también la compresión).
  for (const t of raiz.listTextures()) t.dispose();
  for (const m of raiz.listMaterials()) m.dispose();
  for (const malla of raiz.listMeshes())
    for (const p of malla.listPrimitives())
      for (const s of p.listSemantics())
        if (s !== "POSITION" && s !== "NORMAL") p.setAttribute(s, null);
  for (const e of raiz.listExtensionsUsed())
    if (!(e instanceof KHRDracoMeshCompression)) e.dispose();
  for (const e of raiz.listExtensionsUsed()) e.dispose();
  const bytes = await io.writeBinary(doc);
  writeFileSync(join(DESTINO, `${nombre}.glb`), bytes);
  salida[nombre] = {
    archivo: `modelos/${nombre}.glb`,
    largo: clase.largo_m,
    ancho: clase.ancho_m,
    alto: clase.alto_m,
    autor: clase.modelo.autor,
    nombre: clase.modelo.nombre,
    licencia: clase.modelo.licencia,
    url: clase.modelo.url,
  };
  process.stdout.write(
    `${nombre}: ${(bytes.length / 1e6).toFixed(1)} MB, ${raiz.listMeshes().length} mallas\n`,
  );
}
writeFileSync(join(DESTINO, "modelos.json"), `${JSON.stringify(salida, null, 2)}\n`);
