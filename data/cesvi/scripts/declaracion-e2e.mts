/**
 * La lectura grabada de una declaración para la e2e de R7 (ADR 0070; CI no llama a la API).
 *
 * El caso es el de la narración de ejemplo de «Caso nuevo» (`cesvi-e814f085db`: V1 VW Jetta con
 * daño frontal, V2 GM Camaro). La declaración es sintética, del conductor de V2, sin placas ni
 * nombres: dice su velocidad, que V1 lo golpeó con el frente en su costado izquierdo y dónde quedó.
 * Los vehículos van a Claude como los describe la página (`descripcionVehiculo`).
 *
 * Uso (desde packages/cesvi, con la llave en el entorno):
 *   pnpm exec tsx ../../data/cesvi/scripts/declaracion-e2e.mts
 *   → data/cesvi/grabaciones/declaracion/declaracion-e2e.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESQUEMA_CORPUS, type SalidaCorpus } from "../../../packages/cesvi/src/corpus";
import {
  descripcionVehiculo,
  mensajeDeclaracion,
  SISTEMA_DECLARACION,
  VERSION_PROMPT_DECLARACION,
} from "../../../packages/cesvi/src/declaracion";
import { escenaDeNarracion } from "../../../packages/cesvi/src/escena-narracion";
import {
  clienteCorpus,
  leerConPedido,
  pedidoLectura,
} from "../../../packages/cesvi/src/server/corpus";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ESCENA = join(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json");
const SALIDA = join(RAIZ, "data/cesvi/grabaciones/declaracion/declaracion-e2e.json");

export const DECLARACION_E2E =
  "Yo circulaba por la Av. Reforma de sur a norte a unos 40 km/h, con el semáforo en verde, cuando el Jetta azul salió de la calle Azucena sin detenerse y me pegó con su frente en mi costado izquierdo. Mi carro quedó sobre la avenida, cerca de la banqueta del lado derecho.";
const DECLARANTE = "V2";

const g = JSON.parse(readFileSync(ESCENA, "utf8")) as { narracion: string; salida: SalidaCorpus };
const e = escenaDeNarracion(g.salida, g.narracion).expediente;
const vehiculos = e.vehiculos.map((v) => ({ id: v.id, descripcion: descripcionVehiculo(v) }));
const l = await leerConPedido<SalidaCorpus>(
  pedidoLectura(
    SISTEMA_DECLARACION,
    mensajeDeclaracion(DECLARACION_E2E, vehiculos, DECLARANTE),
    ESQUEMA_CORPUS as unknown as Record<string, unknown>,
  ),
  clienteCorpus(),
);
mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(
  SALIDA,
  `${JSON.stringify(
    {
      id: "declaracion-e2e",
      caso: "cesvi-e814f085db",
      version_prompt: VERSION_PROMPT_DECLARACION,
      modelo: l.modeloRespuesta,
      uso: l.uso,
      costo_usd: l.costoUsd,
      declaracion: DECLARACION_E2E,
      declarante: DECLARANTE,
      vehiculos,
      salida: l.salida,
    },
    null,
    2,
  )}\n`,
);
console.log(`Grabada: ${l.uso.output_tokens} tokens de salida, ${l.costoUsd.toFixed(4)} USD`);
