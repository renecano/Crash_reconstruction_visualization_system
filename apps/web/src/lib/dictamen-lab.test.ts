import type { Reconstruccion, SupuestoDeclarado } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  citaContraste,
  citaSupuestos,
  citaVelocidad,
  filasDeLaHoja,
  insertarCita,
  narracionCorta,
} from "./dictamen-lab";

const r = {
  velocidades: [
    { vehiculo: "V1", previa: null, impacto: null },
    { vehiculo: "V2", previa: null, impacto: { p10: 47.32, p50: 49.21, p90: 49.21 } },
  ],
} as unknown as Reconstruccion;
const letra = (id: string) => (id === "V1" ? "A" : "B");
const contra = {
  vehiculo: "V2",
  que: "velocidad de impacto",
  croquis: 63.9,
  cesvi: 63.15,
  difKmh: 0.75,
  difPct: 1.1876,
};

describe("el dictamen (Laboratorio §8)", () => {
  it("la hoja lleva cada velocidad con su rango, y lo que la evidencia no fija lo dice", () => {
    expect(filasDeLaHoja(r, letra, null)).toEqual([
      { etiqueta: "A al impacto", valor: "la evidencia no la fija" },
      { etiqueta: "B al impacto", valor: "49.2 km/h · 47.3–49.2" },
    ]);
  });

  it("sin dispersión de las simulaciones, el rango dice que es lineal", () => {
    const quieta = {
      velocidades: [
        {
          vehiculo: "V2",
          previa: { mejor: 41.5, p10: 27.2, p50: 41.5, p90: 55.7 },
          impacto: { p10: 41.5, p50: 41.5, p90: 41.5 },
        },
      ],
    } as unknown as Reconstruccion;
    expect(filasDeLaHoja(quieta, letra, null)[0]!.valor).toBe("41.5 km/h · 27.2–55.7 (lineal)");
    expect(citaVelocidad(quieta, "V2", "B")).toContain("rango por aproximación lineal: 27.2–55.7");
  });

  it("la comparación con CESVI va con su valor y su porcentaje", () => {
    const f = filasDeLaHoja(r, letra, contra);
    expect(f.at(-2)).toEqual({ etiqueta: "B por deformación", valor: "63.90 km/h" });
    expect(f.at(-1)).toEqual({ etiqueta: "Contra CESVI", valor: "Δ +1.19 % · +0.75 km/h" });
  });

  it("las citas llevan el dato con su método; sin dato no hay cita", () => {
    expect(citaVelocidad(r, "V2", "B · Tacoma")).toBe(
      "Velocidad de B · Tacoma al impacto: 49.2 km/h (p10–p90: 47.3–49.2), según la reconstrucción física de Croquis.",
    );
    expect(citaVelocidad(r, "V1", "A")).toBeNull();
    expect(citaContraste(contra, "B")).toContain("63.90 km/h");
    expect(citaContraste(contra, "B")).toContain("+0.75 km/h (+1.19 %)");
    expect(citaSupuestos([])).toBeNull();
    expect(citaSupuestos([{ que: "Masa de A", valor: "2,562.1 kg" } as SupuestoDeclarado])).toBe(
      "Supuestos declarados: Masa de A: 2,562.1 kg.",
    );
  });

  it("la cita entra donde está el cursor, sin pegarse al texto", () => {
    expect(insertarCita("", "Cita.", 0, 0)).toEqual({ texto: "Cita.", cursor: 5 });
    expect(insertarCita("Mi conclusión", "Cita.", 13, 13).texto).toBe("Mi conclusión Cita.");
    const enMedio = insertarCita("uno dos", "Cita.", 3, 3);
    expect(enMedio.texto).toBe("uno Cita. dos");
    // Reemplaza lo seleccionado.
    expect(insertarCita("uno dos tres", "Cita.", 4, 7).texto).toBe("uno Cita. tres");
  });

  it("la narración de la hoja se corta en una palabra entera", () => {
    expect(narracionCorta("corta")).toBe("corta");
    const t = narracionCorta(`${"palabra ".repeat(40)}`, 30);
    expect(t.endsWith("palabra…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(31);
  });
});
