#!/usr/bin/env node
/**
 * Candado contra videos y audio en git (René, 2026-11-17): ningún .mp4, .mov, .wav, .mp3 o .m4a
 * entra al repositorio fuera de `apps/web/public/portada/` (las tomas de la portada pública). El
 * video de referencia del tráiler se subió una vez por error; esto evita que vuelva a pasar.
 *
 *   node tools/git/sin-medios.mjs               revisa todo lo que git rastrea (lo corre el CI)
 *   node tools/git/sin-medios.mjs --por-subir   revisa solo lo que va en el commit (el gancho)
 *
 * Lo que produce el tráiler (videos, tomas, música) y su referencia viven en `trailer-salida/`, que
 * git ignora completa.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Las extensiones que no entran. */
export const EXTENSIONES = ["mp4", "mov", "wav", "mp3", "m4a"];
/** La única carpeta donde sí pueden ir. */
export const PERMITIDA = "apps/web/public/portada/";

/** De una lista de rutas (relativas a la raíz, con «/»), las que rompen la regla. */
export function mediosProhibidos(rutas) {
  const esMedio = new RegExp(`\\.(${EXTENSIONES.join("|")})$`, "i");
  return rutas
    .map((r) => r.replaceAll("\\", "/"))
    .filter((r) => esMedio.test(r) && !r.startsWith(PERMITIDA));
}

function rutasDeGit(porSubir) {
  const args = porSubir
    ? // Lo que va en el commit: agregado, copiado, modificado o renombrado.
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : ["ls-files", "-z"];
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) correr();

function correr() {
  const porSubir = process.argv.includes("--por-subir");
  const malos = mediosProhibidos(rutasDeGit(porSubir));
  if (!malos.length) {
    if (!porSubir) process.stdout.write("Sin videos ni audio fuera de apps/web/public/portada/.\n");
    return;
  }
  process.stderr.write(
    `\nNo se suben videos ni audio al repositorio (${EXTENSIONES.map((e) => `.${e}`).join(", ")}), ` +
      `salvo en ${PERMITIDA}:\n\n${malos.map((m) => `  ${m}`).join("\n")}\n\n` +
      "Lo del tráiler va en trailer-salida/, que git ignora. " +
      (porSubir
        ? "Quítalo del commit con: git restore --staged <archivo>\n\n"
        : "Quítalo del repositorio con: git rm --cached <archivo>\n\n"),
  );
  process.exit(1);
}
