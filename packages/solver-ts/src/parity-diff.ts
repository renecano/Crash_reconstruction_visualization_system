/**
 * Comparación de resultados con la referencia Python, con la misma tolerancia de
 * `croquis-solver reconstruct --check` (relativa 1e-6, absoluta 1e-5; textos y booleanos exactos;
 * inversión y consistencia, con una unidad de su resolución reportada).
 */
const REL_TOL = 1e-6;
const ABS_TOL = 1e-5;
const FIT_PREFIXES = ["/inversion", "/consistencia"];
const FIT_ABS_TOL = 0.011;

function isClose(a: number, b: number, path: string): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  if (FIT_PREFIXES.some((p) => path.startsWith(p))) return diff <= FIT_ABS_TOL;
  return diff <= Math.max(REL_TOL * Math.max(Math.abs(a), Math.abs(b)), ABS_TOL);
}

/** Diferencias estructurales o numéricas fuera de tolerancia (como `results_io.differences`). */
export function differences(expected: unknown, actual: unknown, path = ""): string[] {
  const out: string[] = [];
  if (typeof expected === "boolean" || typeof actual === "boolean") {
    if (expected !== actual) out.push(`${path}: ${String(expected)} ≠ ${String(actual)}`);
  } else if (typeof expected === "number" && typeof actual === "number") {
    if (!isClose(expected, actual, path)) out.push(`${path}: ${expected} ≠ ${actual}`);
  } else if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      out.push(`${path}: longitud ${expected.length} ≠ ${actual.length}`);
    } else {
      expected.forEach((e, i) => out.push(...differences(e, actual[i], `${path}/${i}`)));
    }
  } else if (
    expected !== null &&
    actual !== null &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    const ek = new Set(Object.keys(e));
    const ak = new Set(Object.keys(a));
    const only = [...ek].filter((k) => !ak.has(k)).concat([...ak].filter((k) => !ek.has(k)));
    if (only.length > 0) out.push(`${path}: claves ${only.sort().join(", ")}`);
    for (const k of [...ek].filter((x) => ak.has(x)).sort()) {
      out.push(...differences(e[k], a[k], `${path}/${k}`));
    }
  } else if (expected !== actual) {
    out.push(`${path}: ${JSON.stringify(expected)} ≠ ${JSON.stringify(actual)}`);
  }
  return out;
}
