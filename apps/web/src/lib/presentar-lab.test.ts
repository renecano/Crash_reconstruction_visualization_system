import type { Reconstruccion } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import type { ResultadoMaqueta } from "./maqueta";
import { capitulos, recorridoTrasImpacto, tDelCapitulo } from "./presentar-lab";

const tr = (x0: number, x1: number) => ({
  t: [-2, 0, 3],
  x: [x0, 0, x1],
  y: [0, 0, 0],
  rumbo: [0, 0, 0],
  vx: [10, 10, 0],
  vy: [0, 0, 0],
});
const res = {
  t_inicio: -2,
  t_fin: 3,
  eventos: [{ tipo: "impacto", t: 0 }],
  vehiculos: [
    { id: "veh-a", rol: "B", trayectoria: tr(-20, 12.5) },
    { id: "veh-b", rol: "A", trayectoria: tr(0, 4) },
  ],
} as unknown as ResultadoMaqueta;
const r = {
  ids: { "veh-a": "V2", "veh-b": "V1" },
  velocidades: [
    { vehiculo: "V1", previa: null, impacto: { p10: 6.8, p50: 9.1, p90: 9.1 } },
    { vehiculo: "V2", previa: null, impacto: { p10: 47.3, p50: 49.2, p90: 49.2 } },
  ],
} as unknown as Reconstruccion;
const nombreDe = (id: string) => (id === "V1" ? "A · Silverado" : "B · Tacoma");
const contra = {
  vehiculo: "V2",
  que: "x",
  croquis: 63.9,
  cesvi: 63.15,
  difKmh: 0.75,
  difPct: 1.1876,
};
const base = { r, res, nombreDe, lugar: "Ahome, Sinaloa", modalidad: "Alcance" };

describe("Presentar (Laboratorio §8)", () => {
  it("con reporte son cuatro capítulos; sin reporte, tres", () => {
    expect(capitulos({ ...base, contra, conteo: null }).map((c) => c.titulo)).toEqual([
      "La escena",
      "El impacto",
      "Posiciones finales",
      "Contra CESVI",
    ]);
    expect(capitulos({ ...base, contra: null, conteo: null })).toHaveLength(3);
  });

  it("el impacto: el más rápido primero y en grande, con su rango", () => {
    const c = capitulos({ ...base, contra: null, conteo: null })[1]!;
    expect(c.filas[0]).toEqual({
      etiqueta: "B · Tacoma al impacto",
      valor: "49.2 km/h",
      grande: true,
    });
    expect(c.filas[1]).toEqual({ etiqueta: "Rango p10–p90", valor: "47.3–49.2" });
    expect(c.filas[2]).toMatchObject({ etiqueta: "A · Silverado al impacto", valor: "9.1 km/h" });
  });

  it("si la evidencia no fija ninguna velocidad, lo dice", () => {
    const sin = { ...r, velocidades: [{ vehiculo: "V1", previa: null, impacto: null }] };
    const c = capitulos({ ...base, r: sin as Reconstruccion, contra: null, conteo: null })[1]!;
    expect(c.filas[0]!.valor).toBe("la evidencia no la fija");
  });

  it("contra CESVI lleva las dos cifras, la diferencia y el conteo", () => {
    const c = capitulos({
      ...base,
      contra,
      conteo: { coinciden: 3, difieren: 0, sinDato: 1 },
    })[3]!;
    expect(c.filas.map((f) => f.valor)).toEqual([
      "1.2 %",
      "63.90 km/h",
      "63.15 km/h",
      "0.75 km/h",
      "3 coinciden · 0 difieren · 1 sin dato",
    ]);
  });

  it("el recorrido tras el impacto sale de la trayectoria", () => {
    expect(recorridoTrasImpacto(res, "veh-a")).toBeCloseTo(12.5, 6);
    expect(recorridoTrasImpacto(res, "nadie")).toBeNull();
    const finales = capitulos({ ...base, contra: null, conteo: null })[2]!;
    expect(finales.filas[0]).toEqual({
      etiqueta: "A · Silverado se movió",
      valor: "4.0 m después del impacto",
    });
  });

  it("cada capítulo mueve la maqueta en su tramo: llegada, impacto y reposo", () => {
    const [escena, impacto, finales] = capitulos({ ...base, contra: null, conteo: null });
    expect(tDelCapitulo(escena!, 0)).toBe(-2);
    expect(tDelCapitulo(escena!, 1)).toBe(0);
    expect(tDelCapitulo(impacto!, 0.5)).toBe(0);
    expect(tDelCapitulo(finales!, 1)).toBe(3);
    expect(tDelCapitulo(finales!, 9)).toBe(3);
    expect(tDelCapitulo(finales!, -1)).toBe(0);
  });
});
