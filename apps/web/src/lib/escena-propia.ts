/**
 * Escena propia: la que la persona usuaria armó desde el relato o el croquis y quiere ver en 3D
 * (`/visor?escena=propia`). Vive en `sessionStorage` de esta pestaña, nunca sale del navegador, y
 * se valida contra el contrato al leerla.
 */
import { validateEscena, type EscenaSpec } from "@croquis/scene-schema";

export const ESCENA_PROPIA_KEY = "croquis:escena-propia";

/** Guarda la escena para abrirla en el visor. Devuelve false si el navegador no lo permite. */
export function guardarEscenaPropia(spec: EscenaSpec): boolean {
  try {
    sessionStorage.setItem(ESCENA_PROPIA_KEY, JSON.stringify(spec));
    return true;
  } catch {
    return false;
  }
}

let cacheRaw: string | null = null;
let cacheSpec: EscenaSpec | null = null;

/**
 * Escena propia guardada y válida, o null. Para `useSyncExternalStore`: devuelve el mismo objeto
 * mientras el texto guardado no cambie.
 */
export function leerEscenaPropia(): EscenaSpec | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(ESCENA_PROPIA_KEY);
  } catch {
    return null;
  }
  if (raw === cacheRaw) return cacheSpec;
  cacheRaw = raw;
  cacheSpec = null;
  if (!raw) return null;
  try {
    const result = validateEscena(JSON.parse(raw) as unknown);
    cacheSpec = result.ok ? result.spec : null;
  } catch {
    cacheSpec = null;
  }
  return cacheSpec;
}
