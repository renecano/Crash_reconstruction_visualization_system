/**
 * Corregir después, con lo ya colocado en la mano (René, 2026-11-17): al tocar un vehículo, un objeto
 * del lugar, una pieza del terreno o una marca, queda seleccionado y se mueve, se gira o se quita las
 * veces que sea, con el ratón, con el dedo o con el teclado. Aquí va la lógica sin interfaz.
 *
 * Nada de esto toca la física: solo lleva las mismas funciones de edición de la escena fácil
 * (`marcarFinal`, `moverObjeto`, `girarTerreno`…) a una clave de selección. El solver recibe lo mismo
 * que si el perito lo hubiera colocado así desde el principio.
 *
 * Las claves son las del mapa de la escena: «coche:V1», «objeto:obj-1», «terreno:zona-1»,
 * «marca:golpe», «marca:objeto-2» (un choque intermedio) y «marca:paso-V1-1» (un punto de paso).
 * Un peatón o un ciclista (A3, René, 2026-11-18): «persona:per-1» y dónde quedó, «persona:per-1:final».
 */
import {
  avanzar,
  girarObjeto,
  girarPersona,
  girarTerreno,
  marcarFinalPersona,
  moverObjeto,
  moverPersona,
  moverTerreno,
  objetosDe,
  OBJETO_PERSONA,
  piezasTerreno,
  quitarObjeto,
  quitarPersona,
  quitarTerreno,
  type Expediente,
  type LonLat,
  type PersonaExpediente,
  type RolPersona,
} from "@croquis/cesvi";
import { PASO_BOTON_GRADOS, PASO_TECLA_GRADOS, normalizar } from "./colocar";
import {
  choquesIntermedios,
  girar,
  marcarFinal,
  marcarPrimerGolpe,
  moverChoqueIntermedio,
  moverPuntoDePaso,
  poseDe,
  primerGolpe,
  puntosDePaso,
  quitarChoqueIntermedio,
  quitarPrimerGolpe,
  quitarPuntoDePaso,
  sinFinal,
  type ImpactoAColocar,
  type Punto,
} from "./escena-facil";

/** Lo que mueve una flecha del teclado (m); con Shift, el paso grande. */
export const PASO_FLECHA_M = 0.5;
export const PASO_FLECHA_GRANDE_M = 2;

export type TipoSeleccion = "coche" | "objeto" | "terreno" | "marca" | "persona";

/** «coche:V1» → { tipo: "coche", id: "V1" } (el id puede llevar dos puntos o guiones). */
export function deClave(clave: string): { tipo: string; id: string } {
  const i = clave.indexOf(":");
  return i < 0 ? { tipo: clave, id: "" } : { tipo: clave.slice(0, i), id: clave.slice(i + 1) };
}

const PASO = /^paso-(.+)-(\d+)$/;
const INTERMEDIO = /^objeto-(\d+)$/;
/** Dónde quedó una persona (A3): «persona:per-1:final». */
const FINAL_PERSONA = /^(.+):final$/;

/** La persona de una clave «persona:…» y si la clave es su punto final. */
function personaDe(
  e: Expediente,
  id: string,
): { persona: PersonaExpediente; final: boolean } | null {
  const f = FINAL_PERSONA.exec(id);
  const pid = f ? f[1]! : id;
  const persona = (e.personas ?? []).find((p) => p.id === pid);
  if (!persona || (f && !persona.final)) return null;
  return { persona, final: Boolean(f) };
}

/**
 * Cómo se gira lo seleccionado: con su rumbo (un vehículo en reposo, un objeto), desde donde está (el
 * terreno, que no guarda un rumbo propio) o no se gira (un punto).
 */
export type Giro = "absoluto" | "relativo" | null;

export interface Capacidades {
  mover: boolean;
  girar: Giro;
  quitar: boolean;
}

const NADA: Capacidades = { mover: false, girar: null, quitar: false };

/** Qué se le puede hacer a lo seleccionado en este expediente (nada, si ya no existe). */
export function capacidadesDe(e: Expediente, clave: string): Capacidades {
  const { tipo, id } = deClave(clave);
  if (tipo === "coche") {
    // Solo el vehículo en reposo se mueve, se gira o se quita: el del impacto se corrige con su
    // pregunta, porque de él dependen el choque y las flechas de llegada (W4).
    return poseDe(e, id, "final") ? { mover: true, girar: "absoluto", quitar: true } : NADA;
  }
  if (tipo === "objeto")
    return objetosDe(e).some((o) => o.id === id)
      ? { mover: true, girar: "absoluto", quitar: true }
      : NADA;
  if (tipo === "terreno")
    return piezasTerreno(e).some((t) => t.id === id)
      ? { mover: true, girar: "relativo", quitar: true }
      : NADA;
  if (tipo === "marca")
    return posicionDe(e, clave) ? { mover: true, girar: null, quitar: true } : NADA;
  if (tipo === "persona") {
    // La persona se gira (hacia dónde iba); dónde quedó es un punto: se mueve o se borra.
    const x = personaDe(e, id);
    if (!x) return NADA;
    return { mover: true, girar: x.final ? null : "absoluto", quitar: true };
  }
  return NADA;
}

/** Dónde está lo seleccionado y, si tiene, su rumbo (grados desde el norte). */
export function posicionDe(
  e: Expediente,
  clave: string,
): { punto: Punto; rumbo: number | null } | null {
  const { tipo, id } = deClave(clave);
  if (tipo === "coche") {
    const p = poseDe(e, id, "final") ?? poseDe(e, id, "impacto");
    return p ? { punto: p.punto, rumbo: p.rumbo } : null;
  }
  if (tipo === "objeto") {
    const o = objetosDe(e).find((x) => x.id === id);
    return o ? { punto: o.punto, rumbo: o.rumbo } : null;
  }
  if (tipo === "terreno") {
    const t = piezasTerreno(e).find((x) => x.id === id);
    return t ? { punto: t.centro, rumbo: null } : null;
  }
  if (tipo === "persona") {
    const x = personaDe(e, id);
    if (!x) return null;
    return x.final
      ? { punto: x.persona.final!, rumbo: null }
      : { punto: x.persona.punto, rumbo: x.persona.rumbo_deg ?? 0 };
  }
  if (tipo !== "marca") return null;
  if (id === "golpe") {
    const g = primerGolpe(e);
    return g ? { punto: g, rumbo: null } : null;
  }
  const q = PASO.exec(id);
  if (q) {
    const p = puntosDePaso(e, q[1]).find((x) => x.orden === Number(q[2]));
    return p ? { punto: p.punto, rumbo: null } : null;
  }
  const c = INTERMEDIO.exec(id);
  if (c) {
    const x = choquesIntermedios(e).find((i) => i.orden === Number(c[1]));
    return x ? { punto: x.punto, rumbo: null } : null;
  }
  return null;
}

/** Si lo seleccionado sigue en la escena (tras deshacer o rehacer puede ya no estar). */
export const existe = (e: Expediente, clave: string) => posicionDe(e, clave) !== null;

/**
 * Todo lo que se puede seleccionar, en el orden de la lista accesible: los vehículos, las personas
 * (y dónde quedó cada una), los objetos del lugar, el terreno y las marcas (primer golpe, choques
 * intermedios y puntos de paso).
 */
export function seleccionables(e: Expediente): string[] {
  return [
    ...e.vehiculos
      .filter((v) => poseDe(e, v.id, "final") || poseDe(e, v.id, "impacto"))
      .map((v) => `coche:${v.id}`),
    ...(e.personas ?? []).flatMap((p) =>
      p.final ? [`persona:${p.id}`, `persona:${p.id}:final`] : [`persona:${p.id}`],
    ),
    ...objetosDe(e).map((o) => `objeto:${o.id}`),
    ...piezasTerreno(e).map((t) => `terreno:${t.id}`),
    ...(primerGolpe(e) ? ["marca:golpe"] : []),
    ...choquesIntermedios(e).map((c) => `marca:objeto-${c.orden}`),
    ...puntosDePaso(e).map((q) => `marca:paso-${q.vehiculo}-${q.orden}`),
  ];
}

/**
 * Lleva lo seleccionado a otro punto (al soltarlo o con las flechas). Devuelve `null` si no se
 * puede mover (ya no existe o es un vehículo sin reposo).
 */
export function moverA(
  e: Expediente,
  impactos: readonly ImpactoAColocar[],
  clave: string,
  p: Punto,
): Expediente | null {
  if (!capacidadesDe(e, clave).mover) return null;
  const { tipo, id } = deClave(clave);
  if (tipo === "coche") return marcarFinal(e, id, p, poseDe(e, id, "final")!.rumbo);
  if (tipo === "objeto") return moverObjeto(e, id, p);
  if (tipo === "terreno") return moverTerreno(e, id, p);
  if (tipo === "persona") {
    const x = personaDe(e, id)!;
    return x.final ? marcarFinalPersona(e, x.persona.id, p) : moverPersona(e, id, p);
  }
  if (id === "golpe") return marcarPrimerGolpe(e, impactos, p);
  const q = PASO.exec(id);
  if (q) return moverPuntoDePaso(e, q[1]!, Number(q[2]), p);
  return moverChoqueIntermedio(e, Number(INTERMEDIO.exec(id)![1]), p);
}

/** Un punto llevado `metros` en el rumbo dado (0° = norte, 90° = este). */
export function desplazar(p: Punto, rumbo: number, metros: number): Punto {
  const [lon, lat] = avanzar([p.lon, p.lat] as LonLat, rumbo, metros);
  return { lat, lon };
}

/** Gira lo seleccionado `grados` desde donde está (horario, positivo). */
export function girarSeleccion(e: Expediente, clave: string, grados: number): Expediente | null {
  const giro = capacidadesDe(e, clave).girar;
  if (!giro || !grados) return null;
  const { tipo, id } = deClave(clave);
  if (tipo === "coche") return girar(e, id, "final", grados);
  if (tipo === "objeto") return girarObjeto(e, id, grados);
  if (tipo === "persona") return girarPersona(e, id, grados);
  return girarTerreno(e, id, grados);
}

/** Lo deja con ese rumbo (el anillo de giro). En el terreno, sin rumbo propio, no aplica. */
export function fijarRumbo(e: Expediente, clave: string, rumbo: number): Expediente | null {
  if (capacidadesDe(e, clave).girar !== "absoluto") return null;
  const actual = posicionDe(e, clave)?.rumbo ?? 0;
  const delta = normalizar(rumbo - actual);
  if (!delta) return null;
  // El giro más corto: así el objeto gira lo mismo que el anillo, y no da la vuelta entera.
  return girarSeleccion(e, clave, delta > 180 ? delta - 360 : delta);
}

/**
 * Lo quita de la escena. Un vehículo no se borra del caso (viene de la narración): se quita su
 * posición de reposo y la escena vuelve a preguntar dónde quedó. De una persona se puede quitar solo
 * dónde quedó («persona:per-1:final»): sigue en la escena, sin distancia de proyección.
 */
export function quitarSeleccion(e: Expediente, clave: string): Expediente | null {
  if (!capacidadesDe(e, clave).quitar) return null;
  const { tipo, id } = deClave(clave);
  if (tipo === "coche") return sinFinal(e, id);
  if (tipo === "objeto") return quitarObjeto(e, id);
  if (tipo === "terreno") return quitarTerreno(e, id);
  if (tipo === "persona") {
    const x = personaDe(e, id)!;
    return x.final ? marcarFinalPersona(e, x.persona.id, null) : quitarPersona(e, id);
  }
  if (id === "golpe") return quitarPrimerGolpe(e);
  const q = PASO.exec(id);
  if (q) return quitarPuntoDePaso(e, q[1]!, Number(q[2]));
  return quitarChoqueIntermedio(e, Number(INTERMEDIO.exec(id)![1]));
}

export type AccionTecla =
  | { tipo: "mover"; rumbo: number; metros: number }
  | { tipo: "girar"; grados: number }
  | { tipo: "quitar" }
  | { tipo: "soltar" }
  | { tipo: "deshacer" }
  | { tipo: "rehacer" };

const FLECHAS: Record<string, number> = {
  ArrowUp: 0,
  ArrowRight: 90,
  ArrowDown: 180,
  ArrowLeft: 270,
};

/**
 * La tecla que se oprimió, como acción de la escena. Sin selección solo cuentan Deshacer
 * (Ctrl/⌘+Z) y Rehacer (Ctrl/⌘+Shift+Z o Ctrl+Y). Con selección: las flechas la mueven (el mapa
 * tiene el norte arriba, así que arriba es el norte), Q y E la giran, Supr o Retroceso la quitan y
 * Esc la suelta.
 */
export function accionDeTecla(
  ev: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  haySeleccion: boolean,
): AccionTecla | null {
  const k = ev.key;
  const mando = Boolean(ev.ctrlKey || ev.metaKey);
  if (mando && !ev.altKey) {
    const z = k.toLowerCase();
    if (z === "z") return ev.shiftKey ? { tipo: "rehacer" } : { tipo: "deshacer" };
    if (z === "y" && !ev.shiftKey) return { tipo: "rehacer" };
    return null;
  }
  if (!haySeleccion || ev.altKey || mando) return null;
  if (k in FLECHAS)
    return {
      tipo: "mover",
      rumbo: FLECHAS[k]!,
      metros: ev.shiftKey ? PASO_FLECHA_GRANDE_M : PASO_FLECHA_M,
    };
  const q = k.toLowerCase();
  if (q === "q" || q === "e") {
    const paso = ev.shiftKey ? PASO_BOTON_GRADOS : PASO_TECLA_GRADOS;
    return { tipo: "girar", grados: q === "e" ? paso : -paso };
  }
  if (k === "Delete" || k === "Backspace") return { tipo: "quitar" };
  if (k === "Escape") return { tipo: "soltar" };
  return null;
}

/**
 * Si la lectura del caso dice que un impacto fue contra una persona y en la escena no hay ninguna
 * (A3), quién falta: un ciclista si lo dice así, si no, un peatón. Sin ella no hay atropello.
 */
export function personaFaltante(e: Expediente): RolPersona | null {
  if (e.personas?.length) return null;
  const contra = (e.impactos ?? []).find(
    (i) => i.objeto_fijo && OBJETO_PERSONA.test(i.objeto_fijo),
  );
  if (!contra) return null;
  return /ciclista|bicicleta/i.test(contra.objeto_fijo!) ? "ciclista" : "peaton";
}

/** Si la tecla se escribe en un campo de texto (ahí no es un atajo de la escena). */
export function enCampoDeTexto(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== "string") return false;
  const el = t as HTMLElement;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true;
}

/**
 * Cómo está la reconstrucción frente a la escena que se ve (René, 2026-11-17): sin reconstruir
 * (`null`), al día, recalculándose o vieja (la escena cambió después de reconstruir y los números ya
 * no corresponden a lo que se ve).
 */
export type EstadoFrenteAEscena = "al_dia" | "calculando" | "vieja" | null;

export function estadoFrenteAEscena(rec: {
  hayResultado: boolean;
  vieja: boolean;
  recalculando: boolean;
}): EstadoFrenteAEscena {
  if (rec.recalculando) return "calculando";
  if (!rec.hayResultado) return null;
  return rec.vieja ? "vieja" : "al_dia";
}

export const AVISO_ESCENA_CAMBIO =
  "La escena cambió después de reconstruir: los números ya no corresponden a lo que ves.";
