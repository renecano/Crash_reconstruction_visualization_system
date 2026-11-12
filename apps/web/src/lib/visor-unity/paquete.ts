/**
 * El paquete caso-3d de un caso de `/cesvi` (U6): la única entrada del visor Unity
 * (`caso3d.schema.json`, `armarCaso3d`). Junta la escena que dibuja el 3D, el Resultado completo
 * del solver sobre esa escena, el relieve del lugar si lo hay y el escenario que calcula la web
 * (ADR 0112). Unity no recalcula nada: todo movimiento sale de aquí.
 */
import {
  armarCaso3d,
  caso3dErrors,
  type Caso3D,
  type EscenaSpec,
  type Resultado,
} from "@croquis/scene-schema";
import { escenarioDe } from "@/components/visor-unity/escenario";

/** La malla de relieve tal como la guarda `Reconstruccion.relieve` (la misma forma que `caso3d.relieve`). */
export type RelieveCaso = Parameters<typeof armarCaso3d>[2];

/**
 * Arma y valida el paquete. Lanza si no cumple el esquema: un paquete inválido no se le manda a
 * Unity (contestaría `caso_invalido`) y la web abre el respaldo.
 */
export function paqueteDelCaso(
  escena: EscenaSpec,
  resultado: Resultado,
  relieve: RelieveCaso = null,
): Caso3D {
  const paquete = armarCaso3d(escena, resultado, relieve ?? null, escenarioDe(escena, resultado));
  const errores = caso3dErrors(paquete);
  if (errores.length) {
    throw new Error(`Paquete caso-3d inválido: ${errores.slice(0, 3).join("; ")}`);
  }
  return paquete;
}

/** Nombre del archivo de «Descargar paquete 3D»: el id de la escena, sin caracteres raros. */
export function nombreDelPaquete(escena: EscenaSpec): string {
  const id = String(escena.meta?.id ?? "caso").replace(/[^\w.-]+/g, "_");
  return `${id}.caso3d.json`;
}
