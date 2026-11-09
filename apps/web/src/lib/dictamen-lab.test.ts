import type { Reconstruccion, SupuestoDeclarado } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  citaContraste,
  citaSupuestos,
  citaVelocidad,
  filasDeLaHoja,
  citarUnaVez,
  insertarCita,
  MARCAS_DE_CITA,
  narracionCorta,
} from "./dictamen-lab";

const r = {
  velocidades: [
    { vehiculo: "V1", previa: null, impacto: null },
    {
      vehiculo: "V2",
      previa: { mejor: 71.56, p10: 68.02, p90: 92.81 },
      impacto: { p10: 68.02, p50: 75.2, p90: 92.81 },
    },
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
      { etiqueta: "A antes del impacto", valor: "la evidencia no la fija" },
      { etiqueta: "B antes del impacto", valor: "71.56 km/h · 68.02–92.81" },
    ]);
  });

  it("sin dispersión de las simulaciones, el rango dice que es lineal", () => {
    const quieta = {
      velocidades: [
        {
          vehiculo: "V2",
          previa: { mejor: 41.5, p10: 27.2, p50: 41.5, p90: 55.7, rango_por: "laplace" },
          impacto: { p10: 41.5, p50: 41.5, p90: 41.5 },
        },
      ],
    } as unknown as Reconstruccion;
    expect(filasDeLaHoja(quieta, letra, null)[0]!.valor).toBe("41.50 km/h · 27.20–55.70 (lineal)");
    expect(citaVelocidad(quieta, "V2", "B")).toContain(
      "rango por aproximación lineal: 27.20–55.70",
    );
  });

  it("la comparación con CESVI va con su valor y su porcentaje", () => {
    const f = filasDeLaHoja(r, letra, contra);
    expect(f.at(-2)).toEqual({ etiqueta: "B por deformación", valor: "63.90 km/h" });
    expect(f.at(-1)).toEqual({ etiqueta: "Contra CESVI", valor: "Δ +1.19 % · +0.75 km/h" });
  });

  it("las citas llevan el dato con su método; sin dato no hay cita", () => {
    expect(citaVelocidad(r, "V2", "B · Tacoma")).toBe(
      "Velocidad de B · Tacoma antes del impacto: 71.56 km/h (rango: 68.02–92.81), mejor ajuste de la reconstrucción física de Croquis.",
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

describe("citar sin duplicar (O2, plan v4)", () => {
  const marca = MARCAS_DE_CITA.velocidad("B");
  const cita =
    "Velocidad de B antes del impacto: 71.56 km/h (rango: 68.02–92.81), mejor ajuste de la reconstrucción física de Croquis.";

  it("citar dos veces deja un solo bloque y lo señala", () => {
    const una = citarUnaVez("Mi conclusión.", cita, marca, 14, 14);
    expect(una.accion).toBe("insertada");
    const dos = citarUnaVez(una.texto, cita, marca, una.hasta, una.hasta);
    expect(dos.accion).toBe("ya_estaba");
    expect(dos.texto).toBe(una.texto);
    expect(dos.texto.split("Velocidad de B").length - 1).toBe(1);
    expect(dos.texto.slice(dos.desde, dos.hasta)).toBe(cita);
  });

  it("si la cifra cambió, reemplaza la cita vieja y conserva lo demás", () => {
    const vieja = cita.replace("71.56", "69.00");
    const texto = `Antes. ${vieja} Después.`;
    const r = citarUnaVez(texto, cita, marca, 0, 0);
    expect(r.accion).toBe("reemplazada");
    expect(r.texto).toBe(`Antes. ${cita} Después.`);
  });

  it("los supuestos se reemplazan hasta el fin de su renglón", () => {
    const m = MARCAS_DE_CITA.supuestos();
    const texto = "Uno.\nSupuestos declarados: masa: 1200 kg.\nDos.";
    const nueva = "Supuestos declarados: masa: 1300 kg; fricción: 0.7.";
    const r = citarUnaVez(texto, nueva, m, 0, 0);
    expect(r.texto).toBe(`Uno.\n${nueva}\nDos.`);
    expect(citarUnaVez(r.texto, nueva, m, 0, 0).texto).toBe(r.texto);
  });

  it("cada tipo de cita tiene su bloque: una no pisa a la otra", () => {
    const sup = "Supuestos declarados: masa: 1200 kg.";
    const a = citarUnaVez("", cita, marca, 0, 0);
    const b = citarUnaVez(a.texto, sup, MARCAS_DE_CITA.supuestos(), a.hasta, a.hasta);
    expect(b.texto).toContain(cita);
    expect(b.texto).toContain(sup);
  });
});
