/**
 * Glosario de español mexicano (port de `extraction/croquis_extraction/glossary.py`).
 *
 * Cada coincidencia trae la entrada, su posición y el fragmento literal del relato para citarlo
 * como evidencia; las ambiguas traen la pregunta que conviene hacer.
 */
import glosario from "../data/glosario.json";
import { fold } from "./text";

export interface Effect {
  campo: string;
  valor: string | number | boolean;
}

interface Entry {
  id: string;
  patrones: string[];
  significado: string;
  efectos: Effect[];
  ambiguo?: boolean;
  pregunta?: string;
}

export interface Term {
  id: string;
  start: number;
  end: number;
  texto: string;
  efectos: readonly Effect[];
  ambiguo: boolean;
  pregunta: string | null;
}

const ENTRIES = (glosario as { entradas: Entry[] }).entradas;
let compiled: { entry: Entry; rx: RegExp }[] | null = null;

function rules(): { entry: Entry; rx: RegExp }[] {
  compiled ??= ENTRIES.map((entry) => {
    const alts = entry.patrones.map((p) => `(?:${p})`).join("|");
    return { entry, rx: new RegExp(`(?<![a-z0-9])(?:${alts})(?![a-z0-9])`, "g") };
  });
  return compiled;
}

interface GlossaryDoc {
  version: string;
  version_por_prompt?: Record<string, string>;
  entradas: (Entry & { desde?: string })[];
}

/** Número de una versión del prompt (`extraccion_v4` → 4). */
function promptN(prompt: string): number {
  return Number(prompt.slice(prompt.lastIndexOf("_v") + 2));
}

/**
 * Versión del glosario; para un prompt anterior a sus últimas entradas, la que vio ese prompt
 * (`version_por_prompt`), así su huella no cambia (ADR 0043).
 */
export function glossaryVersion(prompt?: string): string {
  const g = glosario as GlossaryDoc;
  return (prompt !== undefined ? g.version_por_prompt?.[prompt] : undefined) ?? g.version;
}

/**
 * Entradas del glosario; con un prompt, solo las que ese prompt conoce (las que tienen `desde`
 * entran en esa versión y las siguientes). La línea base de reglas usa todas.
 */
export function glossaryEntries(prompt?: string): GlossaryDoc["entradas"] {
  return (glosario as GlossaryDoc).entradas.filter(
    (e) => prompt === undefined || e.desde === undefined || promptN(prompt) >= promptN(e.desde),
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Coincidencias del glosario, sin traslapes: gana la más larga y luego la primera. */
export function findTerms(text: string): Term[] {
  const folded = fold(text);
  const found: Term[] = [];
  for (const { entry, rx } of rules()) {
    for (const m of folded.matchAll(rx)) {
      const start = m.index;
      const end = start + m[0].length;
      found.push({
        id: entry.id,
        start,
        end,
        texto: text.slice(start, end),
        efectos: entry.efectos,
        ambiguo: entry.ambiguo ?? false,
        pregunta: entry.pregunta ?? null,
      });
    }
  }
  const byLength = [...found].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start || cmp(a.id, b.id),
  );
  const chosen: Term[] = [];
  for (const t of byLength) {
    if (chosen.every((c) => t.end <= c.start || t.start >= c.end)) chosen.push(t);
  }
  return chosen.sort((a, b) => a.start - b.start || cmp(a.id, b.id));
}
