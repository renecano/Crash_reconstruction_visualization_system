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
import { viaWidthM } from "@croquis/scene-schema";
import {
  ajustarACalle,
  normalizar,
  poseDe,
  sobreCalle,
  type Calle,
  type Punto,
} from "./escena-facil";

/** Los objetos que están en la orilla. */
export const OBJETO_DE_ORILLA =
  /[aá]rbol|poste|muro|barda|pared|barrera|defensa|guarnici|se[ñn]al|luminaria|sem[aá]foro|caseta|fachada|reja|malla|contenci|talud|camell[oó]n|banqueta|jardinera|hidrante|parada|castillo|columna|pilar|parapeto|obra\s+negra|construcci[oó]n|cerca|port[oó]n|zagu[aá]n|anuncio|espectacular/i;
/**
 * Lo que sí está sobre el arroyo de la calle (revisión de la cadena, 2026-11-24: 8 de los 205
 * reportes): un bache, un registro, una coladera, un desagüe, un tope, unas boyas, una roca o un
 * «cuerpo duro» sin identificar. No se lleva a la orilla.
 */
export const OBJETO_DEL_ARROYO =
  /bache|registro|coladera|desag[uü]e|alcantarilla|tope|vibrador|boya|roca|piedra|cuerpo\s+duro|superficie|pavimento|carpeta/i;

/** Si el objeto del choque va en la orilla (y no en el arroyo). */
export const esObjetoDeOrilla = (objeto: string) =>
  OBJETO_DE_ORILLA.test(objeto) && !OBJETO_DEL_ARROYO.test(objeto);

/** El ancho de la calzada como lo dibuja el 3D (`viaWidthM`): `width` de OSM o carriles por tipo. */
export function anchoComoEl3d(c: Calle): number {
  return viaWidthM({
    tipo: c.tipo ?? "residential",
    ...(c.carriles !== undefined ? { carriles: c.carriles } : {}),
    ...(c.anchoOsm !== undefined ? { ancho_m: c.anchoOsm } : {}),
  });
}

/** Si un punto cae sobre la calzada de alguna calle (con el ancho del 3D). */
function sobreAlgunaCalzada(calles: readonly Calle[], p: Punto, holgura = 0.2): boolean {
  return calles.some((c) => sobreCalle(c, p).distancia < anchoComoEl3d(c) / 2 + holgura);
}

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
  if (!esObjetoDeOrilla(imp.objeto_fijo)) return null;
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
  const forzado = giro === 90 || giro === -90 || narrada !== null;
  let lado: Orilla["lado"] =
    giro === 90 ? "derecha" : giro === -90 ? "izquierda" : (narrada?.lado ?? "derecha");
  // La calle corre en el sentido de la marcha (o el contrario): se toma el que más se le parece.
  const dif = Math.abs(((sobre.rumbo - marcha + 540) % 360) - 180);
  const eje = dif <= 90 ? sobre.rumbo : normalizar(sobre.rumbo + 180);
  // La orilla con el ancho que dibuja el 3D. En un cruce, la orilla de una calle es el arroyo de la
  // otra: el choque se recorre hacia atrás por la calle, de 2 en 2 m, hasta que el objeto quede fuera
  // de toda calzada (hasta 40 m).
  const fuera = anchoComoEl3d(sobre.calle) / 2 + FUERA_DEL_BORDE_M;
  const base: LonLat = [sobre.punto.lon, sobre.punto.lat];
  // Si la orilla cae en una calzada paralela (la lateral de una avenida con camellón: «al lado derecho
  // de la avenida», cesvi-ebb5c029a8), el objeto sigue hacia afuera, metro a metro, hasta la banqueta
  // (hasta 20 m más). Solo después se recorre hacia atrás.
  const enLaOrilla = (signo: number): { objeto: LonLat; libre: boolean; movido: number } => {
    const primero = avanzar(base, normalizar(eje + 90 * signo), fuera);
    for (let atras = 0; atras <= 40; atras += 2) {
      const centro = atras ? avanzar(base, normalizar(eje + 180), atras) : base;
      for (let mas = 0; mas <= 20; mas += 1) {
        const objeto = avanzar(centro, normalizar(eje + 90 * signo), fuera + mas);
        if (!sobreAlgunaCalzada(calles, { lon: objeto[0], lat: objeto[1] }))
          return { objeto, libre: true, movido: atras + mas };
      }
    }
    return { objeto: primero, libre: false, movido: Infinity };
  };
  let s = lado === "derecha" ? 1 : -1;
  const primera = enLaOrilla(s);
  let objeto = primera.objeto;
  // Si nadie dijo el lado y esa orilla es el arroyo de otra calle (una lateral junto a la avenida,
  // revisión de la cadena aud-05), el objeto va en la orilla libre más cercana.
  if (primera.movido > 0 && !forzado) {
    const otra = enLaOrilla(-s);
    if (otra.libre && otra.movido < primera.movido) {
      s = -s;
      lado = lado === "derecha" ? "izquierda" : "derecha";
      objeto = otra.objeto;
    }
  }
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
