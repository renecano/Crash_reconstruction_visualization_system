/**
 * Redacción de datos personales en el dispositivo (port de `extraction/croquis_extraction/pii.py`,
 * PLAN §5.1 paso 1 y §10). El relato sale del navegador sin nombres, placas, teléfonos, correos,
 * CURP, RFC ni números de domicilio; los tramos permiten mostrar el original solo aquí.
 *
 * Patrones y pistas vienen de `data/pii.json`, el mismo archivo que usa Python; las expresiones se
 * compilan sin la bandera `u`, así `\d`, `\s`, `\w` y `\b` son ASCII como con `re.ASCII`.
 */
import nombres from "../data/nombres.json";
import piiData from "../data/pii.json";
import { escapeRegExp, fold, normalizeSpaces } from "./text";

export const MARKERS = ["NOMBRE", "PLACA", "TELEFONO", "CORREO", "CURP", "RFC", "NUMERO"] as const;
export type PiiKind = (typeof MARKERS)[number];

export interface Span {
  kind: PiiKind;
  /** Posiciones en el texto original (unidades UTF-16). */
  start: number;
  end: number;
  original: string;
}

export interface Redaction {
  text: string;
  spans: Span[];
}

interface PatternSpec {
  tipo: PiiKind;
  vista: "original" | "plegado";
  regex: string;
  mixto?: boolean;
  digitos?: number[];
}

interface PiiData {
  version: string;
  patrones: PatternSpec[];
  pistas_nombre: string[];
  pistas_fuertes: string[];
  cortes_nombre: string[];
  pistas_lugar: string[];
  particulas: string[];
  enlaces_lugar: string[];
  preposiciones_lugar: string[];
  prefijos_lugar: string[];
}

interface Rules {
  patterns: { spec: PatternSpec; rx: RegExp }[];
  cues: RegExp;
  strongCues: ReadonlySet<string>;
  cuts: ReadonlySet<string>;
  placeCues: ReadonlySet<string>;
  particles: ReadonlySet<string>;
  placeLinks: ReadonlySet<string>;
  placePreps: ReadonlySet<string>;
  placePrefixes: ReadonlySet<string>;
  names: ReadonlySet<string>;
  ambiguous: ReadonlySet<string>;
  surnames: ReadonlySet<string>;
}

const WORD = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g;
const UPPER: ReadonlySet<string> = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑ");
const SENTENCE_END = '.!?¡¿\n:;"«(';

let cached: Rules | null = null;

function rules(): Rules {
  if (cached) return cached;
  const d = piiData as PiiData;
  const n = nombres as { nombres: string[]; ambiguos: string[]; apellidos_frecuentes: string[] };
  const cues = [...d.pistas_nombre]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const particles = new Set(d.particulas);
  cached = {
    patterns: d.patrones.map((spec) => ({ spec, rx: new RegExp(spec.regex, "gd") })),
    cues: new RegExp(`(?<![a-z])(${cues})[\\s,]+`, "g"),
    strongCues: new Set(d.pistas_fuertes),
    cuts: new Set(d.cortes_nombre),
    placeCues: new Set(d.pistas_lugar),
    particles,
    placeLinks: new Set([...particles, ...d.enlaces_lugar]),
    placePreps: new Set(d.preposiciones_lugar),
    placePrefixes: new Set(d.prefijos_lugar),
    names: new Set(n.nombres),
    ambiguous: new Set(n.ambiguos),
    surnames: new Set(n.apellidos_frecuentes),
  };
  return cached;
}

export function piiVersion(): string {
  return (piiData as PiiData).version;
}

const isCap = (w: string): boolean => UPPER.has(w.slice(0, 1));

function nameSpans(text: string, folded: string): [number, number][] {
  const r = rules();
  const words = [...text.matchAll(WORD)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    w: m[0],
  }));
  const word = (k: number) => words[k]!;
  const spans: [number, number][] = [];

  const surnameLike = (w: string): boolean => {
    const f = fold(w);
    return r.surnames.has(f) || (f.length >= 5 && f.endsWith("ez"));
  };

  const extend = (i: number): number => {
    let j = i;
    let k = i + 1;
    while (k < words.length && k - i <= 5) {
      const w = word(k).w;
      const gap = text.slice(word(k - 1).end, word(k).start).trim();
      if (gap !== "" && gap !== "-") break;
      if (isCap(w) && !r.particles.has(fold(w))) {
        j = k;
        k += 1;
      } else if (r.particles.has(fold(w)) && k + 1 < words.length && isCap(word(k + 1).w)) {
        k += 1;
      } else {
        break;
      }
    }
    return j;
  };

  const starts = new Map(words.map((x, k) => [x.start, k]));
  const cueStarts = new Set<number>();
  for (const m of folded.matchAll(r.cues)) {
    const e = m.index + m[0].length;
    if (UPPER.has(text.slice(e, e + 1))) {
      cueStarts.add(e);
      continue;
    }
    const k = starts.get(e);
    if (k === undefined) continue;
    if (r.strongCues.has(m[1] ?? "")) {
      // "se llama kevin armendariz": hasta tres palabras en minúsculas que no cortan.
      let j = k;
      while (
        j < words.length &&
        j - k < 3 &&
        !r.cuts.has(fold(word(j).w)) &&
        (j === k || text.slice(word(j - 1).end, word(j).start).trim() === "")
      ) {
        j += 1;
      }
      if (j > k) spans.push([word(k).start, word(j - 1).end]);
    } else if (r.names.has(fold(word(k).w)) && !r.ambiguous.has(fold(word(k).w))) {
      // "mi primo jorge": un nombre del diccionario en minúsculas tras una pista.
      spans.push([word(k).start, word(k).end]);
    }
  }

  const afterPlaceCue = (i: number): boolean => {
    let k = i - 1;
    while (k >= 0 && r.placeLinks.has(fold(word(k).w))) k -= 1;
    while (k >= 0 && isCap(word(k).w) && !r.placeCues.has(fold(word(k).w))) {
      k -= 1;
      while (k >= 0 && r.placeLinks.has(fold(word(k).w))) k -= 1;
    }
    return k >= 0 && r.placeCues.has(fold(word(k).w));
  };

  // "por Cuauhtémoc", "en León", "San Luis": la palabra nombra un lugar.
  const placeContext = (i: number): boolean => {
    if (r.placePrefixes.has(fold(word(i).w))) return true;
    if (i === 0) return false;
    const prev = fold(word(i - 1).w);
    return r.placePreps.has(prev) || (r.placePrefixes.has(prev) && isCap(word(i - 1).w));
  };

  const sentenceStart = (i: number): boolean => {
    const before = text.slice(0, word(i).start).trimEnd();
    return before === "" || SENTENCE_END.includes(before.slice(-1));
  };

  let i = 0;
  while (i < words.length) {
    const { start: s, end: e, w } = word(i);
    const f = fold(w);
    const nxt = i + 1 < words.length ? word(i + 1).w : "";
    const adjacent = i + 1 < words.length && text.slice(e, word(i + 1).start).trim() === "";
    let isName = false;
    if (cueStarts.has(s) && isCap(w)) {
      isName = true;
    } else if (afterPlaceCue(i) || placeContext(i)) {
      isName = false;
    } else if (
      isCap(w) &&
      ((r.names.has(f) && !r.ambiguous.has(f)) ||
        (r.ambiguous.has(f) && !sentenceStart(i)) ||
        (r.names.has(f) && adjacent && isCap(nxt) && (r.names.has(fold(nxt)) || surnameLike(nxt))))
    ) {
      isName = true;
    } else if (
      !isCap(w) &&
      r.names.has(f) &&
      !r.ambiguous.has(f) &&
      adjacent &&
      (r.names.has(fold(nxt)) || surnameLike(nxt)) &&
      !r.ambiguous.has(fold(nxt))
    ) {
      // Sin mayúsculas: "juan perez", "maria lopez".
      spans.push([s, word(i + 1).end]);
      i += 2;
      continue;
    }
    if (isName) {
      const j = extend(i);
      spans.push([s, word(j).end]);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return spans;
}

/** Redacta datos personales; los tramos no se traslapan (gana el que empieza antes). */
export function redact(raw: string): Redaction {
  const text = normalizeSpaces(raw);
  const folded = fold(text);
  const found: Span[] = [];
  for (const { spec, rx } of rules().patterns) {
    const view = spec.vista === "plegado" ? folded : text;
    for (const m of view.matchAll(rx)) {
      const group = m.indices?.[1];
      const [s, e] = group ?? [m.index, m.index + m[0].length];
      const seg = raw.slice(s, e);
      if (spec.mixto && !(/[0-9]/.test(seg) && /[A-Za-z]/.test(seg))) continue;
      if (spec.digitos && !spec.digitos.includes(seg.replace(/[^0-9]/g, "").length)) continue;
      found.push({ kind: spec.tipo, start: s, end: e, original: seg });
    }
  }
  const names = nameSpans(text, folded);
  // Correferencia: un nombre ya detectado se redacta también donde aparece sin pista.
  const keys = [...new Set(names.map(([s, e]) => folded.slice(s, e)))].sort(
    (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  const seen = new Set(names.map(([s, e]) => `${s}:${e}`));
  for (const key of keys) {
    for (const m of folded.matchAll(
      new RegExp(`(?<![a-z0-9])${escapeRegExp(key)}(?![a-z0-9])`, "g"),
    )) {
      const id = `${m.index}:${m.index + m[0].length}`;
      if (!seen.has(id)) {
        seen.add(id);
        names.push([m.index, m.index + m[0].length]);
      }
    }
  }
  for (const [s, e] of names) {
    found.push({ kind: "NOMBRE", start: s, end: e, original: raw.slice(s, e) });
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const chosen: Span[] = [];
  for (const sp of found) {
    const last = chosen.at(-1);
    if (last && sp.start < last.end) continue;
    chosen.push(sp);
  }
  let out = "";
  let pos = 0;
  for (const sp of chosen) {
    out += raw.slice(pos, sp.start) + `[${sp.kind}]`;
    pos = sp.end;
  }
  return { text: out + raw.slice(pos), spans: chosen };
}

/** Cuántos datos de cada tipo se redactaron. */
export function countByKind(r: Redaction): Record<PiiKind, number> {
  const out = Object.fromEntries(MARKERS.map((k) => [k, 0])) as Record<PiiKind, number>;
  for (const s of r.spans) out[s.kind] += 1;
  return out;
}
