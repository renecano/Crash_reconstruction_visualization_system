/**
 * Respuestas grabadas de Claude (`grabaciones/<modelo>/<clave>.json`), las mismas que lee la
 * referencia Python. CI y las pruebas solo reproducen: nunca llaman a la API.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LLMError, promptFingerprint, type ClaudeOutput, type Usage } from "../claude-output";
import { sha256Hex } from "../hash";

export const RECORDINGS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "grabaciones");

export interface Recording {
  modelo: string;
  modelo_respuesta: string;
  prompt: string;
  huella_prompt: string;
  esfuerzo: string;
  texto_sha256: string;
  salida: ClaudeOutput;
  usage: Required<Usage>;
  latencia_ms: number;
  costo_usd: number;
  costo_estimado_con: string;
  request_id: string | null;
  grabado: string;
}

export function recordingPath(model: string, key: string, root = RECORDINGS): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) {
    throw new LLMError(`Clave de grabación inválida: ${JSON.stringify(key)}`);
  }
  return join(root, model, `${key}.json`);
}

export function loadRecording(
  model: string,
  key: string,
  text: string,
  root = RECORDINGS,
): Recording {
  const path = recordingPath(model, key, root);
  if (!existsSync(path)) {
    throw new LLMError(
      `Sin respuesta grabada para ${model}/${key} (requiere ANTHROPIC_API_KEY y modo record).`,
    );
  }
  const rec = JSON.parse(readFileSync(path, "utf-8")) as Recording;
  if (rec.texto_sha256 !== sha256Hex(text)) {
    throw new LLMError(`La grabación ${model}/${key} es de otro texto; vuelve a grabarla.`);
  }
  if (rec.huella_prompt !== promptFingerprint()) {
    throw new LLMError(`La grabación ${model}/${key} es de otra versión del prompt o del esquema.`);
  }
  return rec;
}

/** JSON con llaves ordenadas e indentación de 1, como la referencia Python. */
function sortedJson(value: unknown, indent: string, depth: number): string {
  const pad = indent.repeat(depth + 1);
  const end = indent.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => pad + sortedJson(v, indent, depth + 1)).join(",\n")}\n${end}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) return "{}";
    const body = keys
      .map(
        (k) =>
          `${pad}${JSON.stringify(k)}: ${sortedJson((value as Record<string, unknown>)[k], indent, depth + 1)}`,
      )
      .join(",\n");
    return `{\n${body}\n${end}}`;
  }
  return JSON.stringify(value);
}

export function saveRecording(rec: Recording, key: string, root = RECORDINGS): string {
  const path = recordingPath(rec.modelo, key, root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, sortedJson(rec, " ", 0) + "\n", "utf-8");
  return path;
}
