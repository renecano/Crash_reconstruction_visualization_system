import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enMetros, medidasDe, type Expediente } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { finalDeLaNarracion, poseDe } from "./escena-facil";

/**
 * Dónde quedó, como lo dice la narración (René, 2026-11-24): en La escena, todos quedaban «junto al
 * choque» o había que marcarlos a mano, y la reconstrucción daba 7 km/h al camión que quedó 6 m
 * después del paso peatonal.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const caso = (n: string) =>
  JSON.parse(readFileSync(resolve(aqui, `../../../../data/cesvi/casos/${n}.croquis`), "utf8")) as {
    expediente: Expediente;
    escena: { posiciones: { vehiculo: string; fase: string; descripcion: string }[] };
  };
const lejos = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  enMetros([a.lon, a.lat], [b.lon, b.lat]);

describe("«6 m después del paso peatonal»", () => {
  const { expediente: e, escena } = caso("rene-peaton-vuelta");
  const d = escena.posiciones.find((p) => p.vehiculo === "V1")!.descripcion;

  it("queda 6 m adelante de su pose del choque, hacia donde avanzaba", () => {
    const f = finalDeLaNarracion(e, "V1", d)!;
    const imp = poseDe(e, "V1", "impacto")!;
    const m = lejos(f.punto, imp.punto);
    expect(Math.hypot(m.este, m.norte)).toBeCloseTo(6, 1);
    expect(f.texto).toMatch(/^6 m adelante/);
  });
});

describe("las posiciones finales de la carambola", () => {
  const { expediente: guardado, escena } = caso("rene-carambola-semaforo");
  // Como en La escena antes de contestar: sin posiciones finales marcadas.
  const e: Expediente = {
    ...guardado,
    versiones: guardado.versiones!.map((v) => ({
      ...v,
      posiciones: (v.posiciones ?? []).filter((p) => p.fase !== "final"),
    })),
  };
  const finales = escena.posiciones.filter((p) => p.fase === "final");
  const de = (v: string) =>
    finalDeLaNarracion(e, v, finales.find((p) => p.vehiculo === v)!.descripcion, finales)!;

  it("C, 3 m de donde estaba detenido; B, 2 m del punto del primer impacto", () => {
    for (const [v, n] of [
      ["V3", 3],
      ["V2", 2],
    ] as const) {
      const m = lejos(de(v).punto, poseDe(e, v, "impacto")!.punto);
      expect(Math.hypot(m.este, m.norte)).toBeCloseTo(n, 1);
    }
  });

  it("A, a 1 m detrás de donde quedó B: defensa con defensa más 1 m, en el rumbo de B", () => {
    const a = de("V1");
    const b = de("V2");
    const m = lejos(b.punto, a.punto);
    const largo = (id: string) => medidasDe(e.vehiculos.find((v) => v.id === id)!).largo;
    expect(Math.hypot(m.este, m.norte)).toBeCloseTo((largo("V1") + largo("V2")) / 2 + 1, 1);
    expect(a.rumbo).toBeCloseTo(b.rumbo, 5);
  });

  it("lo que no da una distancia no se inventa", () => {
    expect(
      finalDeLaNarracion(e, "V1", "detenido junto al árbol, con el frente al suroeste"),
    ).toBeNull();
  });
});
