/**
 * Verificador de evidencia (port de `extraction/croquis_extraction/verify.py`; PLAN §5.1, paso 3).
 *
 * Todo campo con `fuente: relato` debe citar un fragmento que exista literalmente en el relato
 * redactado. Si la cita existe pero sus posiciones no coinciden, se corrigen; si no existe, el
 * campo baja a `supuesto` (confianza ≤ 0.4) con una nota que lo dice. Las posiciones son puntos de
 * código, como en Python.
 */
import { cpIndex, cpLength, cpSlice, cpTruncate } from "./codepoints";

type Json = Record<string, unknown>;
export const DOWNGRADED_CONFIDENCE = 0.4;
const NOTE = "La cita no aparece literal en el relato; se marcó como supuesto.";

export interface VerifyStats {
  revisados: number;
  /** Cita literal con posiciones arregladas. */
  corregidos: number;
  /** Sin cita literal: pasan a supuesto. */
  degradados: number;
}

function fixEvidence(ev: Json[], text: string): [Json[] | null, boolean] {
  const out: Json[] = [];
  let fixed = false;
  for (const e of ev) {
    const cita =
      typeof e.texto === "string" ? e.texto : typeof e.texto === "number" ? String(e.texto) : "";
    if (!cita) return [null, false];
    const i = e.inicio;
    const j = e.fin;
    if (
      Number.isInteger(i) &&
      Number.isInteger(j) &&
      cpSlice(text, i as number, j as number) === cita
    ) {
      out.push({ inicio: i, fin: j, texto: cita });
      continue;
    }
    const k = text.indexOf(cita);
    if (k < 0) return [null, false];
    const start = cpIndex(text, k);
    out.push({ inicio: start, fin: start + cpLength(cita), texto: cita });
    fixed = true;
  }
  return [out, fixed];
}

/** Copia de la EscenaSpec con la evidencia verificada contra `text`. */
export function verifySpec(spec: Json, text: string): [Json, VerifyStats] {
  const out = structuredClone(spec);
  const stats: VerifyStats = { revisados: 0, corregidos: 0, degradados: 0 };
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) {
      for (const v of o) walk(v);
      return;
    }
    if (o === null || typeof o !== "object") return;
    const d = o as Json;
    if (d.fuente === "relato") {
      stats.revisados++;
      const ev = (Array.isArray(d.evidencia) ? d.evidencia : []) as Json[];
      const [fixedEv, fixed] = ev.length > 0 ? fixEvidence(ev, text) : [null, false];
      if (fixedEv === null) {
        stats.degradados++;
        d.fuente = "supuesto";
        const conf = typeof d.confianza === "number" ? d.confianza : DOWNGRADED_CONFIDENCE;
        d.confianza = Math.min(conf, DOWNGRADED_CONFIDENCE);
        delete d.evidencia;
        const prev = typeof d.nota === "string" ? d.nota : d.nota ? JSON.stringify(d.nota) : "";
        d.nota = prev ? cpTruncate(`${prev} ${NOTE}`, 300) : NOTE;
      } else {
        d.evidencia = fixedEv;
        if (fixed) stats.corregidos++;
      }
    }
    for (const v of Object.values(d)) walk(v);
  };
  walk(out);
  return [out, stats];
}
