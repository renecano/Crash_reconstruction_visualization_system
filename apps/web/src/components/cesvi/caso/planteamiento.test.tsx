import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PanelIncognita,
  geometriaPlanteamiento,
  origenDe,
  repartirEtiquetas,
} from "./planteamiento";
import type { HuellaMapa } from "./piezas";

const BASE = { lat: 19.36, lon: -99.06 };
const huella = (
  vehiculo: string,
  fase: string,
  dNorte: number,
  rumbo: number,
  fuente = "perito",
): HuellaMapa => ({
  vehiculo,
  fase,
  punto: { lat: BASE.lat + dNorte / 111_195, lon: BASE.lon },
  rumbo,
  largo: 4.5,
  ancho: 1.8,
  color: "#000",
  clase: "sedan_mediano",
  fuente,
});

describe("«La incógnita»: el planteamiento antes de reconstruir (A6)", () => {
  it("dice de dónde salió cada cosa con las palabras de la app", () => {
    expect(origenDe("perito")).toBe("lo marcaste");
    expect(origenDe("supuesto")).toBe("supuesto");
    expect(origenDe("relato")).toBe("narración");
  });

  it("encuadra lo colocado: todo cabe en la caja y deja sitio para las etiquetas", () => {
    const g = geometriaPlanteamiento(
      [
        huella("V1", "impacto", 0, 0),
        huella("V1", "final", 6, 0),
        huella("V2", "final", 14, 10, "supuesto"),
      ],
      [{ orden: 1, punto: BASE, fuente: "perito" }],
      { ancho: 920, alto: 640 },
    )!;
    expect(g).not.toBeNull();
    const puntos = [
      ...g.contornos.flatMap((c) => c.pts),
      ...g.choques,
      ...g.llegadas.map((l) => l.a),
    ];
    for (const p of puntos) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(g.columna);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(640);
    }
    // Una llegada por vehículo con pose de impacto, hacia el choque (de abajo hacia arriba: venía del sur).
    expect(g.llegadas).toHaveLength(1);
    expect(g.llegadas[0]!.a.y).toBeGreaterThan(g.llegadas[0]!.b.y);
    // La barra de escala es una medida redonda.
    expect([1, 2, 5, 10, 20, 50]).toContain(g.barra.metros);
    expect(g.barra.px).toBeCloseTo(g.barra.metros * g.escala, 5);
  });

  it("sin nada colocado no hay dibujo", () => {
    expect(geometriaPlanteamiento([], [], { ancho: 920, alto: 640 })).toBeNull();
  });

  it("reparte las etiquetas sin encimarlas y sin salirse", () => {
    const r = repartirEtiquetas([{ y: 200 }, { y: 205 }, { y: 210 }], 46, {
      arriba: 110,
      abajo: 570,
    });
    expect(r.map((x) => x.ey)).toEqual([200, 246, 292]);
    const abajo = repartirEtiquetas([{ y: 560 }, { y: 565 }], 46, { arriba: 110, abajo: 570 });
    expect(abajo.at(-1)!.ey).toBe(570);
    expect(abajo[1]!.ey - abajo[0]!.ey).toBe(46);
  });

  it("el panel hace la pregunta, separa lo marcado de lo supuesto y reconstruye con un botón", () => {
    const reconstruir = vi.fn(async () => undefined);
    render(
      <PanelIncognita
        nombres={["A · Jetta", "B · Camaro"]}
        lineas={[
          { tipo: "choque", texto: "El choque, donde lo marcaste", detalle: null, supuesto: null },
          {
            tipo: "golpe",
            texto: "El primer golpe",
            detalle: null,
            supuesto: "No sabías dónde fue el primer golpe: Croquis usa el lugar del choque.",
          },
        ]}
        rec={{
          r: null,
          vieja: false,
          estado: null,
          impactos: [],
          reconstruir,
          reconstruirDeNuevo: () => Promise.resolve(),
          recalculando: false,
        }}
      />,
    );
    expect(screen.getByRole("heading").textContent).toBe("¿A qué velocidad venían?");
    expect(screen.getByTestId("planteamiento-marcado").textContent).toContain("El choque");
    expect(screen.getByTestId("planteamiento-supuestos").textContent).toContain("Croquis usa");
    // Ningún número antes de calcular.
    expect(screen.getByTestId("reconstruccion").textContent).not.toMatch(/\d/);
    screen.getByTestId("reconstruir").click();
    expect(reconstruir).toHaveBeenCalledTimes(1);
  });
});
