/**
 * Cliente de las rutas del relato en `services/api` (FastAPI). El texto que se envía ya va
 * redactado en el navegador; el servidor vuelve a redactar como defensa en profundidad.
 */
import type { EscenaSpec } from "@croquis/scene-schema";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown, fetcher: typeof fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetcher(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      `No se pudo conectar con el servidor de Croquis en ${API_URL}. ¿Está corriendo services/api?`,
    );
  }
  if (!res.ok) {
    throw new ApiError(`El servidor respondió ${res.status}.`, res.status);
  }
  return (await res.json()) as T;
}

export function extraer(
  texto: string,
  metodo: "auto" | "reglas" | "claude" = "auto",
  fetcher: typeof fetch = fetch,
): Promise<ExtraerRespuesta> {
  return post("/relato/extraer", { texto, metodo }, fetcher);
}

export function responder(
  spec: EscenaSpec,
  texto: string,
  respuestas: Record<string, string>,
  contestadas: string[],
  fetcher: typeof fetch = fetch,
): Promise<ResponderRespuesta> {
  return post("/relato/responder", { spec, texto, respuestas, contestadas }, fetcher);
}

/** Clave de sessionStorage con la escena que el croquis abre desde el relato. */
export const RELATO_SPEC_KEY = "croquis:relato-spec";
