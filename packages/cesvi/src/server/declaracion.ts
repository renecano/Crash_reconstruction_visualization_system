/**
 * La lectura de la declaración de un conductor (R7, ADR 0070) con Claude: las filas planas del
 * extractor del corpus con el prompt de la declaración y los vehículos del caso. Solo servidor:
 * usa la llave de la API y el tope de gasto diario. El navegador revisa las citas al volver
 * (`versionDeclarada`).
 */
import Anthropic from "@anthropic-ai/sdk";
import { LLMError, PRICES } from "@croquis/extraction";
import type { BudgetStore } from "@croquis/extraction/server";
import { ESQUEMA_CORPUS, type Expediente, type SalidaCorpus } from "../corpus";
import {
  mensajeDeclaracion,
  SISTEMA_DECLARACION,
  VERSION_PROMPT_DECLARACION,
  type VehiculoDelCaso,
} from "../declaracion";
import type { ClienteClaude } from "./consideraciones";
import { lecturaDeMensaje, pedidoLectura } from "./corpus";

export interface OpcionesDeclaracion {
  modelo: string;
  presupuestoUsd: number;
  gasto: BudgetStore;
  cliente?: ClienteClaude;
}

export interface LecturaDeclaracion {
  salida: SalidaCorpus;
  modelo: string;
  modeloRespuesta: string;
  version: string;
  costoUsd: number;
}

/** Lee la declaración con Claude respetando el tope de gasto diario. */
export async function leerDeclaracion(
  declaracion: string,
  vehiculos: readonly VehiculoDelCaso[],
  declarante: Expediente["vehiculos"][number]["id"],
  o: OpcionesDeclaracion,
): Promise<LecturaDeclaracion> {
  if (!(o.modelo in PRICES)) throw new LLMError(`Modelo no soportado: ${o.modelo}`);
  if ((await o.gasto.spentToday()) >= o.presupuestoUsd) {
    throw new LLMError("Se alcanzó el tope de gasto diario de la API de Claude.");
  }
  const cliente = o.cliente ?? new Anthropic();
  const stream = cliente.messages.stream(
    pedidoLectura(
      SISTEMA_DECLARACION,
      mensajeDeclaracion(declaracion, vehiculos, declarante),
      ESQUEMA_CORPUS as unknown as Record<string, unknown>,
      o.modelo,
    ),
  );
  const l = lecturaDeMensaje<SalidaCorpus>(await stream.finalMessage(), false);
  await o.gasto.charge(l.costoUsd);
  return {
    salida: l.salida,
    modelo: o.modelo,
    modeloRespuesta: l.modeloRespuesta,
    version: VERSION_PROMPT_DECLARACION,
    costoUsd: l.costoUsd,
  };
}
