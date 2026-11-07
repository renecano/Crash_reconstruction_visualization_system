/**
 * El paquete caso-3d (plan v4 §2.1): la única entrada del visor Unity. El mismo paquete sirve para
 * el puente web → Unity, para el botón «Descargar paquete 3D» y para `fixtures/caso3d/`.
 */
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import caso3dSchema from "../caso3d.schema.json";
import escenaSchema from "../escena.schema.json";
import resultadoSchema from "../resultado.schema.json";
import {
  CASO3D_VERSION,
  type Caso3D,
  type Convenciones,
  type Relieve,
} from "./generated/caso3d.zod";
import type { EscenaSpec } from "./generated/escena.zod";
import type { Resultado } from "./generated/resultado.zod";

export { CASO3D_VERSION, type Caso3D, type Convenciones, type Relieve };

/** Cómo leer los números del paquete (fijas en esta versión). */
export const CONVENCIONES: Convenciones = {
  ejes: "x_este_y_norte_z_arriba",
  angulos_resultado: "radianes_antihorario_desde_x",
  angulos_escena: "grados_antihorario_desde_x",
  tiempo: "segundos_t0_impacto_principal",
  longitud: "metros",
  unity: "posicion_x_z_y_yaw_90_menos_rumbo_grados",
};

/** Lo que un relieve debe cumplir además del esquema; vacío si está bien. */
export function erroresDeRelieve(r: Relieve): string[] {
  const out: string[] = [];
  if (r.alturas_m.length !== r.ancho * r.alto) {
    out.push(
      `La malla dice ${r.ancho} × ${r.alto} nodos y trae ${r.alturas_m.length} alturas: deben ser ${r.ancho * r.alto}.`,
    );
  }
  if (!r.alturas_m.every(Number.isFinite)) out.push("La malla trae alturas que no son números.");
  return out;
}

/**
 * Arma el paquete. No copia ni corrige nada: si la escena, el resultado y el relieve no son del
 * mismo caso, lanza un error en vez de entregar un paquete que el visor dibujaría mal.
 */
export function armarCaso3d(
  escena: EscenaSpec,
  resultado: Resultado,
  relieve?: Relieve | null,
): Caso3D {
  if (resultado.escena_id !== escena.meta.id) {
    throw new Error(
      `El resultado es de la escena «${resultado.escena_id}» y la escena es «${escena.meta.id}».`,
    );
  }
  if (relieve) {
    const errores = erroresDeRelieve(relieve);
    if (errores.length) throw new Error(errores.join(" "));
  }
  const malla = escena.lugar.terreno?.relieve?.malla_id;
  if (malla && relieve?.id !== malla) {
    throw new Error(
      `La escena pide la malla «${malla}» y ${relieve ? `el relieve es «${relieve.id}»` : "no llegó ningún relieve"}.`,
    );
  }
  return {
    version_caso3d: CASO3D_VERSION,
    escena,
    resultado,
    ...(relieve ? { relieve } : {}),
    convenciones: CONVENCIONES,
  };
}

let ajvInstance: Ajv2020 | undefined;

function ajv(): Ajv2020 {
  if (!ajvInstance) {
    ajvInstance = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajvInstance);
    ajvInstance.addSchema(escenaSchema);
    ajvInstance.addSchema(resultadoSchema);
    ajvInstance.addSchema(caso3dSchema);
  }
  return ajvInstance;
}

/** Errores de un paquete contra `caso3d.schema.json`, como `ruta: mensaje`, ordenados. */
export function caso3dErrors(data: unknown): string[] {
  const validate = ajv().getSchema(caso3dSchema.$id);
  if (!validate) throw new Error("No se pudo compilar caso3d.schema.json");
  if (validate(data)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "/"}: ${e.message}`).sort();
}
