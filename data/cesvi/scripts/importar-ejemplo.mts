/**
 * El dictamen de ejemplo de la importación (R5, ADR 0068): el del caso A2010930 de AXA, del corpus
 * de desarrollo, redactado, con sus dos lecturas de Claude grabadas para la e2e (CI no llama a la
 * API). Los dictámenes de CESVI son de uso libre para este proyecto (PLAN-CESVI §3).
 *
 * Uso (desde packages/cesvi):
 *   pnpm exec tsx ../../data/cesvi/scripts/importar-ejemplo.mts texto    el texto redactado
 *        (lee el lote crudo de data/raw/cesvi/, fuera de git) → data/cesvi/grabaciones/importar/
 *   pnpm exec tsx ../../data/cesvi/scripts/importar-ejemplo.mts grabar   las dos lecturas
 *        (con la llave en el entorno)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryBudgetStore } from "../../../packages/extraction/src/server/index";
import { dividirLote, idDocumento, redactar } from "../../../packages/cesvi/src/corpus";
import { leerDictamenImportado } from "../../../packages/cesvi/src/server/importar";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ARCHIVO = "AXA SINIESTRO A2010930.pdf";
const DESTINO = join(RAIZ, "data/cesvi/grabaciones/importar");
const TEXTO = join(DESTINO, "dictamen-a2010930.md");
const LECTURAS = join(DESTINO, "lecturas-a2010930.json");

function texto() {
  const id = idDocumento(ARCHIVO);
  for (let i = 1; i <= 4; i++) {
    const lote = readFileSync(join(RAIZ, `data/raw/cesvi/crash_reports_batch_0${i}.md`), "utf8");
    const doc = dividirLote(lote).find((d) => d.id === id);
    if (!doc) continue;
    mkdirSync(DESTINO, { recursive: true });
    // `redactar` no reconoce un nombre en mayúsculas después de un título («ING. NOMBRE APELLIDO»):
    // aquí se quita también, porque los nombres nunca se versionan.
    const sinNombres = redactar(doc.texto).replace(
      /\b(ING|LIC|ARQ|DR|DRA|MTRO|MTRA|C)\.\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]*(\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]*){0,4}/g,
      "$1. [NOMBRE]",
    );
    writeFileSync(TEXTO, `${sinNombres.trim()}\n`);
    // El mismo texto para el botón «Usar el dictamen de ejemplo» de la página.
    writeFileSync(
      join(DESTINO, "ejemplo.json"),
      `${JSON.stringify({ archivo: "dictamen-a2010930.md", texto: `${sinNombres.trim()}\n` })}\n`,
    );
    console.log(`${id}: ${doc.texto.length} caracteres → ${TEXTO}`);
    return;
  }
  throw new Error(`No está ${ARCHIVO} en los lotes crudos.`);
}

async function grabar() {
  const t = readFileSync(TEXTO, "utf8");
  const r = await leerDictamenImportado(t, {
    modelo: "claude-sonnet-5-5",
    presupuestoUsd: 1,
    gasto: new MemoryBudgetStore(),
  });
  writeFileSync(LECTURAS, `${JSON.stringify(r, null, 2)}\n`);
  console.log(`Grabadas: ${r.costoUsd.toFixed(4)} USD → ${LECTURAS}`);
}

const modo = process.argv[2];
if (modo === "texto") texto();
else if (modo === "grabar") await grabar();
else console.error("Uso: importar-ejemplo.mts texto | grabar");
