import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import {
  agregarPersona,
  distanciaProyeccion,
  girarPersona,
  marcarFinalPersona,
  moverPersona,
  nombrePersona,
  personaDelAtropello,
  quitarPersona,
} from "./personas";

const P = { lat: 19.4, lon: -99.1 };
const base = (impactos: Expediente["impactos"] = []): Expediente =>
  ({
    caso: { modalidades: ["atropellamiento"] },
    vehiculos: [{ id: "V1" }],
    impactos,
  }) as unknown as Expediente;

describe("peatones y ciclistas en La escena (René, 2026-11-18, A3)", () => {
  it("se agregan, se mueven, se giran y se quitan, como un vehículo", () => {
    const nueva = agregarPersona(base(), "peaton", P, 370);
    const id = nueva.id;
    let e = nueva.expediente;
    expect(id).toBe("per-1");
    expect(e.personas).toEqual([
      { id: "per-1", rol: "peaton", punto: P, rumbo_deg: 10, fuente: "perito" },
    ]);
    e = moverPersona(e, id, { lat: 19.41, lon: -99.1 });
    expect(e.personas![0]!.punto.lat).toBe(19.41);
    e = girarPersona(e, id, -25);
    expect(e.personas![0]!.rumbo_deg).toBe(345);
    const otra = agregarPersona(e, "ciclista", P);
    expect(otra.id).toBe("per-2");
    e = quitarPersona(otra.expediente, id);
    expect(e.personas!.map((p) => p.id)).toEqual(["per-2"]);
    e = quitarPersona(e, "per-2");
    expect(e.personas).toBeUndefined();
  });

  it("si la lectura dice que el impacto fue contra un peatón, la persona queda en ese impacto", () => {
    const e0 = base([{ orden: 1, vehiculos: ["V1"], objeto_fijo: "peatón", fuente: "perito" }]);
    const { expediente: e, id } = agregarPersona(e0, "peaton", P);
    expect(e.impactos![0]!.persona).toBe(id);
    expect(personaDelAtropello(e)?.id).toBe(id);
    // Quitarla la desliga del impacto; el impacto se queda.
    const sin = quitarPersona(e, id);
    expect(sin.impactos![0]!.persona).toBeUndefined();
    expect(sin.impactos).toHaveLength(1);
  });

  it("la distancia de proyección: de donde la golpearon a donde quedó", () => {
    const nueva = agregarPersona(base(), "peaton", P);
    const id = nueva.id;
    let e = nueva.expediente;
    expect(distanciaProyeccion(e.personas![0]!)).toBeNull();
    // 0.0001° de latitud al norte: ~11.12 m (el radio terrestre de `geo.ts`).
    e = marcarFinalPersona(e, id, { lat: 19.4001, lon: -99.1 });
    expect(distanciaProyeccion(e.personas![0]!)).toBeCloseTo(11.12, 1);
    e = marcarFinalPersona(e, id, null);
    expect(e.personas![0]!.final).toBeUndefined();
  });

  it("los nombres: Peatón, Peatón 2, Ciclista", () => {
    let e = agregarPersona(base(), "peaton", P).expediente;
    e = agregarPersona(e, "ciclista", P).expediente;
    expect(nombrePersona(e, "per-1")).toBe("Peatón");
    expect(nombrePersona(e, "per-2")).toBe("Ciclista");
    e = agregarPersona(e, "peaton", P).expediente;
    expect(nombrePersona(e, "per-1")).toBe("Peatón 1");
    expect(nombrePersona(e, "per-3")).toBe("Peatón 2");
  });

  it("sin impacto contra una persona no hay atropello", () => {
    const e = agregarPersona(
      base([{ orden: 1, vehiculos: ["V1"], objeto_fijo: "poste", fuente: "perito" }]),
      "peaton",
      P,
    ).expediente;
    expect(personaDelAtropello(e)).toBeNull();
  });
});
