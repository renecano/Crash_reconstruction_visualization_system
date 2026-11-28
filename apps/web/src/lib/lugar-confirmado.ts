/**
 * Dónde se propone la escena (René, 2026-11-27; #388): nunca en un punto por omisión. Alberto
 * encontró casos que caían en el Zócalo de la CDMX (el centro con que nace el mapa) o en el centro de
 * otra ciudad, sin aviso. La escena se propone solo en:
 * - el lugar guardado del caso (los ejemplos, un caso abierto que ya lo trae), o
 * - el lugar que confirmó el perito: «Sí, aquí fue» sobre lo que encontró Croquis, unas coordenadas o
 *   un link que pegó, una opción que eligió, o «Aquí fue» después de mover el mapa él mismo.
 * Lo que Croquis encontró solo y el centro del mapa no bastan: el perito confirma antes de La escena.
 */
import type { Punto } from "./escena-facil";

export interface FuentesDelLugar {
  /** El lugar guardado del caso. */
  guardado: Punto | null;
  /** El que confirmó el perito. */
  confirmado: Punto | null;
  /** Lo que encontró Croquis en la narración, sin confirmar (solo para mostrarlo). */
  encontrado?: Punto | null;
  /** El centro del mapa (solo para mostrarlo; nunca se propone ahí). */
  centroMapa?: Punto | null;
}

/** El lugar donde se puede proponer la escena, o null: entonces se pregunta. */
export function lugarParaProponer(f: FuentesDelLugar): Punto | null {
  return f.guardado ?? f.confirmado ?? null;
}

/** «Croquis encontró: [qué] · [cómo] · [qué tan seguro]» de un resultado de `/api/lugar`. */
export function textoDelHallazgo(r: {
  nombre: string;
  precision?: "cruce" | "calle" | "zona";
  aviso?: string | null;
  opciones?: number;
}): { texto: string; seguridad: "alta" | "media" | "baja" } {
  const km = /OpenStreetMap no tiene (?:el km|el kil[oó]metro)/i.test(r.aviso ?? "");
  const como =
    r.precision === "cruce"
      ? "el cruce de las dos calles en OpenStreetMap"
      : km
        ? "la carretera; OpenStreetMap no tiene el kilómetro"
        : r.precision === "calle"
          ? "solo la calle, no el punto"
          : "la zona, no el punto";
  const seguridad: "alta" | "media" | "baja" =
    r.precision === "cruce" && (r.opciones ?? 1) <= 1 && !/no respondi/i.test(r.aviso ?? "")
      ? "alta"
      : r.precision === "cruce"
        ? "media"
        : "baja";
  const seguro = {
    alta: "seguro",
    media: "revisa que sea el del hecho",
    baja: "poco seguro: muévelo al punto",
  }[seguridad];
  return { texto: `Croquis encontró: ${r.nombre} · ${como} · ${seguro}`, seguridad };
}
