/**
 * Marca en el sitio (PLAN §11.2, ADR 0045): `assets/brand/tokens.json` es la fuente de los
 * colores y efectos del sistema de diseño, y los SVG de `assets/brand/` se usan tal cual.
 *
 * - Escribe `src/styles/tokens.css` con una variable CSS por token (`--marca-*` y `--efecto-*`).
 *   Los efectos que traen varias propiedades (`background: …; box-shadow: …`) se separan en una
 *   variable por propiedad.
 * - Copia byte a byte los SVG de la marca a `public/marca/`.
 *
 * `--check` falla si algo no está al día (CI).
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = resolve(WEB, "..", "..", "assets", "brand");
const OUT_CSS = join(WEB, "src", "styles", "tokens.css");
const OUT_SVG = join(WEB, "public", "marca");
const check = process.argv.includes("--check");

const tokens = JSON.parse(readFileSync(join(BRAND, "tokens.json"), "utf8"));

/** Parte un valor CSS por `;` de primer nivel (fuera de paréntesis). */
function splitTop(value) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const lines = [
  "/* Generado por scripts/tokens.mjs desde assets/brand/tokens.json. No editar a mano. */",
  ":root {",
];
for (const [name, t] of Object.entries(tokens.color)) {
  lines.push(`  --marca-${name}: ${t.value};`);
}
for (const [name, t] of Object.entries(tokens.efecto)) {
  const parts = splitTop(t.value);
  if (parts.length === 1) {
    lines.push(`  --efecto-${name}: ${parts[0]};`);
    continue;
  }
  for (const part of parts) {
    const m = /^([a-z-]+):\s*(.+)$/s.exec(part);
    // Una parte sin propiedad es el fondo (así viene `vidrio-oscuro`).
    const [prop, value] = m ? [m[1], m[2]] : ["background", part];
    lines.push(`  --efecto-${name}-${prop}: ${value};`);
  }
}
lines.push("}", "");
const css = lines.join("\n");

const svgs = readdirSync(BRAND).filter((f) => f.endsWith(".svg"));
const stale = [];
if (check) {
  let current = "";
  try {
    current = readFileSync(OUT_CSS, "utf8");
  } catch {
    // falta el archivo: queda desactualizado
  }
  if (current !== css) stale.push("src/styles/tokens.css");
  for (const f of svgs) {
    let same = false;
    try {
      same = readFileSync(join(OUT_SVG, f)).equals(readFileSync(join(BRAND, f)));
    } catch {
      same = false;
    }
    if (!same) stale.push(`public/marca/${f}`);
  }
  if (stale.length > 0) {
    console.error(`Marca desactualizada (corre \`pnpm marca\`): ${stale.join(", ")}`);
    process.exit(1);
  }
  console.log(`Marca al día: tokens.css y ${svgs.length} SVG.`);
} else {
  mkdirSync(dirname(OUT_CSS), { recursive: true });
  writeFileSync(OUT_CSS, css, "utf8");
  mkdirSync(OUT_SVG, { recursive: true });
  for (const f of svgs) copyFileSync(join(BRAND, f), join(OUT_SVG, f));
  console.log(`Escrito ${OUT_CSS} y ${svgs.length} SVG en public/marca.`);
}
