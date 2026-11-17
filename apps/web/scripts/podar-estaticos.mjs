/**
 * Quita del despliegue lo que `next build` deja en `.next/static` y el sitio nunca pide (René,
 * 2026-11-17: Deployment Storage de Vercel al 104 %). Corre después de `next build`.
 *
 * Hoy: las variantes de MapLibre que Turbopack copia junto a su módulo (el paquete las nombra en su
 * tabla de exportaciones). El sitio usa MapLibre desde el código empaquetado y su worker desde
 * `public/maplibre/` (`setWorkerUrl`, `src/lib/mapa-compartido.ts`): ninguna de estas se pide. Lo
 * comprueba la e2e del mapa (sin ellas, el mapa no abriría).
 *
 *   node scripts/podar-estaticos.mjs           las quita y dice cuánto pesaban
 *   node scripts/podar-estaticos.mjs --probar  solo dice cuáles quitaría
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MEDIA = join(dirname(fileURLToPath(import.meta.url)), "..", ".next", "static", "media");

/** Los archivos que se quitan: las variantes de MapLibre (no su CSS, que sí se usa). */
export const SOBRANTES = [/^maplibre-gl(-shared|-worker)?(-dev)?\.[^.]+\.mjs$/];

const probar = process.argv.includes("--probar");
if (!existsSync(MEDIA)) {
  console.log("podar-estaticos: no hay .next/static/media (¿corrió next build?).");
  process.exit(0);
}
let bytes = 0;
const quitados = [];
for (const n of readdirSync(MEDIA)) {
  if (!SOBRANTES.some((e) => e.test(n))) continue;
  const p = join(MEDIA, n);
  bytes += statSync(p).size;
  quitados.push(n);
  if (!probar) rmSync(p);
}
console.log(
  `podar-estaticos: ${probar ? "quitaría" : "quité"} ${quitados.length} archivos, ` +
    `${(bytes / 1e6).toFixed(1)} MB (${quitados.join(", ") || "ninguno"}).`,
);
