/**
 * Las tres narraciones que René probó en producción (2026-11-24): el árbol al salir de una curva, el
 * camión que da vuelta y atropella a un peatón, y la carambola en el semáforo. Sus casos guardados
 * (`data/cesvi/casos/rene-*.croquis`) traen la narración; aquí se leen una vez con Claude y se graban
 * en `data/cesvi/grabaciones/tres-narraciones/<clave>.json`, para las pruebas ligeras, la batería de
 * Unity y la e2e, sin llave ni gasto.
 *
 * La llave se toma del `.env.local` de la raíz solo en memoria: no se imprime ni se copia.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/tres_narraciones_grabar.mts
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
const GRABACIONES = join(RAIZ, "data/cesvi/grabaciones/tres-narraciones");
const CLAVES = ["rene-arbol-curva", "rene-peaton-vuelta", "rene-carambola-semaforo"];
const textos = CLAVES.map(
  (k) =>
    (
      JSON.parse(readFileSync(join(RAIZ, `data/cesvi/casos/${k}.croquis`), "utf8")) as {
        narracion: string;
      }
    ).narracion,
);

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

mkdirSync(GRABACIONES, { recursive: true });
const c = clienteCorpus();
let costo = 0;
for (const [k, narracion] of textos.entries()) {
  const id = CLAVES[k]!;
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
        modalidad_c0: "tres-narraciones",
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
