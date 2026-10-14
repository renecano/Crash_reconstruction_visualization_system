/**
 * Genera `src/generated/prompts.ts` desde `prompts/*.md` (la fuente única del prompt, que también
 * lee la referencia Python). Así el prompt viaja en el bundle de las funciones de Vercel sin leer
 * archivos en tiempo de ejecución. `--check` falla si el archivo generado no está al día.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "prompts");
const out = join(root, "src", "generated", "prompts.ts");

const entries = readdirSync(dir)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => [f.replace(/\.md$/, ""), readFileSync(join(dir, f), "utf-8")] as const);

const body =
  "// Generado por scripts/generate-prompts.ts desde prompts/*.md. No editar a mano.\n" +
  "export const PROMPTS = {\n" +
  entries.map(([k, v]) => `  ${k}: ${JSON.stringify(v)},\n`).join("") +
  "} as const;\n";

if (process.argv.includes("--check")) {
  let current: string;
  try {
    current = readFileSync(out, "utf-8");
  } catch {
    current = "";
  }
  if (current !== body) {
    console.error("src/generated/prompts.ts desactualizado: corre `pnpm generate`.");
    process.exit(1);
  }
  console.log("Prompts generados al día.");
} else {
  writeFileSync(out, body, "utf-8");
  console.log(`Escrito ${out}`);
}
