import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEscena } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import { agregarPersona, marcarFinalPersona } from "./personas";
import { avisoDeProyeccion, especDeExpediente, reconstruirExpediente } from "./reconstruccion";

type Json = Record<string, unknown>;

/** El crucero de E-R1 como base; aquí, con un solo vehículo que atropella (entrada de prueba). */
const grabacion = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
    ),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const crucero = escenaDeNarracion(grabacion.salida, grabacion.narracion).expediente;

const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

/** V1 golpea a un peatón que cruzaba hacia el norte; el peatón queda 14 m adelante. */
function atropello(conFinal = true): Expediente {
  let e: Expediente = {
    ...crucero,
    vehiculos: crucero.vehiculos.filter((v) => v.id === "V1"),
    danos: (crucero.danos ?? []).filter((d) => d.vehiculo === "V1"),
    impactos: [{ orden: 1, vehiculos: ["V1"], objeto_fijo: "peatón", fuente: "perito" }],
    versiones: [],
  };
  e = conPosicion(e, { vehiculo: "V1", fase: "impacto", punto: m(0, -2.2), rumbo: 90 });
  e = conPosicion(e, { vehiculo: "V1", fase: "final", punto: m(0, 9), rumbo: 90 });
  const nueva = agregarPersona(e, "peaton", m(0, 0), 0);
  e = nueva.expediente;
  if (conFinal) e = marcarFinalPersona(e, nueva.id, m(0, 14));
  return e;
}

describe("un atropello en La escena (René, 2026-11-18, A3)", () => {
  it("la escena lleva el atropello, la persona donde la golpearon y la distancia de proyección", () => {
    const { spec } = especDeExpediente(atropello());
    const s = spec as Json & { eventos: Json[]; personas: Json[]; evidencias: Json[] };
    expect(validateEscena(spec).ok).toBe(true);
    expect(s.eventos[0]!.tipo).toBe("impacto_vehiculo_persona");
    expect(s.eventos[0]!.actores).toContain("per-1");
    const persona = s.personas.find((p) => p.id === "per-1")!;
    expect((persona.rol as Json).valor).toBe("peaton");
    // El origen es la posición de impacto de V1 (2.2 m al oeste): el peatón queda en x = 2.2.
    expect(Number((persona.posicion_inicial as Json).x)).toBeCloseTo(2.2, 1);
    expect(persona.posicion_final).toBeTruthy();
    const proyeccion = s.evidencias.find((x) => x.tipo === "distancia_proyeccion")!;
    expect(proyeccion.persona_id).toBe("per-1");
    expect((proyeccion.longitud as Json).valor).toBeCloseTo(14, 0);
    expect((proyeccion.longitud as Json).fuente).toBe("usuario");
  });

  it("sin la persona, avisa que falta colocarla; nunca supone un objeto fijo «peatón»", () => {
    const e = { ...atropello(), personas: undefined } as Expediente;
    delete (e as Json).personas;
    e.impactos = [{ orden: 1, vehiculos: ["V1"], objeto_fijo: "peatón", fuente: "perito" }];
    const base = especDeExpediente(e);
    const s = base.spec as Json & { eventos: Json[] };
    expect(s.eventos[0]!.tipo).not.toBe("impacto_vehiculo_objeto");
    expect(base.limites.join(" ")).toMatch(/coloca al peatón o al ciclista/);
  });

  it(
    "con la distancia de proyección, el solver fija la velocidad del vehículo, con rango",
    { timeout: 120_000 },
    () => {
      const r = reconstruirExpediente(atropello(), "atropello");
      const v1 = r.velocidades.find((v) => v.vehiculo === "V1")!;
      expect(v1.previa).not.toBeNull();
      expect(v1.previa!.p10!).toBeLessThanOrEqual(v1.previa!.p90!);
    },
  );
});

describe("lo marcado contra lo reconstruido en un atropello", () => {
  const spec = { evidencias: [{ tipo: "distancia_proyeccion", longitud: { valor: 12 } }] };
  const con = (d: number, rango: [number, number]) => ({
    eventos: [
      {
        tipo: "impacto_vehiculo_persona",
        detalle: { distancia_proyeccion_m: d, rango_m: rango },
      },
    ],
  });

  it("si lo marcado queda fuera del rango reconstruido, lo dice con las dos cifras", () => {
    const aviso = avisoDeProyeccion(spec, con(4.71, [3.9, 5.6]));
    expect(aviso).toContain("12.00 m");
    expect(aviso).toContain("4.71 m (de 3.90 m a 5.60 m)");
    expect(aviso).toContain("no cuadran juntas");
  });

  it("dentro del rango, o sin lo marcado, no avisa", () => {
    expect(avisoDeProyeccion(spec, con(11.4, [9.8, 13.1]))).toBeNull();
    expect(avisoDeProyeccion({ evidencias: [] }, con(4.71, [3.9, 5.6]))).toBeNull();
    expect(avisoDeProyeccion(spec, { eventos: [] })).toBeNull();
  });
});
