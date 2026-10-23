/**
 * El caso de «Caso nuevo» guardado en un archivo y vuelto a abrir (ADR 0075): la narración, la
 * escena leída, el expediente con lo que marcó el perito y su validación.
 *
 * La validación va en los campos del contrato (`resultado.validado_por`, `fecha_validacion`,
 * `huella_entradas`); la conclusión del perito, que el contrato no tiene como texto, va junto al
 * expediente. La huella es la de las entradas sin el resultado: si el perito cambia la narración o
 * el expediente después de validar, la validación ya no vale y el dictamen vuelve a ser borrador.
 */
import { problemasExpediente, type EscenaNarrada, type Expediente } from "@croquis/cesvi";
import { huellaEntradas } from "./exportar-cesvi";

export const FORMATO_CASO = "croquis-caso";
export const VERSION_CASO = 1;

export interface ValidacionPerito {
  perito: string;
  conclusion: string;
  /** ISO 8601. */
  fecha: string;
  /** La huella de las entradas que validó (`huellaDelCaso`). */
  huella: string;
}

export interface CasoGuardado {
  formato: typeof FORMATO_CASO;
  version: typeof VERSION_CASO;
  guardado: string;
  /** La narración del perito (null en un reporte importado). */
  narracion: string | null;
  escena: Omit<EscenaNarrada, "expediente">;
  expediente: Expediente;
  conclusion_perito: string | null;
}

export interface CasoAbierto {
  narracion: string | null;
  /** Cuándo se guardó (ISO 8601). */
  guardado: string;
  escena: EscenaNarrada;
  expediente: Expediente;
  validacion: ValidacionPerito | null;
}

/** El expediente sin su resultado: lo que el perito valida. */
const sinResultado = (e: Expediente): Expediente => {
  const copia = { ...e };
  delete copia.resultado;
  return copia;
};

/** La huella de las entradas del caso: la narración y el expediente, sin el resultado. */
export function huellaDelCaso(expediente: Expediente, narracion: string | null): string {
  return huellaEntradas({ expediente: sinResultado(expediente), narracion });
}

/** Si la validación es de estas mismas entradas. */
export function validacionVigente(
  v: ValidacionPerito | null,
  expediente: Expediente,
  narracion: string | null,
): v is ValidacionPerito {
  return v !== null && v.huella === huellaDelCaso(expediente, narracion);
}

export function casoParaGuardar(c: {
  narracion: string | null;
  escena: EscenaNarrada;
  expediente: Expediente;
  validacion: ValidacionPerito | null;
  ahora?: Date;
}): CasoGuardado {
  const { posiciones, conteos, problemas, preguntas } = c.escena;
  const base = sinResultado(c.expediente);
  const v = validacionVigente(c.validacion, c.expediente, c.narracion) ? c.validacion : null;
  return {
    formato: FORMATO_CASO,
    version: VERSION_CASO,
    guardado: (c.ahora ?? new Date()).toISOString(),
    narracion: c.narracion,
    escena: { posiciones, conteos, problemas, preguntas },
    expediente: v
      ? {
          ...base,
          resultado: {
            ...c.expediente.resultado,
            validado_por: v.perito,
            fecha_validacion: v.fecha,
            huella_entradas: v.huella,
          },
        }
      : base,
    conclusion_perito: v?.conclusion ?? null,
  };
}

/** Lee un archivo de caso; devuelve el motivo si no es uno válido. */
export function leerCasoGuardado(datos: unknown): CasoAbierto | { error: string } {
  const c = datos as Partial<CasoGuardado> | null;
  if (!c || typeof c !== "object" || c.formato !== FORMATO_CASO)
    return { error: "El archivo no es un caso de Croquis." };
  if (c.version !== VERSION_CASO)
    return { error: `El caso es de la versión ${String(c.version)}; esta es la ${VERSION_CASO}.` };
  if (!c.expediente || !c.escena || !(typeof c.narracion === "string" || c.narracion === null))
    return { error: "Al caso le falta la narración, la escena o el expediente." };
  const problemas = problemasExpediente(c.expediente);
  if (problemas.length) return { error: `El expediente no es válido: ${problemas[0]}` };
  const expediente = sinResultado(c.expediente);
  const r = c.expediente.resultado;
  const validacion =
    r?.validado_por && r.fecha_validacion && r.huella_entradas && c.conclusion_perito
      ? {
          perito: r.validado_por,
          conclusion: c.conclusion_perito,
          fecha: r.fecha_validacion,
          huella: r.huella_entradas,
        }
      : null;
  return {
    narracion: c.narracion,
    guardado: String(c.guardado ?? ""),
    escena: { ...c.escena, expediente },
    expediente,
    validacion,
  };
}
