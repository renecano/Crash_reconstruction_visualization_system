/**
 * Huella de las carpetas pesadas que se sirven desde Vercel Blob (ADR 0107): sha256 de la lista
 * ordenada «ruta relativa + sha256 del archivo». Si cambia un solo archivo, cambia la huella y la
 * carpeta se sube a una ruta nueva; las anteriores siguen sirviendo a los despliegues viejos.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Carpetas de `public/` que salen del despliegue: las que se piden solo cuando hacen falta. */
export const CARPETAS_REMOTAS = ["modelos/vehiculos", "hdri"];

/** Los archivos de una carpeta, con ruta relativa en formato POSIX y orden estable. */
export function archivosDe(dir) {
  const fuera = [];
  const visitar = (d) => {
    for (const nombre of readdirSync(d).sort()) {
      const p = join(d, nombre);
      if (statSync(p).isDirectory()) visitar(p);
      else fuera.push(relative(dir, p).split(sep).join("/"));
    }
  };
  visitar(dir);
  return fuera.sort();
}

/** Huella de 16 caracteres hexadecimales de una carpeta. */
export function huellaCarpeta(dir) {
  const h = createHash("sha256");
  for (const rel of archivosDe(dir)) {
    const f = createHash("sha256")
      .update(readFileSync(join(dir, rel)))
      .digest("hex");
    h.update(`${rel}\0${f}\n`);
  }
  return h.digest("hex").slice(0, 16);
}

/** Ruta en el almacén de una carpeta con su huella: `recursos/modelos/vehiculos/<huella>/`. */
export function prefijoRemoto(carpeta, huella) {
  return `recursos/${carpeta}/${huella}/`;
}
