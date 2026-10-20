/**
 * El relato con los fragmentos de donde salió cada dato subrayados en naranja (evidencia). Las
 * posiciones vienen de la escena (`evidencia[].inicio`/`fin`) sobre el texto ya sin datos
 * personales, que es lo que se envió.
 */
import type { EscenaSpec } from "@croquis/scene-schema";

interface Tramo {
  inicio: number;
  fin: number;
}

/** Todas las citas de la escena, ordenadas y sin traslapes. */
export function tramosDeEvidencia(spec: EscenaSpec, largo: number): Tramo[] {
  const out: Tramo[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === "evidencia" && Array.isArray(v)) {
        for (const e of v as { inicio?: number; fin?: number }[]) {
          if (typeof e.inicio === "number" && typeof e.fin === "number" && e.fin > e.inicio) {
            out.push({ inicio: Math.max(0, e.inicio), fin: Math.min(largo, e.fin) });
          }
        }
      } else walk(v);
    }
  };
  walk(spec);
  out.sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);
  const merged: Tramo[] = [];
  for (const t of out) {
    const last = merged[merged.length - 1];
    if (last && t.inicio <= last.fin) last.fin = Math.max(last.fin, t.fin);
    else merged.push({ ...t });
  }
  return merged;
}

export function RelatoConCitas({
  texto,
  spec,
  tramos: elegidos,
  className = "t-cuerpo",
}: {
  texto: string;
  spec: EscenaSpec;
  /** Solo estas citas (por omisión, todas las de la escena). */
  tramos?: Tramo[];
  className?: string;
}) {
  const tramos = elegidos
    ? [...elegidos].sort((a, b) => a.inicio - b.inicio)
    : tramosDeEvidencia(spec, texto.length);
  const partes: { texto: string; cita: boolean }[] = [];
  let i = 0;
  for (const t of tramos) {
    if (t.inicio > i) partes.push({ texto: texto.slice(i, t.inicio), cita: false });
    partes.push({ texto: texto.slice(t.inicio, t.fin), cita: true });
    i = t.fin;
  }
  if (i < texto.length) partes.push({ texto: texto.slice(i), cita: false });
  return (
    <p data-testid="relato-citas" className={`${className} whitespace-pre-wrap`}>
      {partes.map((p, k) =>
        p.cita ? (
          <mark key={k} className="cita bg-transparent text-texto">
            {p.texto}
          </mark>
        ) : (
          <span key={k}>{p.texto}</span>
        ),
      )}
    </p>
  );
}
