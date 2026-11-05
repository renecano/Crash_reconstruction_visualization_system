/**
 * Leer un reporte completo de CESVI con Claude (R5, ADR 0068; René, 2026-11-04, A3): desde «Cargar
 * un reporte» o desde la narración, cuando el perito pegó el reporte entero. Si no se puede, el
 * motivo real: sin llave, tope de gasto, demasiadas peticiones, texto fuera de tamaño, el servidor
 * que tardó demasiado o sin conexión.
 */
import {
  importarDictamen,
  type DictamenImportado,
  type SalidaCorpus,
  type SalidaNarracion,
} from "@croquis/cesvi";

/** Lo que acepta `/api/cesvi/importar` (caracteres). */
export const MIN_REPORTE = 200;
export const MAX_REPORTE = 200_000;

/**
 * Si un texto pegado como narración es un reporte completo de CESVI: largo y con varias de sus
 * secciones (análisis, conclusiones, energía de deformación, medidas C1–C6…).
 */
export function pareceReporteCompleto(texto: string): boolean {
  if (texto.trim().length < 1500) return false;
  const marcas = [
    /\bdictamen\b/i,
    /\bconclusi[oó]n(?:es)?\b/i,
    /\bconsideraciones\b/i,
    /\ban[aá]lisis\b/i,
    /energ[ií]a\s+de\s+deformaci[oó]n/i,
    /\bEBS\b/,
    /\bC[1-6]\s*[=:]/,
    /velocidad\s+(?:de\s+impacto|equivalente|al\s+impacto)/i,
    /\bmetodolog[ií]a\b/i,
    /\bantecedentes\b/i,
  ];
  return marcas.filter((m) => m.test(texto)).length >= 3;
}

type Respuesta = {
  metodo?: string;
  motivo?: string;
  error?: string;
  corpus?: SalidaCorpus;
  narracion?: SalidaNarracion;
} | null;

/** El motivo, en palabras, de una lectura que no salió. */
export function motivoDeFalla(status: number, d: Respuesta): string {
  if (d?.metodo === "no_disponible" && d.motivo) return `No se pudo leer con Claude: ${d.motivo}.`;
  if (status === 422) {
    return `El texto debe tener entre ${MIN_REPORTE.toLocaleString("es-MX")} y ${MAX_REPORTE.toLocaleString("es-MX")} caracteres.`;
  }
  if (status === 429) return "Demasiadas lecturas en la última hora: intenta más tarde.";
  if (status === 504 || status === 408) {
    return "El servidor tardó más de lo permitido en leer el reporte: intenta de nuevo; si se repite, recorta los anexos.";
  }
  if (status >= 500)
    return "El servidor falló al leer el reporte: intenta de nuevo en unos minutos.";
  if (d?.error) return d.error;
  return "Claude no devolvió la lectura del reporte.";
}

export type ResultadoLectura =
  { ok: true; importado: DictamenImportado } | { ok: false; motivo: string };

export async function leerReporte(texto: string, nombre: string): Promise<ResultadoLectura> {
  if (texto.trim().length < MIN_REPORTE) {
    return { ok: false, motivo: motivoDeFalla(422, null) };
  }
  let r: Response;
  try {
    r = await fetch("/api/cesvi/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
  } catch {
    return { ok: false, motivo: "Sin conexión: leer el reporte necesita internet." };
  }
  const d = (await r.json().catch(() => null)) as Respuesta;
  if (!r.ok || d?.metodo !== "claude" || !d.corpus || !d.narracion) {
    return { ok: false, motivo: motivoDeFalla(r.ok ? 200 : r.status, d) };
  }
  return { ok: true, importado: importarDictamen(texto, d.corpus, d.narracion, nombre) };
}
