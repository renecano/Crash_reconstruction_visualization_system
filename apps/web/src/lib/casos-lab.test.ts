import type { ComparacionDictamen } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  estadoDeReporte,
  filtrar,
  filtrosDeReportes,
  lineaDeEstado,
  miniCroquis,
} from "./casos-lab";

describe("la lista de casos (Laboratorio §8)", () => {
  it("la línea de estado dice lo que hay de verdad", () => {
    expect(lineaDeEstado(7, 0)).toBe(
      "7 reportes de CESVI de ejemplo · aún no guardas casos propios en este equipo",
    );
    expect(lineaDeEstado(7, 1)).toBe(
      "7 reportes de CESVI de ejemplo · 1 caso guardado en este equipo",
    );
    // Mientras el navegador no responde no se afirma nada de lo guardado.
    expect(lineaDeEstado(1, null)).toBe("1 reporte de CESVI de ejemplo");
  });

  it("los filtros cuentan de verdad, y su suma es el total", () => {
    const reportes = [
      { modalidad: "Alcance" },
      { modalidad: "Lateral" },
      { modalidad: "Alcance" },
      { modalidad: "Otra" },
    ];
    const f = filtrosDeReportes(reportes);
    expect(f[0]).toEqual({ clave: "todos", nombre: "Todos", n: 4 });
    expect(f[1]).toEqual({ clave: "Alcance", nombre: "Alcance", n: 2 });
    expect(f.slice(1).reduce((a, x) => a + x.n, 0)).toBe(4);
    expect(filtrar(reportes, "Alcance")).toHaveLength(2);
    expect(filtrar(reportes, "todos")).toHaveLength(4);
  });

  const base = {
    modalidad: { cesvi: "alcance", croquis: "alcance", motivo: "", coincide: true },
    velocidades: [],
  } as unknown as ComparacionDictamen;

  it("el estado sale de la comparación medida; no inventa una cifra", () => {
    const con = {
      ...base,
      velocidades: [
        {
          vehiculo: "V2",
          que: "x",
          cesvi_kmh: 63.15,
          croquis_kmh: 63.9,
          error_kmh: 0.75,
          error_pct: 1.1876,
        },
      ],
    };
    expect(estadoDeReporte(con)).toBe("Reproducido · Δ 1.2 %");
    expect(estadoDeReporte(base)).toBe("Modalidad coincide");
    expect(estadoDeReporte({ ...base, modalidad: { ...base.modalidad, coincide: false } })).toBe(
      "Modalidad distinta",
    );
    expect(estadoDeReporte({ ...base, modalidad: { ...base.modalidad, coincide: null } })).toBe(
      "Sin modalidad concluida",
    );
    expect(estadoDeReporte(undefined)).toBe("Sin comparar");
  });

  it("el mini croquis sale de la modalidad y el número de vehículos, y cabe en su caja", () => {
    const alcance = miniCroquis("Alcance", 2);
    expect(alcance.piezas).toHaveLength(2);
    expect(alcance.piezas[0]!.tipo).toBe("golpea");
    expect(alcance.cruce).toBe(false);
    expect(miniCroquis("Lateral", 2).cruce).toBe(true);
    expect(miniCroquis("Contra objeto fijo", 1).piezas[1]!.tipo).toBe("objeto");
    expect(miniCroquis("Carambola", 3).piezas).toHaveLength(3);
    for (const [m, n] of [
      ["Alcance", 2],
      ["Carambola", 4],
      ["Lateral", 2],
      ["Frontal", 2],
      ["Contra objeto fijo", 1],
      ["Otra", 1],
      ["Otra", 2],
    ] as const) {
      const c = miniCroquis(m, n);
      for (const p of c.piezas) {
        expect(p.x).toBeGreaterThanOrEqual(8);
        expect(p.x).toBeLessThanOrEqual(112);
        expect(p.y).toBeGreaterThanOrEqual(8);
        expect(p.y).toBeLessThanOrEqual(64);
      }
    }
  });
});
