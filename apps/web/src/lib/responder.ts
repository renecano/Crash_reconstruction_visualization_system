/**
 * Una ronda de preguntas (PLAN §7.1): aplica las respuestas de la persona como dato suyo y propone
 * la siguiente ronda con el solver TS. Es lógica pura: la usan la ruta del servidor y la demo, que
 * corre sin servidor en el navegador.
 */
import { applyAnswers, ask, preguntaToDict } from "@croquis/extraction";
import { schemaErrors } from "@croquis/scene-schema";

type Json = Record<string, unknown>;

export class InvalidSpecError extends Error {
  constructor(readonly errors: string[]) {
    super("La escena no cumple el contrato");
  }
}

export interface ResponderOut {
  spec: Json;
  aplicadas: string[];
  preguntas: Json[];
}

/**
 * `texto` ya viene redactado (o es null). Las preguntas ya contestadas u omitidas no se repiten.
 */
export function responder(
  specIn: Json,
  texto: string | null,
  respuestas: Record<string, unknown>,
  contestadas: readonly string[],
): ResponderOut {
  const errs = schemaErrors(specIn);
  if (errs.length > 0) throw new InvalidSpecError(errs.slice(0, 10));
  const [spec, aplicadas] = applyAnswers(specIn, respuestas);
  const after = schemaErrors(spec);
  if (after.length > 0) throw new InvalidSpecError(after.slice(0, 10));
  const answered = new Set([...contestadas, ...Object.keys(respuestas)]);
  return { spec, aplicadas, preguntas: ask(spec, texto, { answered }).map(preguntaToDict) };
}
