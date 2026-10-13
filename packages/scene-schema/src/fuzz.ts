/**
 * Utilidades para las pruebas de equivalencia Ajv ↔ Zod: rutas a hojas de un documento y
 * mutaciones deterministas (borrar, cambiar tipo, valor fuera de rango, propiedad extra).
 */
export type LeafPath = (string | number)[];

/** Rutas a todas las hojas; en arreglos de más de `maxArray` elementos solo toma los primeros. */
export function leafPaths(node: unknown, maxArray = Infinity, prefix: LeafPath = []): LeafPath[] {
  if (Array.isArray(node)) {
    const items = node.length > maxArray ? node.slice(0, maxArray) : node;
    return items.flatMap((v, i) => leafPaths(v, maxArray, [...prefix, i]));
  }
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      leafPaths(v, maxArray, [...prefix, k]),
    );
  }
  return [prefix];
}

/** Copia del documento con una mutación del tipo `kind % 6` en `path`. */
export function mutate(doc: unknown, path: LeafPath, kind: number, payload: number): unknown {
  const copy = structuredClone(doc) as Record<string, unknown>;
  let node: unknown = copy;
  for (const p of path.slice(0, -1)) node = (node as Record<string | number, unknown>)[p];
  const parent = node as Record<string | number, unknown>;
  const key = path.at(-1);
  if (key === undefined) return copy;
  switch (kind % 6) {
    case 0:
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
      break;
    case 1:
      parent[key] = payload * 1000 - 500;
      break;
    case 2:
      parent[key] = "valor_inesperado";
      break;
    case 3:
      parent[key] = payload > 0.5;
      break;
    case 4:
      parent[key] = null;
      break;
    default:
      if (!Array.isArray(parent)) parent[`extra_${Math.floor(payload * 100)}`] = 1;
      break;
  }
  return copy;
}
