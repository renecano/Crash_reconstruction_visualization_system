/**
 * Mutaciones deterministas de documentos para las pruebas de contrato (compartidas con Python a
 * través de `fixtures/invalid/cases.json`).
 */
export interface MutationCase {
  nombre: string;
  op: "remove" | "set" | "repeat";
  ruta: string;
  valor?: unknown;
  veces?: number;
}

type JsonObject = Record<string, unknown>;

function splitPointer(ruta: string): string[] {
  if (!ruta.startsWith("/")) throw new Error(`JSON Pointer inválido: ${ruta}`);
  return ruta
    .slice(1)
    .split("/")
    .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function getParent(doc: unknown, parts: string[]): { parent: unknown; key: string } {
  let node: unknown = doc;
  for (const p of parts.slice(0, -1)) {
    if (Array.isArray(node)) node = node[Number(p)];
    else if (node && typeof node === "object") node = (node as JsonObject)[p];
    else throw new Error(`Ruta no encontrada: /${parts.join("/")}`);
  }
  const key = parts.at(-1);
  if (key === undefined) throw new Error("Ruta vacía");
  return { parent: node, key };
}

/** Devuelve una copia profunda de `doc` con la mutación aplicada. */
export function applyMutation(doc: unknown, m: MutationCase): unknown {
  const copy = structuredClone(doc);
  const { parent, key } = getParent(copy, splitPointer(m.ruta));
  if (Array.isArray(parent)) {
    const i = Number(key);
    if (m.op === "remove") parent.splice(i, 1);
    else if (m.op === "set") parent[i] = structuredClone(m.valor);
    else throw new Error("repeat solo aplica a arreglos referidos por ruta");
    return copy;
  }
  if (!parent || typeof parent !== "object") throw new Error(`Padre inválido en ${m.ruta}`);
  const obj = parent as JsonObject;
  if (m.op === "remove") delete obj[key];
  else if (m.op === "set") obj[key] = structuredClone(m.valor);
  else {
    const arr = obj[key];
    if (!Array.isArray(arr) || arr.length === 0)
      throw new Error(`repeat necesita un arreglo no vacío en ${m.ruta}`);
    const first = arr[0] as unknown;
    obj[key] = Array.from({ length: m.veces ?? 1 }, () => structuredClone(first));
  }
  return copy;
}
