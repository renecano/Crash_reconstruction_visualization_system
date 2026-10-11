/**
 * Versión del contrato EscenaSpec. El esquema vive en `escena.schema.json`;
 * Zod y Pydantic se generan desde él (nunca se editan a mano).
 */
export const SCHEMA_VERSION = "1.0.0" as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

/** Compara versiones semánticas "mayor.menor.parche" devolviendo -1, 0 o 1. */
export function compareSchemaVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

function parseSemver(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`Versión de esquema inválida: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
