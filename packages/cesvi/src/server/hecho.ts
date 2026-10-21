/**
 * La lectura de un texto del expediente con Claude (ADR 0055): la descripción técnica del perito o
 * la versión declarada de un conductor, en la estructura de `hecho-lectura.ts`, con el glosario de
 * los dictámenes de CESVI en el prompt. Solo servidor: usa la llave de la API y el tope de gasto.
 * Croquis valida la lectura contra el texto al volver (`validarLectura`).
 */
import Anthropic from "@anthropic-ai/sdk";
import { costUsd, LLMError, PRICES } from "@croquis/extraction";
import type { BudgetStore } from "@croquis/extraction/server";
import {
  ESQUEMA_LECTURA,
  lecturaDeSalida,
  mensajeLectura,
  SISTEMA_LECTURA,
  VERSION_PROMPT_HECHO,
  type LecturaHecho,
  type SalidaModelo,
  type TipoTexto,
} from "../hecho-lectura";
import type { ClienteClaude } from "./consideraciones";

export interface PedidoLectura {
  tipo: TipoTexto;
  texto: string;
  vehiculos: { A: string; B: string };
  declarante?: "A" | "B";
}

export interface LecturaClaude {
  lectura: LecturaHecho;
  /** Lo que devolvió el modelo, tal cual (la lista plana). */
  salida: SalidaModelo;
  modelo: string;
  modeloRespuesta: string;
  version: string;
  costoUsd: number;
  requestId: string | null;
}

interface MensajeFinal {
  stop_reason: string | null;
  stop_details?: unknown;
  model: string;
  content: { type: string; text?: string }[];
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
}

export interface OpcionesLectura {
  modelo: string;
  presupuestoUsd: number;
  gasto: BudgetStore;
  cliente?: ClienteClaude;
}

/** Lee un texto con Claude respetando el tope de gasto diario. */
export async function leerHecho(p: PedidoLectura, o: OpcionesLectura): Promise<LecturaClaude> {
  if (!(o.modelo in PRICES)) throw new LLMError(`Modelo no soportado: ${o.modelo}`);
  if ((await o.gasto.spentToday()) >= o.presupuestoUsd) {
    throw new LLMError("Se alcanzó el tope de gasto diario de la API de Claude.");
  }
  const cliente = o.cliente ?? new Anthropic();
  const params = {
    model: o.modelo,
    max_tokens: 16000,
    system: [
      {
        type: "text" as const,
        text: SISTEMA_LECTURA,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [
      {
        role: "user" as const,
        content: mensajeLectura(p.tipo, p.texto, p.vehiculos, p.declarante),
      },
    ],
    output_config: {
      effort: "medium" as const,
      format: { type: "json_schema" as const, schema: ESQUEMA_LECTURA },
    },
  };
  // Respaldo del servidor si los clasificadores declinan (como en el borrador de consideraciones).
  const stream =
    o.modelo === "claude-sonnet-5-5"
      ? cliente.beta.messages.stream({
          ...params,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        } as unknown as Parameters<ClienteClaude["beta"]["messages"]["stream"]>[0])
      : cliente.messages.stream(params);
  const r = (await stream.finalMessage()) as unknown as MensajeFinal;
  if (r.stop_reason === "refusal") {
    throw new LLMError(
      `El modelo declinó la petición (${JSON.stringify(r.stop_details ?? null)}).`,
    );
  }
  if (r.stop_reason === "max_tokens") throw new LLMError("La lectura se truncó en max_tokens.");
  const cuerpo = r.content.find((b) => b.type === "text")?.text ?? "";
  let salida: SalidaModelo;
  try {
    salida = JSON.parse(cuerpo) as SalidaModelo;
  } catch {
    throw new LLMError("La salida estructurada no es JSON válido.");
  }
  const usage = {
    input_tokens: r.usage.input_tokens ?? 0,
    output_tokens: r.usage.output_tokens ?? 0,
    cache_creation_input_tokens: r.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: r.usage.cache_read_input_tokens ?? 0,
  };
  const servido = String(r.model);
  const costo = costUsd(servido in PRICES ? servido : o.modelo, usage);
  await o.gasto.charge(costo);
  return {
    lectura: lecturaDeSalida(salida),
    salida,
    modelo: o.modelo,
    modeloRespuesta: servido,
    version: VERSION_PROMPT_HECHO,
    costoUsd: costo,
    requestId: (stream as unknown as { request_id?: string | null }).request_id ?? null,
  };
}
