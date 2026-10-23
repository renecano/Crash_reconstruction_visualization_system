/**
 * Resultado del solver (`resultado.schema.json`): validación y resultados versionados de las
 * escenas canónicas. El visor los consume sin solver en el navegador (el port TS llega en F9).
 * Los resultados se cargan bajo demanda para no inflar la carga inicial de la página.
 */
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import resultadoSchema from "../resultado.schema.json";
import type { FixtureName } from "./fixtures";
import { ResultadoSchema, type Resultado } from "./generated/resultado.zod";

export type ResultadoValidation =
  { ok: true; resultado: Resultado } | { ok: false; errors: string[] };

let ajvInstance: Ajv2020 | undefined;

function ajv(): Ajv2020 {
  if (!ajvInstance) {
    ajvInstance = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajvInstance);
    ajvInstance.addSchema(resultadoSchema);
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

/** Errores contra `resultado.schema.json` (Ajv), ordenados y estables. */
export function resultadoErrors(data: unknown): string[] {
  const validate = ajv().getSchema(resultadoSchema.$id);
  if (!validate) throw new Error("No se pudo compilar resultado.schema.json");
  return validate(data) ? [] : (validate.errors ?? []).map(formatError).sort();
}

/** Ajv (referencia) y después Zod (tipos), igual que `validateEscena`. */
export function validateResultado(data: unknown): ResultadoValidation {
  const errors = resultadoErrors(data);
  if (errors.length > 0) return { ok: false, errors };
  const parsed = ResultadoSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `/${i.path.join("/")}: ${i.message}`).sort(),
    };
  }
  return { ok: true, resultado: parsed.data };
}

/** Importaciones bajo demanda de los resultados versionados (uno por escena canónica). */
export const RESULT_LOADERS: Record<FixtureName, () => Promise<unknown>> = {
  alcance: () => import("../fixtures/resultados/alcance.json").then((m) => m.default),
  lateral_interseccion: () =>
    import("../fixtures/resultados/lateral_interseccion.json").then((m) => m.default),
  frontal_curva: () => import("../fixtures/resultados/frontal_curva.json").then((m) => m.default),
  peaton_cruce: () => import("../fixtures/resultados/peaton_cruce.json").then((m) => m.default),
  motociclista: () => import("../fixtures/resultados/motociclista.json").then((m) => m.default),
  objeto_fijo_arbol: () =>
    import("../fixtures/resultados/objeto_fijo_arbol.json").then((m) => m.default),
  poste: () => import("../fixtures/resultados/poste.json").then((m) => m.default),
  volcadura: () => import("../fixtures/resultados/volcadura.json").then((m) => m.default),
  nocturno_lluvia: () =>
    import("../fixtures/resultados/nocturno_lluvia.json").then((m) => m.default),
  glorieta: () => import("../fixtures/resultados/glorieta.json").then((m) => m.default),
  interseccion_toluca: () =>
    import("../fixtures/resultados/interseccion_toluca.json").then((m) => m.default),
  carambola: () => import("../fixtures/resultados/carambola.json").then((m) => m.default),
  reversa: () => import("../fixtures/resultados/reversa.json").then((m) => m.default),
};

/** Carga y valida el resultado versionado de una escena canónica. */
export async function loadResultado(name: FixtureName): Promise<Resultado> {
  const raw = await RESULT_LOADERS[name]();
  const v = validateResultado(raw);
  if (!v.ok)
    throw new Error(`Resultado inválido para ${name}:\n${v.errors.slice(0, 5).join("\n")}`);
  return v.resultado;
}

export { resultadoSchema };
