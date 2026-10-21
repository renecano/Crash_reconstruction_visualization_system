/**
 * Después de `next build`: el CSS generado trae el sistema de diseño (ADR 0045). Si falta, el build
 * falla y Vercel no publica.
 *
 * Por qué existe: el 2026-10-20 un despliegue de producción salió con el CSS de la plantilla de Next
 * (fondo #0a0a0a, Arial, sin --fondo ni Anybody) aunque el código era el nuevo; el build de Vercel
 * había restaurado la caché de un despliegue anterior a F11a. En la laptop y en CI el build estaba
 * bien, así que la revisión va dentro del propio build. Tarda milisegundos.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", ".next", "static");

function archivosCss(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivosCss(ruta);
    return nombre.endsWith(".css") ? [ruta] : [];
  });
}

let css = "";
try {
  css = archivosCss(RAIZ)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
} catch {
  console.error(`No hay CSS generado en ${RAIZ}: ¿corrió next build?`);
  process.exit(1);
}

const requisitos = [
  ["el token --fondo definido", /--fondo:\s*[^;]+;/],
  ["los tokens de la marca", /--marca-[a-z-]+:/],
  ["la fuente Anybody", /Anybody/],
  ["el rol de título (.t-titulo)", /\.t-titulo\b/],
  ["el botón principal (.boton-principal)", /\.boton-principal\b/],
  ["las utilidades de roles de color (.bg-fondo)", /\.bg-fondo\b/],
];
const faltan = requisitos.filter(([, re]) => !re.test(css)).map(([nombre]) => nombre);
if (faltan.length) {
  console.error(`El CSS generado no trae el sistema de diseño. Falta: ${faltan.join("; ")}.`);
  process.exit(1);
}
console.log(`CSS del sistema de diseño presente (${(css.length / 1024).toFixed(0)} KB).`);
