import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import escenaSchema from "../escena.schema.json";
import { EscenaSpecSchema, type EscenaSpec } from "./generated/escena.zod";

/** Resultado de validar un documento arbitrario contra el contrato. */
export type ValidationResult = { ok: true; spec: EscenaSpec } | { ok: false; errors: string[] };

let ajvInstance: Ajv2020 | undefined;

function ajv(): Ajv2020 {
  if (!ajvInstance) {
    ajvInstance = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajvInstance);
    ajvInstance.addSchema(escenaSchema);
  }
  return ajvInstance;
}

function formatError(e: ErrorObject): string {
  const extra =
    e.keyword === "additionalProperties" && typeof e.params.additionalProperty === "string"
      ? ` (${e.params.additionalProperty})`
      : "";
  return `${e.instancePath || "/"}: ${e.message ?? e.keyword}${extra}`;
}

/** Errores estructurales contra el JSON Schema, como `ruta: mensaje`, ordenados y estables. */
export function schemaErrors(data: unknown): string[] {
  const validate = ajv().getSchema(escenaSchema.$id);
  if (!validate) throw new Error("No se pudo compilar escena.schema.json");
  const ok = validate(data);
  if (ok) return [];
  return (validate.errors ?? []).map(formatError).sort();
}

/**
 * Errores de un expediente de CESVI suelto (`$defs/Expediente`, contrato v2) contra el JSON
 * Schema, con rutas relativas al expediente. Lo usa el corpus de dictámenes (C0).
 */
export function expedienteErrors(data: unknown): string[] {
  const validate = ajv().getSchema(`${escenaSchema.$id}#/$defs/Expediente`);
  if (!validate) throw new Error("No se pudo compilar $defs/Expediente");
  const ok = validate(data);
  if (ok) return [];
  return (validate.errors ?? []).map(formatError).sort();
}

/** Verdadero si el documento cumple el JSON Schema (Ajv). */
export function isValidEscena(data: unknown): data is EscenaSpec {
  return schemaErrors(data).length === 0;
}

/**
 * Valida con Ajv (la referencia del contrato) y después con Zod (tipos). Ambos deben coincidir;
 * la prueba de equivalencia del paquete lo verifica con mutaciones aleatorias.
 */
export function validateEscena(data: unknown): ValidationResult {
  const errors = schemaErrors(data);
  if (errors.length > 0) return { ok: false, errors };
  const parsed = EscenaSpecSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `/${i.path.join("/")}: ${i.message}`).sort(),
    };
  }
  return { ok: true, spec: parsed.data };
}

export { escenaSchema };
