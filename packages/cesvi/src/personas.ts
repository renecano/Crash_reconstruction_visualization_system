/**
 * Peatones y ciclistas en La escena (René, 2026-11-18, A3): los atropellos son una modalidad clave de
 * CESVI. El perito los coloca, mueve, gira y quita igual que los vehículos y los objetos.
 *
 * Cada persona tiene dónde estaba cuando la golpearon (`punto`), hacia dónde iba (`rumbo_deg`, desde
 * el norte) y, si el perito lo marca, dónde quedó (`final`). De lo golpeado a donde quedó es la
 * distancia de proyección: con ella el solver estima la velocidad del vehículo en el atropello
 * (`impacto_vehiculo_persona`, `packages/solver-ts/src/pedestrian.ts`).
 */
import type { Expediente } from "./corpus";
import { enMetros } from "./geo";

export type PersonaExpediente = NonNullable<Expediente["personas"]>[number];
export type RolPersona = PersonaExpediente["rol"];
type Punto = { lat: number; lon: number };

export const ROLES_PERSONA: readonly { rol: RolPersona; nombre: string }[] = [
  { rol: "peaton", nombre: "Peatón" },
  { rol: "ciclista", nombre: "Ciclista" },
];

export const nombreRol = (r: RolPersona) => ROLES_PERSONA.find((x) => x.rol === r)!.nombre;

/** «Peatón», «Peatón 2», «Ciclista»: por su rol y su orden entre los de su rol. */
export function nombrePersona(e: Expediente, id: string): string {
  const lista = e.personas ?? [];
  const p = lista.find((x) => x.id === id);
  if (!p) return id;
  const mismos = lista.filter((x) => x.rol === p.rol);
  const k = mismos.indexOf(p);
  return mismos.length > 1 ? `${nombreRol(p.rol)} ${k + 1}` : nombreRol(p.rol);
}

/** La contraparte de un impacto que es una persona («peatón», «ciclista», «transeúnte»…). */
export const OBJETO_PERSONA = /peat[oó]n|ciclista|bicicleta|transe[uú]nte|persona|menor de edad/i;

const normalizar = (r: number) => ((r % 360) + 360) % 360;
const redondear = (x: number, k = 10) => Math.round(x * k) / k;

const conPersonas = (e: Expediente, personas: PersonaExpediente[]): Expediente => {
  if (personas.length) return { ...e, personas };
  const resto = { ...e };
  delete resto.personas;
  return resto;
};

function cambiar(
  e: Expediente,
  id: string,
  f: (p: PersonaExpediente) => PersonaExpediente,
): Expediente {
  const lista = e.personas ?? [];
  if (!lista.some((p) => p.id === id)) return e;
  return conPersonas(
    e,
    lista.map((p) => (p.id === id ? f(p) : p)),
  );
}

/**
 * Agrega una persona donde tocó el perito. Si un impacto es contra una persona (la lectura dice
 * «peatón») y todavía no tiene a nadie, queda como la persona de ese impacto.
 */
export function agregarPersona(
  e: Expediente,
  rol: RolPersona,
  punto: Punto,
  rumbo = 0,
): { expediente: Expediente; id: string } {
  const usados = new Set((e.personas ?? []).map((p) => p.id));
  let n = (e.personas?.length ?? 0) + 1;
  while (usados.has(`per-${n}`)) n++;
  const id = `per-${n}`;
  const nueva: PersonaExpediente = {
    id,
    rol,
    punto,
    rumbo_deg: redondear(normalizar(rumbo)) % 360,
    fuente: "perito",
  };
  let out = conPersonas(e, [...(e.personas ?? []), nueva]);
  const sinNadie = (out.impactos ?? []).find(
    (i) => !i.persona && i.objeto_fijo && OBJETO_PERSONA.test(i.objeto_fijo),
  );
  if (sinNadie)
    out = {
      ...out,
      impactos: out.impactos!.map((i) => (i === sinNadie ? { ...i, persona: id } : i)),
    };
  return { expediente: out, id };
}

export function moverPersona(e: Expediente, id: string, punto: Punto): Expediente {
  return cambiar(e, id, (p) => ({ ...p, punto }));
}

/** Gira hacia dónde iba la persona `grados` (positivo, en sentido horario). */
export function girarPersona(e: Expediente, id: string, grados: number): Expediente {
  return cambiar(e, id, (p) => ({
    ...p,
    rumbo_deg: redondear(normalizar((p.rumbo_deg ?? 0) + grados)) % 360,
  }));
}

/** Dónde quedó la persona; con null se borra. */
export function marcarFinalPersona(e: Expediente, id: string, punto: Punto | null): Expediente {
  return cambiar(e, id, (p) => {
    if (punto) return { ...p, final: punto };
    const resto = { ...p };
    delete resto.final;
    return resto;
  });
}

/** Quita a la persona y la desliga de su impacto (el impacto se queda, sin persona). */
export function quitarPersona(e: Expediente, id: string): Expediente {
  const out = conPersonas(
    e,
    (e.personas ?? []).filter((p) => p.id !== id),
  );
  if (!(out.impactos ?? []).some((i) => i.persona === id)) return out;
  return {
    ...out,
    impactos: out.impactos!.map((i) => {
      if (i.persona !== id) return i;
      const resto = { ...i };
      delete resto.persona;
      return resto;
    }),
  };
}

/** De donde la golpearon a donde quedó, en metros (al centímetro); null sin `final`. */
export function distanciaProyeccion(p: PersonaExpediente): number | null {
  if (!p.final) return null;
  const m = enMetros([p.final.lon, p.final.lat], [p.punto.lon, p.punto.lat]);
  return Math.round(Math.hypot(m.este, m.norte) * 100) / 100;
}

/** La persona del primer impacto contra una persona (la del atropello), si la hay. */
export function personaDelAtropello(e: Expediente): PersonaExpediente | null {
  const lista = e.personas ?? [];
  if (!lista.length) return null;
  const impactos = [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden);
  const con = impactos.find((i) => i.persona && lista.some((p) => p.id === i.persona));
  if (con) return lista.find((p) => p.id === con.persona)!;
  const contraPersona = impactos.find((i) => i.objeto_fijo && OBJETO_PERSONA.test(i.objeto_fijo));
  return contraPersona ? lista[0]! : null;
}
