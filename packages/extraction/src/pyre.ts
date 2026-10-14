/**
 * Expresiones regulares con la semántica de `re` de Python sobre `str` (Unicode, sin banderas),
 * para portar la línea base de reglas sin cambiar lo que encuentra.
 *
 * Diferencias que se traducen (fuera de las clases de caracteres salvo donde se indica):
 * - `\w` y `\d` son Unicode en Python: `[\p{L}\p{N}_]` y `\p{Nd}` (también dentro de clases).
 * - `\b` es frontera entre `\w` Unicode y lo demás.
 * - `$` sin MULTILINE también coincide antes de un salto de línea final.
 * - `(?P<nombre>` es `(?<nombre>` en JS.
 * Se compila con las banderas `u` (propiedades Unicode) y `d` (posiciones de grupos).
 */

const WORD = String.raw`\p{L}\p{N}_`;
const BOUNDARY = String.raw`(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;

export function translate(source: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "\\") {
      const next = source[i + 1] ?? "";
      i++;
      if (next === "w") out += inClass ? WORD : `[${WORD}]`;
      else if (next === "d") out += String.raw`\p{Nd}`;
      else if (next === "b" && !inClass) out += BOUNDARY;
      else out += "\\" + next;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      out += ch;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      out += ch;
      // `]` justo después de `[` o `[^` es literal.
      if (source[i + 1] === "^") {
        out += "^";
        i++;
      }
      if (source[i + 1] === "]") {
        out += "\\]";
        i++;
      }
      continue;
    }
    if (ch === "(" && source.startsWith("(?P<", i)) {
      out += "(?<";
      i += 3;
      continue;
    }
    if (ch === "$") {
      out += String.raw`(?=\n?$)`;
      continue;
    }
    out += ch;
  }
  return out;
}

export interface PyMatch {
  start(group?: number): number;
  end(group?: number): number;
  group(group?: number): string | undefined;
  /** Grupos con nombre en el orden del patrón (como `groupdict()`). */
  groupdict(): Record<string, string | undefined>;
}

function wrap(m: RegExpExecArray): PyMatch {
  const idx = (g: number): [number, number] => {
    const pair = m.indices?.[g];
    return pair ? [pair[0], pair[1]] : [-1, -1];
  };
  return {
    start: (g = 0) => idx(g)[0],
    end: (g = 0) => idx(g)[1],
    group: (g = 0) => m[g],
    groupdict: () => ({ ...(m.groups ?? {}) }),
  };
}

/** Patrón compilado con semántica de Python. */
export class PyRe {
  readonly source: string;
  private readonly rx: RegExp;
  private readonly anchored: RegExp;
  private readonly full: RegExp;

  constructor(source: string) {
    this.source = source;
    const t = translate(source);
    this.rx = new RegExp(t, "gdu");
    this.anchored = new RegExp(`^(?:${t})`, "du");
    this.full = new RegExp(`^(?:${t})$`, "du");
  }

  /** `re.search`. */
  search(s: string): PyMatch | null {
    this.rx.lastIndex = 0;
    const m = this.rx.exec(s);
    return m ? wrap(m) : null;
  }

  /** `re.match` (anclado al inicio). */
  match(s: string): PyMatch | null {
    const m = this.anchored.exec(s);
    return m ? wrap(m) : null;
  }

  /** `re.fullmatch`. */
  fullmatch(s: string): PyMatch | null {
    const m = this.full.exec(s);
    return m ? wrap(m) : null;
  }

  /** `re.finditer`. */
  *finditer(s: string): Generator<PyMatch> {
    for (const m of s.matchAll(this.rx)) yield wrap(m);
  }
}

const cache = new Map<string, PyRe>();

/** Patrón compilado una vez (para los que se arman en línea, como `re.search(p, s)`). */
export function pyre(source: string): PyRe {
  let r = cache.get(source);
  if (!r) {
    r = new PyRe(source);
    cache.set(source, r);
  }
  return r;
}

/** `str.rfind(sub, 0, end)` de Python. */
export function rfindBefore(s: string, sub: string, end: number): number {
  if (end <= 0) return sub === "" ? 0 : -1;
  const i = s.lastIndexOf(sub, end - sub.length);
  return i >= 0 && i + sub.length <= end ? i : -1;
}
