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
    { vehiculo: "V1", previa: { mejor: 14.98, p10: 0.8, p90: 16.45 }, impacto: { p50: 20 } },
    { vehiculo: "V2", previa: { mejor: 56.87, p10: 54.79, p90: 78.39 }, impacto: { p50: 60.33 } },
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

  it("el impacto: el mejor ajuste del más rápido, en grande, con su rango; no la mediana", () => {
    const c = capitulos({ ...base, contra: null, conteo: null })[1]!;
    expect(c.filas[0]).toEqual({
      etiqueta: "B · Tacoma antes del impacto",
      valor: "56.87 km/h",
      grande: true,
    });
    expect(c.filas[1]).toEqual({ etiqueta: "Rango", valor: "54.79–78.39" });
    expect(c.filas[2]).toMatchObject({
      etiqueta: "A · Silverado antes del impacto",
      valor: "14.98 km/h",
    });
  });

  it("si el rango es lineal, se nombra", () => {
    const quieta = {
      ...r,
      velocidades: [
        {
          vehiculo: "V2",
          previa: { mejor: 41.5, p10: 27.2, p90: 55.7, rango_por: "laplace" },
          impacto: { p10: 41.5, p50: 41.5, p90: 41.5 },
        },
      ],
    } as Reconstruccion;
    const c = capitulos({ ...base, r: quieta, contra: null, conteo: null })[1]!;
    expect(c.filas[1]).toEqual({
      etiqueta: "Rango por aproximación lineal",
      valor: "27.20–55.70",
    });
  });

  it("si la evidencia no fija ninguna velocidad, lo dice", () => {
    const sin = { ...r, velocidades: [{ vehiculo: "V1", previa: null, impacto: null }] };
    const c = capitulos({ ...base, r: sin as Reconstruccion, contra: null, conteo: null })[1]!;
    expect(c.filas[0]!.valor).toBe("la evidencia no la fija");
  });

  const fisica = {
    vehiculo: "V2",
    croquis: 49.21,
    rango: [47.32, 49.21] as [number, number],
    cesvi: 63.15,
    difKmh: -13.94,
    difPct: -22.07,
    porQue: "EBS con la masa de V2 sola; Croquis, con el momento de los dos",
  };

  it("contra CESVI lleva las dos lecturas, cada una con su nombre y el mismo peso", () => {
    const c = capitulos({
      ...base,
      contra,
      fisica,
      letraDe: (id) => (id === "V2" ? "B" : "A"),
      conteo: { coinciden: 3, difieren: 0, sinDato: 1 },
    })[3]!;
    expect(c.filas).toEqual([
      { etiqueta: "Método de CESVI con los datos del reporte", valor: "+1.19 %", grande: true },
      { etiqueta: "Croquis contra el reporte", valor: "63.90 contra 63.15 km/h · +0.75 km/h" },
      { etiqueta: "Reconstrucción física de Croquis", valor: "−22.07 %", grande: true },
      {
        etiqueta: "Croquis contra el reporte",
        valor: "49.21 (47.32–49.21) contra 63.15 km/h · −13.94 km/h",
      },
      { etiqueta: "Criterios", valor: "3 coinciden · 0 difieren · 1 sin dato" },
    ]);
    expect(c.nota).toBe(
      "Por qué difieren: EBS con la masa de B sola; Croquis, con el momento de los dos",
    );
  });

  it("si la evidencia no fija la lectura física, lo dice; no inventa una cifra", () => {
    const c = capitulos({
      ...base,
      contra,
      fisica: { ...fisica, croquis: null, rango: null, difKmh: null, difPct: null },
      conteo: null,
    })[3]!;
    expect(c.filas[2]).toMatchObject({ valor: "la evidencia no la fija", grande: false });
    expect(c.filas[3]!.valor).toBe("sin velocidad contra 63.15 km/h");
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
