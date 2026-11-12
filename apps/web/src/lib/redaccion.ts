/**
 * Redacción de datos personales antes de mandar un texto a Claude en las rutas de `/api/cesvi`
 * (PLAN §10): el mismo `redact()` de `/api/relato`. Quita nombres, placas, teléfonos, correos, CURP,
 * RFC, números de domicilio, VIN, folios, pólizas y siniestros, y deja su marcador (`[NOMBRE]`…).
 *
 * `redact()` es determinista e idempotente: el navegador revisa las citas de Claude contra el mismo
 * texto redactado (`textoParaClaude`), y redactar dos veces da lo mismo.
 *
 * Sin dependencias del servidor: lo importan también los componentes que revisan las citas.
 */
import { redact } from "@croquis/extraction";

/** El texto como lo ve Claude. */
export function textoParaClaude(texto: string): string {
  return redact(texto).text;
}

/** Redacta cada texto de un valor JSON (objetos y listas, a cualquier profundidad). */
export function redactarValores<T>(valor: T): T {
  if (typeof valor === "string") return textoParaClaude(valor) as T;
  if (Array.isArray(valor)) return valor.map((v: unknown) => redactarValores(v)) as T;
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, redactarValores(v as unknown)]),
    ) as T;
  }
  return valor;
}
