/**
 * Genera Zod a partir de los esquemas JSON del paquete:
 *  - `escena.schema.json` → `src/generated/escena.zod.ts` (contrato de entrada, EscenaSpec).
 *  - `resultado.schema.json` → `src/generated/resultado.zod.ts` (salida del solver, ADR 0006).
 *
 * Los esquemas JSON son la fuente de verdad; este archivo NO interpreta todo JSON Schema,
 * solo el subconjunto que usa el contrato (objetos cerrados, arreglos, enums, const, cadenas
 * con patrón/longitud/formato date-time, números con cotas, enteros, booleanos y `$ref` a
 * `#/$defs`). Si el esquema usa algo nuevo, el generador falla a propósito.
 *
 * Uso: `pnpm generate` (escribe) · `pnpm generate:check` (falla si el archivo generado no está al día).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
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

interface Target {
  schema: string;
  out: string;
  /** Nombre del tipo raíz exportado (`<root>Schema` y `type <root>`). */
  root: string;
  /** Constante de versión exportada y de dónde se lee en el esquema. */
  versionConst: string;
  version: (schema: Schema) => Json | undefined;
}

export const TARGETS: Target[] = [
  {
    schema: resolve(here, "../escena.schema.json"),
    out: resolve(here, "../src/generated/escena.zod.ts"),
    root: "EscenaSpec",
    versionConst: "SCHEMA_VERSION",
    version: (s) => s.$defs?.Meta?.properties?.version_esquema?.const,
  },
  {
    schema: resolve(here, "../resultado.schema.json"),
    out: resolve(here, "../src/generated/resultado.zod.ts"),
    root: "Resultado",
    versionConst: "RESULT_VERSION",
    version: (s) => s.properties?.version_resultado?.const,
  },
];

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

function emit(s: Schema, rename: (name: string) => string = (n) => n): string {
  if (s.$ref) return rename(refName(s.$ref));
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
      const item = emit(s.items, rename);
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
        return `${key}: ${emit(v, rename)}${required.has(k) ? "" : ".optional()"}`;
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

export async function generate(target: Target = TARGETS[0] as Target): Promise<string> {
  const schema = JSON.parse(readFileSync(target.schema, "utf8")) as Schema;
  const defs = schema.$defs ?? {};
  const version = target.version(schema);
  if (typeof version !== "string") {
    throw new Error(`El esquema ${target.schema} debe fijar su versión con const`);
  }
  const source = basename(target.schema);
  const lines: string[] = [
    `// Generado por scripts/generate.ts a partir de ${source}. NO EDITAR A MANO.`,
    "// Regenera con `pnpm --filter @croquis/scene-schema generate`.",
    'import { z } from "zod";',
    "",
  ];
  if (target.root === "EscenaSpec") {
    lines.push(`export const SCHEMA_ID = ${JSON.stringify(schema.$id ?? "")};`);
  } else {
    lines.push(
      `export const ${target.root.toUpperCase()}_SCHEMA_ID = ${JSON.stringify(schema.$id ?? "")};`,
    );
  }
  lines.push(`export const ${target.versionConst} = ${JSON.stringify(version)} as const;`, "");
  const rename = (name: string): string => name;
  for (const name of topoOrder(defs)) {
    const def = defs[name];
    if (!def) continue;
    if (def.description) lines.push(`/** ${def.description.replaceAll("*/", "* /")} */`);
    lines.push(`export const ${rename(name)} = ${emit(def, rename)};`);
    lines.push(`export type ${rename(name)} = z.infer<typeof ${rename(name)}>;`, "");
  }
  const { $defs: _defs, ...root } = schema;
  void _defs;
  lines.push(`/** ${(root.description ?? "").replaceAll("*/", "* /")} */`);
  lines.push(`export const ${target.root}Schema = ${emit(root, rename)};`);
  lines.push(`export type ${target.root} = z.infer<typeof ${target.root}Schema>;`, "");
  const code = lines.join("\n");
  const config = (await prettier.resolveConfig(target.out)) ?? {};
  return prettier.format(code, { ...config, parser: "typescript", filepath: target.out });
}

function readCurrent(path: string): string {
  try {
    return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  for (const target of TARGETS) {
    const code = await generate(target);
    if (check) {
      if (readCurrent(target.out) !== code) {
        console.error(
          `Desactualizado: ${target.out}. Corre \`pnpm --filter @croquis/scene-schema generate\`.`,
        );
        process.exitCode = 1;
        continue;
      }
      console.log(`Zod generado al día: ${basename(target.out)}`);
      continue;
    }
    mkdirSync(dirname(target.out), { recursive: true });
    writeFileSync(target.out, code, "utf8");
    console.log(`Escrito ${target.out}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
