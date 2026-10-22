/**
 * La lectura de la narración del perito a escena (R1, ADR 0061) con Claude: las filas planas del
 * extractor del corpus con el prompt de la narración. Solo servidor: usa la llave de la API y el
 * tope de gasto diario. El navegador arma la escena y revisa las citas al volver
 * (`escenaDeNarracion`).
 */
import Anthropic from "@anthropic-ai/sdk";
import { LLMError, PRICES } from "@croquis/extraction";
import type { BudgetStore } from "@croquis/extraction/server";
import { ESQUEMA_CORPUS, type SalidaCorpus } from "../corpus";
import { mensajeEscena, SISTEMA_ESCENA, VERSION_PROMPT_ESCENA } from "../escena-narracion";
import type { ClienteClaude } from "./consideraciones";
import { lecturaDeMensaje, pedidoLectura } from "./corpus";

export interface OpcionesEscena {
  modelo: string;
  presupuestoUsd: number;
  gasto: BudgetStore;
  cliente?: ClienteClaude;
}

export interface LecturaEscena {
  salida: SalidaCorpus;
  modelo: string;
  modeloRespuesta: string;
  version: string;
  costoUsd: number;
}

/** Lee la narración con Claude respetando el tope de gasto diario. */
export async function leerEscena(narracion: string, o: OpcionesEscena): Promise<LecturaEscena> {
  if (!(o.modelo in PRICES)) throw new LLMError(`Modelo no soportado: ${o.modelo}`);
  if ((await o.gasto.spentToday()) >= o.presupuestoUsd) {
    throw new LLMError("Se alcanzó el tope de gasto diario de la API de Claude.");
  }
  const cliente = o.cliente ?? new Anthropic();
  const stream = cliente.messages.stream(
    pedidoLectura(
      SISTEMA_ESCENA,
      mensajeEscena(narracion),
      ESQUEMA_CORPUS as unknown as Record<string, unknown>,
      o.modelo,
    ),
  );
  const l = lecturaDeMensaje<SalidaCorpus>(
    (await stream.finalMessage()) as unknown as Parameters<typeof lecturaDeMensaje>[0],
    false,
  );
  await o.gasto.charge(l.costoUsd);
  return {
    salida: l.salida,
    modelo: o.modelo,
    modeloRespuesta: l.modeloRespuesta,
    version: VERSION_PROMPT_ESCENA,
    costoUsd: l.costoUsd,
  };
}
