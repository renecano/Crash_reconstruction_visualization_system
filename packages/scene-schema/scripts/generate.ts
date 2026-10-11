/**
 * Genera `src/generated/escena.zod.ts` a partir de `escena.schema.json`.
 *
 * `escena.schema.json` es el único contrato; este archivo NO interpreta todo JSON Schema,
 * solo el subconjunto que usa el contrato (objetos cerrados, arreglos, enums, const, cadenas
 * con patrón/longitud/formato date-time, números con cotas, enteros, booleanos y `$ref` a
 * `#/$defs`). Si el esquema usa algo nuevo, el generador falla a propósito.
 *
 * Uso: `pnpm generate` (escribe) · `pnpm generate:check` (falla si el archivo generado no está al día).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
interface Schema {
  $ref?: string;
  const?: Json;
  enum?: Json[];
  type?: string;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  $defs?: Record<string, Schema>;
  $id?: string;
  title?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, "../escena.schema.json");
const OUT_PATH = resolve(here, "../src/generated/escena.zod.ts");

function refName(ref: string): string {
  const prefix = "#/$defs/";
  if (!ref.startsWith(prefix)) throw new Error(`Solo se admiten $ref a #/$defs: ${ref}`);
  return ref.slice(prefix.length);
}

function collectRefs(s: Schema, out: Set<string>): void {
  if (s.$ref) out.add(refName(s.$ref));
  if (s.items) collectRefs(s.items, out);
  for (const p of Object.values(s.properties ?? {})) collectRefs(p, out);
}

function emit(s: Schema): string {
  if (s.$ref) return refName(s.$ref);
  if (s.const !== undefined) return `z.literal(${JSON.stringify(s.const)})`;
  if (s.enum) {
    if (!s.enum.every((v) => typeof v === "string")) {
      throw new Error(`Solo se admiten enums de cadenas: ${JSON.stringify(s.enum)}`);
    }
    return `z.enum([${s.enum.map((v) => JSON.stringify(v)).join(", ")}])`;
  }
  switch (s.type) {
    case "string": {
      let e = s.format === "date-time" ? "z.iso.datetime({ offset: true })" : "z.string()";
      if (s.format && s.format !== "date-time")
        throw new Error(`Formato no soportado: ${s.format}`);
      if (s.minLength !== undefined) e += `.min(${s.minLength})`;
      if (s.maxLength !== undefined) e += `.max(${s.maxLength})`;
      if (s.pattern !== undefined) e += `.regex(new RegExp(${JSON.stringify(s.pattern)}))`;
      return e;
    }
    case "integer":
    case "number": {
      let e = s.type === "integer" ? "z.int()" : "z.number()";
      if (s.minimum !== undefined) e += `.min(${s.minimum})`;
      if (s.maximum !== undefined) e += `.max(${s.maximum})`;
      if (s.exclusiveMinimum !== undefined) e += `.gt(${s.exclusiveMinimum})`;
      if (s.exclusiveMaximum !== undefined) e += `.lt(${s.exclusiveMaximum})`;
      return e;
    }
    case "boolean":
      return "z.boolean()";
    case "array": {
      if (!s.items) throw new Error("Arreglo sin items");
      const item = emit(s.items);
      if (s.minItems !== undefined && s.minItems === s.maxItems) {
        return `z.tuple([${Array.from({ length: s.minItems }, () => item).join(", ")}])`;
      }
      let e = `z.array(${item})`;
      if (s.minItems !== undefined) e += `.min(${s.minItems})`;
      if (s.maxItems !== undefined) e += `.max(${s.maxItems})`;
      return e;
    }
    case "object": {
      const required = new Set(s.required ?? []);
      const props = Object.entries(s.properties ?? {}).map(([k, v]) => {
        const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        return `${key}: ${emit(v)}${required.has(k) ? "" : ".optional()"}`;
      });
      const body = `{ ${props.join(", ")} }`;
      if (s.additionalProperties !== false) {
        throw new Error(
          "Todos los objetos del contrato deben ser cerrados (additionalProperties: false)",
        );
      }
      return `z.strictObject(${body})`;
    }
    default:
      throw new Error(`No sé generar Zod para: ${JSON.stringify(s)}`);
  }
}

function topoOrder(defs: Record<string, Schema>): string[] {
  const order: string[] = [];
  const state = new Map<string, "visitando" | "listo">();
  const visit = (name: string): void => {
    const st = state.get(name);
    if (st === "listo") return;
    if (st === "visitando") throw new Error(`Referencia circular en $defs: ${name}`);
    state.set(name, "visitando");
    const def = defs[name];
    if (!def) throw new Error(`$ref a definición inexistente: ${name}`);
    const deps = new Set<string>();
    collectRefs(def, deps);
    for (const d of [...deps].sort()) visit(d);
    state.set(name, "listo");
    order.push(name);
  };
  for (const name of Object.keys(defs).sort()) visit(name);
  return order;
}

export async function generate(): Promise<string> {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Schema;
  const defs = schema.$defs ?? {};
  const version = (defs.Meta?.properties?.version_esquema?.const ?? null) as string | null;
  if (!version) throw new Error("El esquema debe fijar meta.version_esquema con const");
  const lines: string[] = [
    "// Generado por scripts/generate.ts a partir de escena.schema.json. NO EDITAR A MANO.",
    "// Regenera con `pnpm --filter @croquis/scene-schema generate`.",
    'import { z } from "zod";',
    "",
    `export const SCHEMA_ID = ${JSON.stringify(schema.$id ?? "")};`,
    `export const SCHEMA_VERSION = ${JSON.stringify(version)} as const;`,
    "",
  ];
  for (const name of topoOrder(defs)) {
    const def = defs[name];
    if (!def) continue;
    if (def.description) lines.push(`/** ${def.description.replaceAll("*/", "* /")} */`);
    lines.push(`export const ${name} = ${emit(def)};`);
    lines.push(`export type ${name} = z.infer<typeof ${name}>;`, "");
  }
  const { $defs: _defs, ...root } = schema;
  void _defs;
  lines.push(`/** ${(root.description ?? "").replaceAll("*/", "* /")} */`);
  lines.push(`export const EscenaSpecSchema = ${emit(root)};`);
  lines.push("export type EscenaSpec = z.infer<typeof EscenaSpecSchema>;", "");
  const code = lines.join("\n");
  const config = (await prettier.resolveConfig(OUT_PATH)) ?? {};
  return prettier.format(code, { ...config, parser: "typescript", filepath: OUT_PATH });
}

function readCurrent(): string {
  try {
    return readFileSync(OUT_PATH, "utf8").replaceAll("\r\n", "\n");
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const code = await generate();
  if (check) {
    if (readCurrent() !== code) {
      console.error(
        `Desactualizado: ${OUT_PATH}. Corre \`pnpm --filter @croquis/scene-schema generate\`.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log("Zod generado al día.");
    return;
  }
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, code, "utf8");
  console.log(`Escrito ${OUT_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
