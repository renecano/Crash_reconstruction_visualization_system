/**
 * La importación de un dictamen (R5, ADR 0068) con Claude: las dos lecturas que ya se hicieron
 * sobre el corpus, en paralelo y con el tope de gasto diario.
 * - La de C0 (`pedidoCorpus`): el expediente completo, con la cita de cada dato.
 * - La de R0 (`pedidoNarracion`): la narración sin conclusiones y lo que concluyó CESVI.
 * Solo servidor. El navegador arma el expediente y la narración y revisa cada cita contra el texto
 * (`importarDictamen`).
 */
import Anthropic from "@anthropic-ai/sdk";
import { LLMError, PRICES } from "@croquis/extraction";
import { conReserva, costoMaximoUsd, type BudgetStore } from "@croquis/extraction/server";
import { VERSION_PROMPT_CORPUS, type SalidaCorpus } from "../corpus";
import { VERSION_PROMPT_NARRACION, type SalidaNarracion } from "../narracion";
import type { ClienteClaude } from "./consideraciones";
import { lecturaDeMensaje, pedidoCorpus, pedidoNarracion } from "./corpus";

export interface OpcionesImportar {
  modelo: string;
  presupuestoUsd: number;
  gasto: BudgetStore;
  cliente?: ClienteClaude;
}

export interface LecturaImportada {
  corpus: SalidaCorpus;
  narracion: SalidaNarracion;
  modelo: string;
  versiones: { corpus: string; narracion: string };
  costoUsd: number;
}

/** Lee el texto del dictamen con las dos lecturas, respetando el tope de gasto diario. */
export async function leerDictamenImportado(
  texto: string,
  o: OpcionesImportar,
): Promise<LecturaImportada> {
  if (!(o.modelo in PRICES)) throw new LLMError(`Modelo no soportado: ${o.modelo}`);
  const cliente = o.cliente ?? new Anthropic();
  // Cada lectura reserva y cobra lo suyo: si una falla, la otra queda cobrada igual.
  const leer = <T>(pedido: ReturnType<typeof pedidoCorpus>) =>
    conReserva(
      o.gasto,
      o.presupuestoUsd,
      costoMaximoUsd(o.modelo, pedido, pedido.max_tokens),
      async () => lecturaDeMensaje<T>(await cliente.messages.stream(pedido).finalMessage(), false),
      (x) => x.costoUsd,
    );
  const [lc, ln] = await Promise.all([
    leer<SalidaCorpus>(pedidoCorpus(texto, o.modelo)),
    leer<SalidaNarracion>(pedidoNarracion(texto, o.modelo)),
  ]);
  const costoUsd = lc.costoUsd + ln.costoUsd;
  return {
    corpus: lc.salida,
    narracion: ln.salida,
    modelo: lc.modeloRespuesta,
    versiones: { corpus: VERSION_PROMPT_CORPUS, narracion: VERSION_PROMPT_NARRACION },
    costoUsd,
  };
}
