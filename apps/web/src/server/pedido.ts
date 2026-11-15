/**
 * Lo que revisa una ruta que gasta la API de Claude antes de leer el cuerpo (auditoría del
 * 2026-11-15, I1): que la petición sea JSON y que venga del propio sitio, y cuál es su límite de
 * peticiones por hora.
 *
 * La revisión de origen impide que otra página gaste el tope desde el navegador de quien la visita.
 * No detiene a un programa que arme sus propios encabezados: de eso se encargan el tope de gasto
 * diario (con reserva) y el límite por hora.
 */
import type { RateLimiter } from "@croquis/extraction/server";

/** Las rutas que llaman a Claude. */
export type RutaClaude =
  "relato" | "escena" | "declaracion" | "importar" | "hecho" | "consideraciones";

/**
 * Qué parte del límite por hora (`CROQUIS_LLM_RATE_LIMIT_PER_HOUR`) le toca a cada ruta. Cada una
 * lleva su propia cuenta: releer una narración ya no le quita lecturas a la declaración. Importar un
 * reporte hace dos lecturas largas, así que tiene la mitad.
 */
export const PARTE_DEL_LIMITE: Readonly<Record<RutaClaude, number>> = {
  relato: 1,
  escena: 1,
  declaracion: 1,
  importar: 0.5,
  hecho: 1,
  consideraciones: 1,
};

/** Peticiones por hora y por cliente de una ruta. */
export function limiteDe(ruta: RutaClaude, porHora: number): number {
  return Math.max(1, Math.round(porHora * PARTE_DEL_LIMITE[ruta]));
}

/** El límite de una ruta: el suyo si lo hay; si no, el compartido (las pruebas). */
export function limitadorDe(
  deps: { limiter: RateLimiter; porRuta?: Partial<Record<RutaClaude, RateLimiter>> },
  ruta: RutaClaude,
): RateLimiter {
  return deps.porRuta?.[ruta] ?? deps.limiter;
}

const rechazo = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * La respuesta de rechazo si la petición no es JSON o viene de otro sitio; `null` si pasa.
 * - `Content-Type` debe ser `application/json`: un formulario de otra página no puede mandarlo sin
 *   que el navegador pregunte antes (CORS).
 * - `Origin`, si viene, debe ser el del propio servidor, y `Sec-Fetch-Site` no puede ser
 *   `cross-site`. Un cliente que no es navegador no manda ninguno de los dos y pasa.
 */
export function rechazoDePedido(request: Request): Response | null {
  const h = request.headers;
  const tipo = (h.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (tipo !== "application/json") {
    return rechazo("El cuerpo debe ser application/json.", 415);
  }
  if (h.get("sec-fetch-site") === "cross-site") {
    return rechazo("La petición viene de otro sitio.", 403);
  }
  const origen = h.get("origin");
  if (origen) {
    const propio = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(request.url).host;
    let host: string;
    try {
      host = new URL(origen).host;
    } catch {
      return rechazo("La petición viene de otro sitio.", 403);
    }
    if (host !== propio) return rechazo("La petición viene de otro sitio.", 403);
  }
  return null;
}
