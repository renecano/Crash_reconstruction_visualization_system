/**
 * El objeto fijo del choque, en la orilla (René, 2026-11-24, punto 1): un árbol, un poste, un muro o
 * una barrera están en la banqueta, el camellón o el acotamiento, no en medio de la calle. La escena
 * ponía al vehículo sobre el eje de la calle y el objeto frente a su cara de contacto: el objeto
 * quedaba sobre un carril. Aquí el objeto va en la orilla del lado que dice la narración (o en la
 * más cercana a su carril, la derecha, si no lo dice) y el vehículo, inclinado hacia ella: sale de su
 * carril para alcanzarlo. Si la narración dice que el objeto estaba sobre el carril, no se mueve.
 */
import {
  avanzar,
  conPosicion,
  medidasDe,
  rumboDeMarcha,
  type Expediente,
  type LonLat,
} from "@croquis/cesvi";
import { ajustarACalle, normalizar, poseDe, type Calle, type Punto } from "./escena-facil";

/** Los objetos que están en la orilla. */
export const OBJETO_DE_ORILLA =
  /[aá]rbol|poste|muro|barda|pared|barrera|defensa|guarnici|se[ñn]al|luminaria|sem[aá]foro|caseta|fachada|reja|malla|contenci|talud|camell[oó]n|banqueta|jardinera|hidrante|parada/i;

/** La narración dice que el objeto estaba sobre la calle: no se lleva a la orilla. */
export const EN_EL_CARRIL =
  /en\s+medio\s+de\s+(?:la|el)\s+(?:calle|carril|arroyo|v[ií]a|carretera|avenida)|sobre\s+(?:el|la)\s+(?:carril|arroyo|superficie\s+de\s+rodamiento)|ca[ií]do\s+sobre\s+(?:la|el)\s+(?:calle|carril|v[ií]a)/i;

/** Cuánto se inclina el vehículo hacia la orilla para alcanzar el objeto (grados). */
export const INCLINACION_DEG = 20;
/** Del borde de la calle al objeto (m): la guarnición y medio tronco o poste. */
const FUERA_DEL_BORDE_M = 0.6;

const GIRO_CARA: Record<string, number> = {
  frontal: 0,
  posterior: 180,
  lateral_izquierdo: -90,
  lateral_derecho: 90,
};

export interface Orilla {
  lado: "derecha" | "izquierda";
  /** La cita de la narración que dice el lado, o null si se tomó la orilla más cercana. */
  cita: string | null;
}

/** De qué lado estaba el objeto, según la narración. */
export function ladoDeLaOrilla(narracion: string | null): Orilla | null {
  if (!narracion) return null;
  const m =
    /(?:[^.;]{0,80}\b(?:hacia|a|por|sobre|en)\s+(?:la|su)\s+(?:orilla\s+|acera\s+|banqueta\s+)?(derecha|izquierda)\b[^.;]{0,40})|(?:[^.;]{0,80}\blado\s+(derecho|izquierdo)\b[^.;]{0,40})/i.exec(
      narracion,
    );
  if (m) {
    const lado = /derech/i.test(m[1] ?? m[2] ?? "") ? "derecha" : "izquierda";
    return { lado, cita: m[0].trim() };
  }
  // El camellón está a la izquierda en una calle con camellón; la banqueta y el acotamiento, a la derecha.
  const c = /[^.;]{0,60}\bcamell[oó]n\b[^.;]{0,30}/i.exec(narracion);
  if (c) return { lado: "izquierda", cita: c[0].trim() };
  return null;
}

/**
 * Lleva el objeto del primer choque a la orilla y coloca al vehículo contra él. Devuelve el
 * expediente sin cambios si el choque no es de un vehículo contra un objeto de orilla, si no hay
 * calle bajo el choque o si la narración dice que el objeto estaba sobre el carril.
 */
export function contraLaOrilla(
  e: Expediente,
  calles: readonly Calle[],
  narracion: string | null,
): {
  expediente: Expediente;
  lado: Orilla["lado"];
  cita: string | null;
  calle: string | null;
} | null {
  const imp = [...(e.impactos ?? [])].sort((a, b) => (a.orden ?? 1) - (b.orden ?? 1))[0];
  if (!imp?.objeto_fijo || (imp.vehiculos ?? []).length !== 1) return null;
  if (!OBJETO_DE_ORILLA.test(imp.objeto_fijo)) return null;
  if (narracion && EN_EL_CARRIL.test(narracion)) return null;
  const v = String(imp.vehiculos![0]);
  const pose = poseDe(e, v, "impacto");
  const veh = e.vehiculos.find((x) => x.id === v);
  if (!pose || !veh) return null;
  const sobre = ajustarACalle(calles, pose.punto);
  if (!sobre) return null;
  const marcha = rumboDeMarcha(e, v, pose.rumbo);
  const cara =
    imp.zonas?.find((z) => z.vehiculo === v)?.zona.cara ??
    (e.danos ?? []).find((d) => d.vehiculo === v && !d.dano_previo)?.zona.cara ??
    "frontal";
  const giro = GIRO_CARA[cara] ?? 0;
  const narrada = ladoDeLaOrilla(narracion);
  // Un golpe de lado es contra la orilla de ese lado.
  const lado: Orilla["lado"] =
    giro === 90 ? "derecha" : giro === -90 ? "izquierda" : (narrada?.lado ?? "derecha");
  const s = lado === "derecha" ? 1 : -1;
  // La calle corre en el sentido de la marcha (o el contrario): se toma el que más se le parece.
  const dif = Math.abs(((sobre.rumbo - marcha + 540) % 360) - 180);
  const eje = dif <= 90 ? sobre.rumbo : normalizar(sobre.rumbo + 180);
  const centro: LonLat = [sobre.punto.lon, sobre.punto.lat];
  const objeto = avanzar(
    centro,
    normalizar(eje + 90 * s),
    sobre.calle.ancho / 2 + FUERA_DEL_BORDE_M,
  );
  // De frente o de reversa: inclinado hacia la orilla. De lado: paralelo a la calle.
  const lateral = giro === 90 || giro === -90;
  const marchaNueva = lateral ? eje : normalizar(eje + INCLINACION_DEG * s);
  const frente = normalizar(pose.rumbo + (marchaNueva - marcha));
  const m = medidasDe(veh);
  const d = (lateral ? m.ancho : m.largo) / 2 + 0.15;
  const c = avanzar(objeto, normalizar(frente + giro + 180), d);
  const punto: Punto = { lon: c[0], lat: c[1] };
  return {
    expediente: conPosicion(e, {
      vehiculo: v as never,
      fase: "impacto",
      punto,
      rumbo: frente,
      fuente: "supuesto",
    }),
    lado,
    cita: lateral ? null : (narrada?.cita ?? null),
    calle: sobre.calle.nombre,
  };
}
