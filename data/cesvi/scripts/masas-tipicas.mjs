// La masa típica por clase que propone «Usar valor típico» en las preguntas del hecho (comentario de
// René, 2026-10-24). Sale de datos con fuente, nunca escrita a mano:
//
// - las clases que E2 midió: la masa media de prueba de NHTSA por clase (`eval/results/e2_barrier.json`,
//   con el número de pruebas);
// - la moto, que NHTSA no prueba contra barrera: la típica de las fichas de fabricante
//   (`packages/scene-schema/vehicle_classes.json`, con sus modelos).
//
//   node data/cesvi/scripts/masas-tipicas.mjs        → packages/cesvi/src/data/masas-tipicas.json
//   node data/cesvi/scripts/masas-tipicas.mjs --check
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const leer = (ruta) => JSON.parse(readFileSync(join(raiz, ruta), "utf8"));
const e2 = leer("eval/results/e2_barrier.json");
const clases = leer("packages/scene-schema/vehicle_classes.json").clases;

const masas = {};
for (const [clase, c] of Object.entries(e2.clases)) {
  masas[clase] = {
    kg: c.masa_media_kg,
    fuente: `masa media de ${c.n} pruebas de NHTSA contra barrera (E2, eval/results/e2_barrier.json)`,
  };
}
const moto = clases.motocicleta;
masas.motocicleta = {
  kg: moto.tipico.masa_kg,
  fuente: `típica de ${moto.n_modelos} fichas de fabricante (${moto.modelos.join(", ")}; data/SOURCES.md)`,
};
const salida = join(raiz, "packages/cesvi/src/data/masas-tipicas.json");
const texto = `${JSON.stringify({ _generado_por: "node data/cesvi/scripts/masas-tipicas.mjs", masas }, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(salida, "utf8") !== texto) {
    console.error(
      "masas-tipicas.json no está al día: corre node data/cesvi/scripts/masas-tipicas.mjs",
    );
    process.exit(1);
  }
  console.log("Masas típicas al día.");
} else {
  writeFileSync(salida, texto);
  console.log(`Escrito ${salida}`);
}
