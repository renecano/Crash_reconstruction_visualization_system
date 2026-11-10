/**
 * C1 (W3): lo que el perito marca en la escena fácil después de colocar los vehículos (el primer
 * golpe, los choques contra algo más y los puntos de paso) llega a la escena del solver como
 * evidencia medida.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEscena } from "@croquis/scene-schema";
import { evidenceFromSpec, impactPointFromSpec, reconstruct } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import { especDeExpediente, evidenciaEnPalabras } from "./reconstruccion";

type Json = Record<string, unknown>;

/** El crucero de E-R1 (narración de desarrollo, lectura grabada): V1 de frente contra el costado de V2. */
const grabacion = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
    ),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const base = escenaDeNarracion(grabacion.salida, grabacion.narracion).expediente;

/** Un punto a `norte` y `este` metros de un origen fijo (entrada de prueba, no un dato del caso). */
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

/** Los dos vehículos colocados en el impacto: el origen de la escena queda en (norte −1, este 1). */
function colocado(): Expediente {
  const e = conPosicion(base, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
  return conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
}

/** El expediente con `extra` en su versión de la evidencia (la crea si todavía no existe). */
function conEvidencia(e: Expediente, extra: Json): Expediente {
  const versiones = e.versiones ?? [];
  if (!versiones.some((v) => v.tipo === "evidencia"))
    return { ...e, versiones: [...versiones, { tipo: "evidencia", ...extra }] };
  return {
    ...e,
    versiones: versiones.map((v) => (v.tipo === "evidencia" ? { ...v, ...extra } : v)),
  };
}

describe("C1: el primer golpe", () => {
  it("sin marcar, el punto de impacto es el origen y no es una medición", () => {
    const { spec } = especDeExpediente(colocado());
    expect((spec.eventos as Json[])[0]!.punto_impacto).toEqual({ x: 0, y: 0 });
    expect(impactPointFromSpec(spec)).toBeNull();
  });

  it("marcado por el perito, va donde lo marcó y entra como evidencia medida", () => {
    const e0 = colocado();
    const e: Expediente = {
      ...e0,
      impactos: e0.impactos!.map((i) => (i.orden === 1 ? { ...i, punto: m(-1.5, 0.5) } : i)),
    };
    const { spec } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const evento = (spec.eventos as Json[])[0]!;
    const punto = evento.punto_impacto as { x: number; y: number };
    expect(punto.x).toBeCloseTo(-0.5, 1);
    expect(punto.y).toBeCloseTo(-0.5, 1);
    expect(evento.procedencia).toMatchObject({ fuente: "usuario" });
    const marcado = impactPointFromSpec(spec)!;
    expect(marcado[0]).toBe(evento.id);
    expect(evidenceFromSpec(spec, 1).labels()).toContain(`punto_inicial:${String(evento.id)}`);
  });
});

describe("C1: los puntos de paso", () => {
  it("van a su vehículo, en su orden, con su precisión y su hora", () => {
    const e = conEvidencia(colocado(), {
      puntos_paso: [
        { vehiculo: "V2", orden: 2, punto: m(-1, 9), fuente: "perito" },
        { vehiculo: "V2", orden: 1, punto: m(-1, 5), precision_m: 0.5, t_s: 0.8, fuente: "perito" },
        { vehiculo: "V1", orden: 1, punto: m(3, 1), fuente: "supuesto" },
      ],
    });
    const { spec, ids } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const v2 = (spec.vehiculos as Json[]).find((v) => ids[String(v.id)] === "V2")!;
    const pasos = v2.puntos_paso as Json[];
    expect(pasos.map((q) => q.id)).toEqual([`pp-${String(v2.id)}-1`, `pp-${String(v2.id)}-2`]);
    expect(pasos[0]).toMatchObject({ orden: 1, precision_m: 0.5, t_s: 0.8 });
    expect((pasos[0]!.posicion as Json).x).toBeCloseTo(4, 1);
    expect((pasos[0]!.posicion as Json).y).toBeCloseTo(0, 1);
    expect(pasos[1]!.precision_m).toBeUndefined();
    expect(pasos[0]!.procedencia).toMatchObject({ fuente: "usuario" });
    // Un punto que no marcó el perito no es evidencia.
    const v1 = (spec.vehiculos as Json[]).find((v) => ids[String(v.id)] === "V1")!;
    expect(v1.puntos_paso).toBeUndefined();
    const etiquetas = evidenceFromSpec(spec, 1).labels();
    expect(etiquetas).toContain(`paso:pp-${String(v2.id)}-1`);
    expect(evidenciaEnPalabras(`paso:pp-${String(v2.id)}-2`, ids)).toBe("punto de paso 2 de V2");
  });

  it("sin posiciones de impacto no hay de dónde medirlos, y se dice", () => {
    const e = conEvidencia(base, {
      puntos_paso: [{ vehiculo: "V1", orden: 1, punto: m(3, 1), fuente: "perito" }],
    });
    const { spec, limites } = especDeExpediente(e);
    expect((spec.vehiculos as Json[]).every((v) => v.puntos_paso === undefined)).toBe(true);
    expect(limites.some((l) => l.includes("los puntos de paso no se pueden medir"))).toBe(true);
  });
});

describe("C1: un choque intermedio contra un objeto marcado", () => {
  const conPoste = (): Expediente => {
    const e0 = colocado();
    return {
      ...e0,
      impactos: [
        ...e0.impactos!,
        { orden: 2, vehiculos: ["V2"], objeto_fijo: "poste", punto: m(-1, 13), fuente: "perito" },
      ],
    };
  };

  it("ya no se descarta: el objeto va donde se marcó, con su evento y su punto de paso", () => {
    const { spec, ids, limites } = especDeExpediente(conPoste());
    expect(validateEscena(spec).ok).toBe(true);
    const objeto = ((spec.entorno as Json).objetos as Json[]).find((o) => o.id === "obj-choque-2")!;
    expect(objeto.tipo).toBe("poste");
    expect((objeto.posicion as Json).x).toBeCloseTo(12, 1);
    expect((objeto.posicion as Json).y).toBeCloseTo(0, 1);
    expect(objeto.procedencia).toMatchObject({ fuente: "usuario" });
    const v2 = (spec.vehiculos as Json[]).find((v) => ids[String(v.id)] === "V2")!;
    const evento = (spec.eventos as Json[]).find((ev) => ev.id === "ev-impacto-2")!;
    expect(evento).toMatchObject({
      tipo: "impacto_vehiculo_objeto",
      actores: [v2.id, "obj-choque-2"],
    });
    expect(Number(evento.orden)).toBeGreaterThan(Number((spec.eventos as Json[])[0]!.orden));
    // El lugar del choque también guía a la inversión, como punto de paso de ese vehículo.
    expect((v2.puntos_paso as Json[]).map((q) => q.id)).toEqual(["pp-choque-2"]);
    expect(evidenciaEnPalabras("paso:pp-choque-2", ids)).toBe(
      "lugar del choque intermedio (impacto 2)",
    );
    // Sus medidas son típicas y se dice; ya no sale «la reconstrucción no lo calcula».
    expect(limites.some((l) => l.includes("no lo calcula"))).toBe(false);
    expect(limites.some((l) => l.includes("medidas típicas"))).toBe(true);
  });

  it("un muro va atravesado al avance desde el primer golpe", () => {
    const e0 = colocado();
    const e: Expediente = {
      ...e0,
      impactos: [
        ...e0.impactos!,
        { orden: 2, vehiculos: ["V2"], objeto_fijo: "pared", punto: m(-1, 13), fuente: "perito" },
      ],
    };
    const { spec } = especDeExpediente(e);
    const muro = ((spec.entorno as Json).objetos as Json[]).find((o) => o.id === "obj-choque-2")!;
    expect(muro.tipo).toBe("muro");
    // El punto queda al este del origen: el muro corre de norte a sur.
    expect(Math.abs(Number(muro.rumbo_deg))).toBeCloseTo(90, 0);
  });

  it("el solver lo reconoce como choque intermedio contra ese objeto", () => {
    const { spec, ids } = especDeExpediente(conPoste());
    const r = reconstruct(spec);
    const v2 = (spec.vehiculos as Json[]).find((v) => ids[String(v.id)] === "V2")!;
    // Ocurre, o se avisa que la trayectoria no llega: nunca se pierde en silencio.
    const ocurrio = r.eventos.find((ev) => ev.id === "ev-impacto-2");
    const aviso = r.avisos.find(
      (a) => a.codigo === "impacto_no_ocurre" && (a.datos as Json).evento === "ev-impacto-2",
    );
    expect(Boolean(ocurrio) !== Boolean(aviso)).toBe(true);
    if (ocurrio) expect(ocurrio.actores).toEqual([v2.id, "obj-choque-2"]);
    else expect((aviso!.datos as Json).objeto).toBe("obj-choque-2");
  });

  it("sin el punto marcado, sigue como límite", () => {
    const e0 = colocado();
    const e: Expediente = {
      ...e0,
      impactos: [
        ...e0.impactos!,
        { orden: 2, vehiculos: ["V2"], objeto_fijo: "poste", fuente: "perito" },
      ],
    };
    const { limites } = especDeExpediente(e);
    expect(limites).toContain(
      "El impacto 2 no es entre dos vehículos (poste): la reconstrucción no lo calcula.",
    );
  });
});

describe("C1: la evidencia en palabras", () => {
  it("el punto del primer golpe", () => {
    expect(evidenciaEnPalabras("punto_inicial:ev-impacto", {})).toBe(
      "punto del primer golpe que marcó el perito",
    );
  });
});
