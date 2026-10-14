/**
 * Cliente de las rutas del relato (Route Handlers en `app/api/relato`, desplegadas junto con la
 * web en Vercel). El texto que se envía ya va redactado en el navegador; el servidor vuelve a
 * redactar como defensa en profundidad. La extracción llega como NDJSON en streaming.
 */
import type { EscenaSpec } from "@croquis/scene-schema";

/** Rutas del relato (mismo origen que la página). */
export const API_BASE = "/api/relato";

export interface Pregunta {
  id: string;
  texto: string;
  motivo: "contradiccion" | "sensibilidad" | "ambiguedad";
  campo: string;
  opciones?: string[];
  reduccion?: number;
}

export interface TerminoGlosario {
  id: string;
  texto: string;
  inicio: number;
  fin: number;
  ambiguo: boolean;
  pregunta: string | null;
}

export interface ExtraerRespuesta {
  spec: EscenaSpec;
  texto: string;
  metodo: "reglas" | "claude";
  motivo: string | null;
  redacciones_servidor: number;
  verificador: { revisados: number; corregidos: number; degradados: number };
  glosario: TerminoGlosario[];
  preguntas: Pregunta[];
}

export interface ResponderRespuesta {
  spec: EscenaSpec;
  aplicadas: string[];
  preguntas: Pregunta[];
}

/** Avance de la extracción: método elegido y caracteres que Claude lleva escritos. */
export interface Progreso {
  metodo: "reglas" | "claude" | null;
  caracteres: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const OFFLINE =
  "No se pudo conectar con el servidor de Croquis. Revisa tu conexión e intenta de nuevo.";

async function send(path: string, body: unknown, fetcher: typeof fetch): Promise<Response> {
  let res: Response;
  try {
    res = await fetcher(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(OFFLINE);
  }
  if (!res.ok) throw new ApiError(`El servidor respondió ${res.status}.`, res.status);
  return res;
}

type Evento =
  | { tipo: "inicio"; metodo: "reglas" | "claude" }
  | { tipo: "progreso"; caracteres: number }
  | { tipo: "resultado"; datos: ExtraerRespuesta }
  | { tipo: "error"; mensaje: string };

/** Lee un cuerpo NDJSON evento por evento. */
async function* ndjson(res: Response): AsyncGenerator<Evento> {
  if (!res.body) {
    for (const line of (await res.text()).split("\n"))
      if (line.trim()) yield JSON.parse(line) as Evento;
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.trim()) yield JSON.parse(line) as Evento;
      nl = buffer.indexOf("\n");
    }
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as Evento;
}

export async function extraer(
  texto: string,
  metodo: "auto" | "reglas" | "claude" = "auto",
  fetcher: typeof fetch = fetch,
  onProgress?: (p: Progreso) => void,
): Promise<ExtraerRespuesta> {
  const res = await send("/extraer", { texto, metodo }, fetcher);
  let progreso: Progreso = { metodo: null, caracteres: 0 };
  for await (const ev of ndjson(res)) {
    if (ev.tipo === "inicio") progreso = { ...progreso, metodo: ev.metodo };
    else if (ev.tipo === "progreso") progreso = { ...progreso, caracteres: ev.caracteres };
    else if (ev.tipo === "resultado") return ev.datos;
    else throw new ApiError(ev.mensaje);
    onProgress?.(progreso);
  }
  throw new ApiError("La respuesta del servidor se cortó antes del resultado.");
}

export async function responder(
  spec: EscenaSpec,
  texto: string,
  respuestas: Record<string, string>,
  contestadas: string[],
  fetcher: typeof fetch = fetch,
): Promise<ResponderRespuesta> {
  const res = await send("/responder", { spec, texto, respuestas, contestadas }, fetcher);
  return (await res.json()) as ResponderRespuesta;
}

/** Clave de sessionStorage con la escena que el croquis abre desde el relato. */
export const RELATO_SPEC_KEY = "croquis:relato-spec";
