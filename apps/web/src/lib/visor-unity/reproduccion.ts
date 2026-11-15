/**
 * La reproducción del 3D de Unity desde la web (auditoría del 2026-11-15, I3): qué mensajes del
 * puente manda cada control. La barra es la misma que la de la maqueta 2D (reproducir, deslizador,
 * velocidad) más «Ir al impacto» y «Ver todo». Unity solo reproduce: aquí no se calcula nada.
 */
import type { MensajesAUnity } from "@croquis/scene-schema";

export const VELOCIDADES = [0.25, 0.5, 1] as const;
export type Velocidad = (typeof VELOCIDADES)[number];

/** «¼×», «½×», «1×». */
export function etiquetaVelocidad(x: Velocidad): string {
  return x === 0.25 ? "¼×" : x === 0.5 ? "½×" : "1×";
}

/** Lo que el control le pide a Unity, en orden. */
export type Orden = {
  [K in keyof MensajesAUnity]: { mensaje: K; datos: MensajesAUnity[K] };
}[keyof MensajesAUnity];

export interface EstadoReproduccion {
  /** El instante que muestra Unity (0 es el impacto principal). */
  t: number;
  /** El perito lo pausó (aparte de que el 3D esté o no a la vista). */
  pausado: boolean;
  velocidad: Velocidad;
}

export const ESTADO_INICIAL: EstadoReproduccion = { t: 0, pausado: false, velocidad: 1 };

/** El intervalo del Resultado que se reproduce. */
export interface Intervalo {
  inicio: number;
  fin: number;
}

export type Accion =
  | { tipo: "alternar" }
  | { tipo: "ir"; t: number }
  | { tipo: "velocidad"; x: Velocidad }
  | { tipo: "impacto" }
  | { tipo: "todo" }
  | { tipo: "repetir" }
  /** Unity avisa por dónde va. */
  | { tipo: "tiempo"; t: number };

const acota = (t: number, i: Intervalo) => Math.min(i.fin, Math.max(i.inicio, t));

/**
 * El estado que sigue y lo que hay que mandarle a Unity. Mover el deslizador o ir al impacto pausa:
 * el perito quiere ver ese instante, no que siga corriendo.
 */
export function reproducir(
  e: EstadoReproduccion,
  a: Accion,
  i: Intervalo,
): { estado: EstadoReproduccion; ordenes: Orden[] } {
  switch (a.tipo) {
    case "tiempo":
      return { estado: { ...e, t: acota(a.t, i) }, ordenes: [] };
    case "alternar": {
      if (!e.pausado) return { estado: { ...e, pausado: true }, ordenes: [orden("pausar", {})] };
      // Al final, reproducir vuelve a empezar.
      const alFinal = e.t >= i.fin - 1e-3;
      return {
        estado: { ...e, pausado: false, t: alFinal ? i.inicio : e.t },
        ordenes: [
          ...(alFinal ? [orden("fijarTiempo", { t: i.inicio })] : []),
          orden("reproducir", {}),
        ],
      };
    }
    case "ir": {
      const t = acota(a.t, i);
      return {
        estado: { ...e, t, pausado: true },
        ordenes: [orden("pausar", {}), orden("fijarTiempo", { t })],
      };
    }
    case "velocidad":
      return { estado: { ...e, velocidad: a.x }, ordenes: [orden("velocidad", { x: a.x })] };
    case "impacto": {
      const t = acota(0, i);
      return {
        estado: { ...e, t, pausado: true },
        ordenes: [
          orden("pausar", {}),
          orden("fijarTiempo", { t }),
          orden("encuadrar", { zona: "impacto" }),
        ],
      };
    }
    case "todo":
      return { estado: e, ordenes: [orden("encuadrar", { zona: "todo" })] };
    case "repetir":
      return {
        estado: { ...e, t: i.inicio, pausado: false },
        ordenes: [orden("fijarTiempo", { t: i.inicio }), orden("reproducir", {})],
      };
  }
}

function orden<K extends keyof MensajesAUnity>(mensaje: K, datos: MensajesAUnity[K]): Orden {
  return { mensaje, datos } as Orden;
}
