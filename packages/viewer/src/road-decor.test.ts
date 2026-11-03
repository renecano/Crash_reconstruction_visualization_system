import { roadLayout } from "@croquis/croquis-2d";
import { loadFixture, longitudM } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { BARRIER_POST_SPACING_M, postsAlong, roadDecorFor, SHOULDER_WIDTH_M } from "./road-decor";

const meshArea = (m: { positions: number[]; indices: number[] }): number => {
  let a = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [p, q, r] = [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!].map((k) => ({
      x: m.positions[2 * k]!,
      y: m.positions[2 * k + 1]!,
    }));
    a += Math.abs((q!.x - p!.x) * (r!.y - p!.y) - (r!.x - p!.x) * (q!.y - p!.y)) / 2;
  }
  return a;
};

describe("acotamientos y barreras (T1.2)", () => {
  it("una calle urbana no lleva ni acotamiento ni barrera", () => {
    const spec = loadFixture("lateral_interseccion");
    const d = roadDecorFor(spec.lugar, roadLayout(spec.lugar));
    expect(d.shoulders.indices).toEqual([]);
    expect(d.barriers).toEqual([]);
  });

  it("la carretera de dos carriles lleva grava a los lados y sin barrera", () => {
    const spec = loadFixture("frontal_curva");
    const lugar = {
      ...spec.lugar,
      tipo_via: { ...spec.lugar.tipo_via, valor: "carretera_dos_carriles" as const },
      radio_curva: undefined,
    };
    const layout = roadLayout(lugar);
    const d = roadDecorFor(lugar, layout);
    const s = layout.strips[0]!;
    // Dos franjas del ancho de acotamiento declarado (o 2.5 m) a lo largo de toda la franja.
    const w = lugar.ancho_acotamiento ? longitudM(lugar.ancho_acotamiento) : SHOULDER_WIDTH_M;
    expect(meshArea(d.shoulders)).toBeCloseTo(2 * w * s.length, 6);
    expect(d.barriers).toEqual([]);
  });

  it("la autopista lleva el acotamiento dentro de su ancho y una barrera a cada lado", () => {
    const spec = loadFixture("alcance");
    const lugar = {
      ...spec.lugar,
      tipo_via: { ...spec.lugar.tipo_via, valor: "autopista" as const },
    };
    const layout = roadLayout(lugar);
    const d = roadDecorFor(lugar, layout);
    const s = layout.strips[0]!;
    expect(meshArea(d.shoulders)).toBeCloseTo(2 * SHOULDER_WIDTH_M * s.length, 6);
    expect(d.barriers).toHaveLength(2);
    for (const b of d.barriers) {
      // Al borde exterior de la calzada (que ya incluye el acotamiento).
      const h = (s.heading * Math.PI) / 180;
      for (const p of b) {
        const across = -(p.x - s.center.x) * Math.sin(h) + (p.y - s.center.y) * Math.cos(h);
        expect(Math.abs(across)).toBeCloseTo(s.width / 2, 6);
      }
    }
  });

  it("con calles del mapa, solo las vías rápidas llevan grava y barrera, fuera de su ancho", () => {
    const spec = loadFixture("alcance");
    const vias = [
      {
        puntos: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        ancho: 7,
        tipo: "motorway",
      },
      {
        puntos: [
          { x: 0, y: 20 },
          { x: 100, y: 20 },
        ],
        ancho: 6,
        tipo: "residential",
      },
    ];
    const d = roadDecorFor(spec.lugar, { strips: [] }, vias);
    expect(meshArea(d.shoulders)).toBeCloseTo(2 * SHOULDER_WIDTH_M * 100, 6);
    expect(d.barriers).toHaveLength(2);
    const ys = d.barriers.map((b) => b[0]!.y).sort((a, c) => a - c);
    expect(ys[0]).toBeCloseTo(-(3.5 + SHOULDER_WIDTH_M), 6);
    expect(ys[1]).toBeCloseTo(3.5 + SHOULDER_WIDTH_M, 6);
  });

  it("los postes van cada 4 m a lo largo de la barrera, desde su inicio", () => {
    const posts = postsAlong([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
    ]);
    expect(posts).toHaveLength(5); // 0, 4, 8, 12, 16 m de 16
    expect(posts[0]).toEqual({ x: 0, y: 0 });
    expect(posts[3]!.x).toBeCloseTo(10, 6);
    expect(posts[3]!.y).toBeCloseTo(2, 6);
    expect(BARRIER_POST_SPACING_M).toBe(4);
  });
});
