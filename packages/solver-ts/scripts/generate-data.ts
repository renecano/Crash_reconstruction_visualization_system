/**
 * Copia las tablas del solver de referencia (`solver/croquis_solver/data/*.json`) a
 * `src/data/` para que el port TS las empaquete. La fuente única sigue siendo la del solver
 * Python (la escribe E2 o se edita con su fuente citada); `--check` falla si la copia difiere.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "..", "..", "solver", "croquis_solver", "data");
const files = [
  "friction.json",
  "inversion_calibration.json",
  "stiffness_classes.json",
  "yaw_inertia.json",
];
const check = process.argv.includes("--check");
let stale = false;
for (const f of files) {
  const want = readFileSync(join(source, f), "utf-8");
  const out = join(root, "src", "data", f);
  if (check) {
    let have: string;
    try {
      have = readFileSync(out, "utf-8");
    } catch {
      have = "";
    }
    if (have !== want) {
      console.error(`src/data/${f} desactualizado: corre \`pnpm generate\`.`);
      stale = true;
    }
  } else {
    writeFileSync(out, want, "utf-8");
    console.log(`Copiado ${f}`);
  }
}
if (stale) process.exit(1);
if (check) console.log("Tablas del solver al día.");
