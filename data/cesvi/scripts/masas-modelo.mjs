// La masa por modelo para cuando la narración da el modelo y no la masa (René, 2026-11-20: «la masa
// sale del modelo leído, con su fuente, como supuesto declarado; solo se pregunta si no hay modelo»).
// Sale de las fichas de fabricante de `data/vehicles/models_raw.json` (data/SOURCES.md), nunca escrita
// a mano: la masa en vacío de la versión registrada, con su URL. Las fichas que no publican la masa
// quedan fuera (para ese modelo se usa la típica de su clase, dicho así).
//
//   node data/cesvi/scripts/masas-modelo.mjs        → packages/cesvi/src/data/masas-modelo.json
//   node data/cesvi/scripts/masas-modelo.mjs --check
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const filas = JSON.parse(readFileSync(join(raiz, "data/vehicles/models_raw.json"), "utf8"));
const normal = (t) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
/** La familia del modelo («Versa Sense TM» → «versa»; «Corolla Cross LE» → «corolla cross»). */
const familia = (modelo) => {
  const p = normal(modelo).split(/[\s(]+/);
  return p[1] === "cross" ? `${p[0]} cross` : p[0];
};
const vistos = new Set();
const modelos = [];
for (const f of filas) {
  if (f.masa_vacio_kg == null) continue;
  const clave = `${normal(f.marca)}|${familia(f.modelo)}`;
  // Un solo valor por familia: el primero registrado (Hiace aparece como van y como combi).
  if (vistos.has(clave)) continue;
  vistos.add(clave);
  modelos.push({
    marca: normal(f.marca),
    familia: familia(f.modelo),
    version: `${f.marca} ${f.modelo} ${f.anio}`,
    clase: f.clase,
    masa_kg: f.masa_vacio_kg,
    fuente: `masa en vacío de la ficha del fabricante (${f.fuente_tipo === "oficial" ? "oficial" : "copia secundaria"}), consultada el ${f.fecha_consulta}: ${f.fuente_url}`,
  });
}
const salida = join(raiz, "packages/cesvi/src/data/masas-modelo.json");
const texto = `${JSON.stringify({ _generado_por: "node data/cesvi/scripts/masas-modelo.mjs", modelos }, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(salida, "utf8") !== texto) {
    console.error(
      "masas-modelo.json no está al día: corre node data/cesvi/scripts/masas-modelo.mjs",
    );
    process.exit(1);
  }
} else {
  writeFileSync(salida, texto);
  console.log(`${modelos.length} modelos con masa → ${salida}`);
}
