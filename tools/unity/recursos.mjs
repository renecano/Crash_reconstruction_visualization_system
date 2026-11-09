#!/usr/bin/env node
/**
 * Trae los recursos del escenario del visor Unity a `apps/visor-unity/Assets/Croquis/Recursos/`, que
 * está fuera de git (ADR 0113). Son los mismos recursos CC0 del visor web, registrados en
 * `assets/ASSETS.md`:
 *
 * - **Texturas PBR** de Poly Haven a 1k (el visor web las usa a 512 px): color, normal OpenGL y una
 *   máscara para URP Lit (R = metal, G = oclusión, A = lisura), armada de su mapa «arm».
 * - **Árboles:** las tarjetas ya horneadas de `apps/web/public/arboles/`, de WebP a PNG (Unity no
 *   importa WebP).
 * - **Cielos HDRI:** los de `apps/web/public/hdri/`, tal cual.
 *
 * Lo que ya está no se vuelve a bajar. Unity lo importa con `ImportarRecursos.cs`.
 *
 *   node tools/unity/recursos.mjs
 */
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "../..");
const WEB = join(RAIZ, "apps/web");
// sharp llega con Next (no es dependencia directa de la web): se resuelve desde ahí.
const deWeb = createRequire(join(WEB, "package.json"));
const sharp = createRequire(deWeb.resolve("next/package.json"))("sharp");
const DESTINO = join(RAIZ, "apps/visor-unity/Assets/Croquis/Recursos/Resources");
const leer = (p) => JSON.parse(readFileSync(p, "utf8"));
const dir = (d) => {
  mkdirSync(d, { recursive: true });
  return d;
};

async function bajar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} al bajar ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

const manifiesto = { texturas: {}, arboles: {}, hdri: {} };

// --- Texturas PBR --------------------------------------------------------------------------------
const texturas = leer(join(WEB, "public/texturas/texturas.json")).texturas;
const dTex = dir(join(DESTINO, "texturas"));
for (const [nombre, t] of Object.entries(texturas)) {
  const salidas = ["diff.jpg", "nor.jpg", "mask.png"].map((s) => join(dTex, `${nombre}_${s}`));
  if (!salidas.every(existsSync)) {
    const archivos = await (await fetch(`https://api.polyhaven.com/files/${t.polyhaven}`)).json();
    const de = (mapa) => archivos[mapa]["1k"].jpg.url;
    writeFileSync(salidas[0], await bajar(de("Diffuse")));
    writeFileSync(salidas[1], await bajar(de("nor_gl")));
    // «arm» trae R = oclusión, G = rugosidad, B = metal. URP Lit quiere el metal en R, la oclusión
    // en G y la lisura (1 − rugosidad) en el alfa.
    const arm = sharp(await bajar(de("arm")));
    const { data, info } = await arm.raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    const mask = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
      mask[4 * i] = data[info.channels * i + 2];
      mask[4 * i + 1] = data[info.channels * i];
      mask[4 * i + 2] = 0;
      mask[4 * i + 3] = 255 - data[info.channels * i + 1];
    }
    await sharp(mask, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toFile(salidas[2]);
    console.log(`Textura ${nombre} (${t.polyhaven})`);
  }
  manifiesto.texturas[nombre] = { mosaico_m: t.mosaico_m, polyhaven: t.polyhaven };
}

// --- Árboles -------------------------------------------------------------------------------------
const arboles = leer(join(WEB, "public/arboles/arboles.json")).especies;
const dArb = dir(join(DESTINO, "arboles"));
for (const [especie, a] of Object.entries(arboles)) {
  for (const [clave, f] of Object.entries(a.archivos)) {
    const salida = join(dArb, `${especie}_${clave}.png`);
    if (!existsSync(salida)) {
      await sharp(join(WEB, "public/arboles", f.archivo))
        .png()
        .toFile(salida);
      console.log(`Árbol ${especie} ${clave}`);
    }
  }
  manifiesto.arboles[especie] = a.medidas;
}

// --- Cielos --------------------------------------------------------------------------------------
const hdri = leer(join(WEB, "public/hdri/hdri.json")).hdri;
const dHdri = dir(join(DESTINO, "hdri"));
for (const [nombre, h] of Object.entries(hdri)) {
  const salida = join(dHdri, `${nombre}.hdr`);
  if (!existsSync(salida)) {
    copyFileSync(join(WEB, "public/hdri", h.archivo), salida);
    console.log(`Cielo ${nombre}`);
  }
  manifiesto.hdri[nombre] = { azimut_sol_deg: h.azimut_sol_deg };
}

writeFileSync(join(DESTINO, "recursos_escenario.json"), `${JSON.stringify(manifiesto, null, 2)}\n`);
console.log(`Recursos en ${DESTINO}`);
