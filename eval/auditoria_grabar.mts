/**
 * La revisión sistemática de la cadena (René, 2026-11-24): las narraciones nuevas de
 * `data/cesvi/narraciones-auditoria/narraciones.json`, escritas como reportes de CESVI, leídas una vez
 * con Claude y grabadas en `data/cesvi/grabaciones/auditoria/<id>.json`. Tope de gasto: 5 USD (se
 * detiene antes de pasarlo). La llave se toma del `.env.local` de la raíz solo en memoria.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/auditoria_grabar.mts
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
const GRABACIONES = join(RAIZ, "data/cesvi/grabaciones/auditoria");
const TOPE_USD = 5;
const lista = (
  JSON.parse(
    readFileSync(join(RAIZ, "data/cesvi/narraciones-auditoria/narraciones.json"), "utf8"),
  ) as { narraciones: { id: string; texto: string }[] }
).narraciones;
const CLAVES = lista.map((n) => n.id);
const textos = lista.map((n) => n.texto);

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
  if (costo > TOPE_USD - 0.2) {
    console.log(`Me detengo: ${costo.toFixed(4)} USD, cerca del tope de ${TOPE_USD}.`);
    break;
  }
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
  if (costo > TOPE_USD) throw new Error(`Se pasó del tope de ${TOPE_USD} USD.`);
  writeFileSync(
    ruta,
    `${JSON.stringify(
      {
        id,
        modalidad_c0: "auditoria",
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
