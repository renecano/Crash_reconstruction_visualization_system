/**
 * `json.dumps(obj, sort_keys=True)` de Python con sus opciones por omisión: separadores ", " y
 * ": ", y `ensure_ascii=True` (todo lo que no es ASCII va como \uXXXX). La huella del prompt se
 * calcula sobre este texto, así que debe coincidir byte por byte con el de la referencia Python.
 */

function escapeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s[i]!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (c < 0x20 || c > 0x7e) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

/** Número como lo escribe Python (enteros sin ".0"; el contrato de salida no lleva flotantes). */
function number(n: number): string {
  if (!Number.isFinite(n)) throw new Error("json.dumps sin NaN ni infinito");
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

export function pyJsonDumps(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return number(value);
  if (typeof value === "string") return escapeString(value);
  if (Array.isArray(value)) return "[" + value.map(pyJsonDumps).join(", ") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return (
      "{" +
      keys
        .map((k) => `${escapeString(k)}: ${pyJsonDumps((value as Record<string, unknown>)[k])}`)
        .join(", ") +
      "}"
    );
  }
  throw new Error(`Valor no serializable: ${typeof value}`);
}
