/**
 * Ronda 4 (René, 2026-11-20): las seis narraciones de `docs/cesvi/ronda-4/narraciones-fisica.md`, leídas
 * una vez con Claude y grabadas en `data/cesvi/grabaciones/ronda4/ronda4-<clave>.json`. Así la e2e de
 * las narraciones (`apps/web/e2e/narraciones-fisica.spec.ts`) corre en cualquier computadora sin llave
 * ni gasto: la del colaborador no tiene llave de Claude, y en la t5 ninguna narración se pudo leer.
 *
 * La llave se toma del `.env.local` de la raíz solo en memoria: no se imprime ni se copia.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/ronda4_grabar_narraciones.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESQUEMA_CORPUS, type SalidaCorpus } from "../packages/cesvi/src/corpus";
import {
  mensajeEscena,
  SISTEMA_ESCENA,
  VERSION_PROMPT_ESCENA,
} from "../packages/cesvi/src/escena-narracion";
import { clienteCorpus, leerConPedido, pedidoLectura } from "../packages/cesvi/src/server/corpus";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GRABACIONES = join(RAIZ, "data/cesvi/grabaciones/ronda4");
const CLAVES = ["arbol", "poste", "puente", "subida", "bajada", "curva", "tollocan"];

// La llave, del .env.local, solo en memoria.
if (!process.env.ANTHROPIC_API_KEY) {
  const env = readFileSync(join(RAIZ, ".env.local"), "utf8");
  const linea = env.split(/\r?\n/).find((l) => l.startsWith("ANTHROPIC_API_KEY="));
  if (linea)
    process.env.ANTHROPIC_API_KEY = linea
      .slice("ANTHROPIC_API_KEY=".length)
      .trim()
      .replace(/^"|"$/g, "");
}
if (!process.env.ANTHROPIC_API_KEY) throw new Error("No hay ANTHROPIC_API_KEY en el .env.local.");

const md = readFileSync(join(RAIZ, "docs/cesvi/ronda-4/narraciones-fisica.md"), "utf8");
const textos = [...md.matchAll(/^> (.+)$/gm)].map((m) => m[1]!.trim()).slice(0, 6);
// La séptima: la de Tollocan de René (su caso guardado trae la narración, no la lectura cruda).
textos.push(
  (
    JSON.parse(readFileSync(join(RAIZ, "data/cesvi/casos/tollocan-rene.croquis"), "utf8")) as {
      narracion: string;
    }
  ).narracion,
);
mkdirSync(GRABACIONES, { recursive: true });
const c = clienteCorpus();
let costo = 0;
for (const [k, narracion] of textos.entries()) {
  const id = `ronda4-${CLAVES[k]}`;
  const ruta = join(GRABACIONES, `${id}.json`);
  if (existsSync(ruta)) {
    const g = JSON.parse(readFileSync(ruta, "utf8")) as {
      version_prompt: string;
      narracion: string;
    };
    if (g.version_prompt === VERSION_PROMPT_ESCENA && g.narracion === narracion) continue;
  }
  const l = await leerConPedido<SalidaCorpus>(
    pedidoLectura(
      SISTEMA_ESCENA,
      mensajeEscena(narracion),
      ESQUEMA_CORPUS as unknown as Record<string, unknown>,
    ),
    c,
  );
  costo += l.costoUsd;
  writeFileSync(
    ruta,
    `${JSON.stringify(
      {
        id,
        modalidad_c0: "ronda4",
        version_prompt: VERSION_PROMPT_ESCENA,
        modelo: l.modeloRespuesta,
        uso: l.uso,
        costo_usd: l.costoUsd,
        narracion,
        salida: l.salida,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${id}: ${l.salida.datos.length} datos (${l.costoUsd.toFixed(4)} USD)`);
}
console.log(`Costo total: ${costo.toFixed(4)} USD`);
