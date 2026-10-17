import alcance from "../fixtures/alcance.json";
import frontalCurva from "../fixtures/frontal_curva.json";
import glorieta from "../fixtures/glorieta.json";
import interseccionToluca from "../fixtures/interseccion_toluca.json";
import lateralInterseccion from "../fixtures/lateral_interseccion.json";
import motociclista from "../fixtures/motociclista.json";
import nocturnoLluvia from "../fixtures/nocturno_lluvia.json";
import objetoFijoArbol from "../fixtures/objeto_fijo_arbol.json";
import peatonCruce from "../fixtures/peaton_cruce.json";
import poste from "../fixtures/poste.json";
import volcadura from "../fixtures/volcadura.json";
import { EscenaSpecSchema, type EscenaSpec } from "./generated/escena.zod";

/** Nombres de las escenas canónicas: las 10 de F1 y la de Toluca con vía de OSM (F8, ADR 0023). */
export const FIXTURE_NAMES = [
  "alcance",
  "lateral_interseccion",
  "frontal_curva",
  "peaton_cruce",
  "motociclista",
  "objeto_fijo_arbol",
  "poste",
  "volcadura",
  "nocturno_lluvia",
  "glorieta",
  "interseccion_toluca",
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

/** Documentos crudos (tal como están en disco), sin validar. */
export const RAW_FIXTURES: Record<FixtureName, unknown> = {
  alcance,
  lateral_interseccion: lateralInterseccion,
  frontal_curva: frontalCurva,
  peaton_cruce: peatonCruce,
  motociclista,
  objeto_fijo_arbol: objetoFijoArbol,
  poste,
  volcadura,
  nocturno_lluvia: nocturnoLluvia,
  glorieta,
  interseccion_toluca: interseccionToluca,
};

const cache = new Map<FixtureName, EscenaSpec>();

/** Carga y valida (Zod) una escena canónica. Lanza si el fixture no cumple el contrato. */
export function loadFixture(name: FixtureName): EscenaSpec {
  const hit = cache.get(name);
  if (hit) return structuredClone(hit);
  const spec = EscenaSpecSchema.parse(RAW_FIXTURES[name]);
  cache.set(name, spec);
  return structuredClone(spec);
}

/** Título legible de cada escena, para selectores en la interfaz. */
export function fixtureTitle(name: FixtureName): string {
  const raw = RAW_FIXTURES[name] as { meta?: { titulo?: string } };
  return raw.meta?.titulo ?? name;
}
