/**
 * Lo que el perito edita en el 3D de Unity (U6, C2 y C1), llevado al expediente. Unity solo manda
 * dónde quedó un objeto o qué punto marcó, en metros de la escena; aquí se pasa al mapa (latitud y
 * longitud con el mismo origen que la reconstrucción) con las mismas funciones que la escena fácil.
 * Después, el caso se recalcula como con cualquier otro cambio.
 */
import {
  cambiarTamano,
  desdeMetros,
  girarObjeto,
  moverObjeto,
  objetosDe,
  TIPOS_OBJETO,
  type Expediente,
  type LonLat,
} from "@croquis/cesvi";
import type { MensajesDeUnity } from "@croquis/scene-schema";
import {
  agregarChoqueIntermedio,
  agregarPuntoDePaso,
  marcarPrimerGolpe,
  OBJETOS_C1,
  type ImpactoAColocar,
} from "@/lib/escena-facil";

export interface EdicionAplicada {
  expediente: Expediente;
  /** Qué cambió, para la línea de estado; o por qué no se pudo. */
  mensaje: string;
  cambio: boolean;
}

const normalizar = (g: number) => ((g % 360) + 360) % 360;

/** El objeto de un choque intermedio como lo nombra la escena fácil (`OBJETOS_C1`). */
const OBJETO_C1: Record<string, (typeof OBJETOS_C1)[number]["id"]> = {
  poste: "poste",
  muro: "pared",
  arbol: "árbol",
  barrera: "barrera",
  guarnicion: "guarnición",
  senal: "señal",
  vehiculo_estacionado: "vehículo estacionado",
};

/** Rumbo de la escena (antihorario desde el este) a rumbo del mapa (horario desde el norte). */
export function rumboDelMapa(rumboEscenaDeg: number): number {
  return normalizar(90 - rumboEscenaDeg);
}

function punto(x: number, y: number, origen: LonLat) {
  const [lon, lat] = desdeMetros(x, y, origen);
  return { lat, lon };
}

/** `objetoEditado`: el objeto colocado va a su lugar, rumbo y largo nuevos. */
export function aplicarObjetoEditado(
  e: Expediente,
  origen: LonLat | null,
  m: MensajesDeUnity["objetoEditado"],
): EdicionAplicada {
  const o = objetosDe(e).find((x) => x.id === m.id);
  if (!o || !origen) {
    return {
      expediente: e,
      cambio: false,
      mensaje: "Ese objeto no lo colocaste tú (viene del mapa o del choque): muévelo en «La escena».",
    };
  }
  let x = moverObjeto(e, o.id, punto(m.x, m.y, origen));
  const giro = rumboDelMapa(m.rumbo_deg) - o.rumbo;
  if (Math.abs(((giro + 540) % 360) - 180) > 0.05) x = girarObjeto(x, o.id, giro);
  const alargado = TIPOS_OBJETO.find((t) => t.tipo === o.tipo)?.alargado ?? false;
  if (alargado && o.largo > 0 && Math.abs(m.largo - o.largo) > 0.01) {
    x = cambiarTamano(x, o.id, m.largo / o.largo);
  }
  return { expediente: x, cambio: true, mensaje: `Moviste ${o.nombre.toLowerCase()}: se recalcula.` };
}

/** `puntoMarcado`: el primer golpe, un choque intermedio o un punto de paso, como en la escena fácil. */
export function aplicarPuntoMarcado(
  e: Expediente,
  origen: LonLat | null,
  m: MensajesDeUnity["puntoMarcado"],
  impactos: readonly ImpactoAColocar[] = [],
): EdicionAplicada {
  if (!origen) {
    return {
      expediente: e,
      cambio: false,
      mensaje: "Coloca primero a los vehículos en el impacto: sin eso no hay dónde medir.",
    };
  }
  const p = punto(m.x, m.y, origen);
  if (m.tipo === "punto_inicial") {
    return {
      expediente: marcarPrimerGolpe(e, impactos, p),
      cambio: true,
      mensaje: "Marcaste el primer golpe: se recalcula.",
    };
  }
  if (!m.vehiculo_id) {
    return { expediente: e, cambio: false, mensaje: "Elige primero de qué vehículo es el punto." };
  }
  if (m.tipo === "punto_paso") {
    return {
      expediente: agregarPuntoDePaso(e, m.vehiculo_id, p),
      cambio: true,
      mensaje: "Agregaste un punto de paso: se recalcula.",
    };
  }
  const objeto = m.objeto_id ? objetosDe(e).find((o) => o.id === m.objeto_id) : undefined;
  const c1 = OBJETOS_C1.find((o) => o.id === (objeto ? OBJETO_C1[objeto.tipo] : undefined));
  if (!c1) {
    return {
      expediente: e,
      cambio: false,
      mensaje: "Toca el objeto contra el que chocó (un poste, una pared, un árbol…).",
    };
  }
  return {
    expediente: agregarChoqueIntermedio(e, m.vehiculo_id, c1.id, p),
    cambio: true,
    mensaje: `Marcaste un choque contra ${c1.con}: se recalcula.`,
  };
}
