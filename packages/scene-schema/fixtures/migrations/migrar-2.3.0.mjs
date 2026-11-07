#!/usr/bin/env node
/**
 * Lleva a 2.3.0 (escena) y 1.14.0 (resultado) los documentos versionados, para que sigan coincidiendo
 * con el contrato (plan v4 §2.2). Solo cambia el número: 2.3.0 y 1.14.0 agregan campos opcionales, así
 * que ningún documento cambia de significado (`src/migrate.ts`). Se hizo una vez, y queda para
 * saber qué se tocó:
 *
 *   node packages/scene-schema/fixtures/migrations/migrar-2.3.0.mjs
 *
 * No toca `eval/results/` ni `docs/`: dicen con qué versión se midió cada cosa. Tampoco lo congelado:
 * `data/relatos-mx` se migra al leerlo.
 */
import { execFileSync } from "node:child_process";
import process from "node:process";
import { readFileSync, writeFileSync } from "node:fs";

const PATRON = /"(version_esquema|version_resultado)"(\s*:\s*)"(2\.2\.0|1\.13\.0)"/g;
const NUEVA = { version_esquema: "2.3.0", version_resultado: "1.14.0" };

const archivos = execFileSync(
  "git",
  ["grep", "-lE", '"version_(esquema|resultado)": *"(2\\.2\\.0|1\\.13\\.0)"', "--", "*.json"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f && !f.startsWith("eval/results/") && !f.startsWith("docs/"));

let n = 0;
for (const f of archivos) {
  const antes = readFileSync(f, "utf8");
  const despues = antes.replace(PATRON, (_, campo, sep) => `"${campo}"${sep}"${NUEVA[campo]}"`);
  if (despues !== antes) {
    writeFileSync(f, despues, "utf8");
    n++;
  }
}
process.stdout.write(`${n} documentos migrados de ${archivos.length} encontrados.
`);
