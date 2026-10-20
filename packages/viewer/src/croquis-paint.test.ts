import { FIXTURE_NAMES, loadResultado, type Resultado } from "@croquis/scene-schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildCroquisPaint, PAINT_WIDTH } from "./croquis-paint";
import type { Mesh2D } from "./road-geometry";

function puntos(m: Mesh2D): { x: number; y: number }[] {
  const out = [];
  for (let i = 0; i < m.positions.length; i += 2)
    out.push({ x: m.positions[i]!, y: m.positions[i + 1]! });
  return out;
}

function esValida(m: Mesh2D): void {
  expect(m.positions.length % 2).toBe(0);
  expect(m.indices.length % 3).toBe(0);
  for (const v of m.positions) expect(Number.isFinite(v)).toBe(true);
  const n = m.positions.length / 2;
  for (const i of m.indices) {
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(n);
  }
}

describe("croquis pintado sobre el asfalto", () => {
  it.each(FIXTURE_NAMES)(
    "%s: mallas válidas y la X centrada en el punto de impacto",
    async (nombre) => {
      const r = await loadResultado(nombre);
      const { lines, impact } = buildCroquisPaint(r);
      esValida(lines);
      esValida(impact);
      if (r.vehiculos.some((v) => v.trayectoria.t.length > 0))
        expect(lines.indices.length).toBeGreaterThan(0);
      const p = r.punto_impacto;
      if (!p) {
        expect(impact.indices).toHaveLength(0);
        return;
      }
      const pts = puntos(impact);
      expect(pts.length).toBeGreaterThan(0);
      const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
      const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
      expect(cx).toBeCloseTo(p.x, 6);
      expect(cy).toBeCloseTo(p.y, 6);
    },
  );

  it("pinta dónde empieza y dónde queda cada vehículo", async () => {
    const r = await loadResultado("interseccion_toluca");
    const pts = puntos(buildCroquisPaint(r).lines);
    for (const v of r.vehiculos) {
      const tr = v.trayectoria;
      const n = tr.t.length;
      const radio = Math.hypot(v.dimensiones.largo_m, v.dimensiones.ancho_m) / 2 + PAINT_WIDTH;
      for (const k of [0, n - 1]) {
        const cerca = pts.some((q) => Math.hypot(q.x - tr.x[k]!, q.y - tr.y[k]!) <= radio);
        expect(cerca, `${v.id} en la muestra ${k}`).toBe(true);
      }
    }
  });

  it("propiedad: mover la escena mueve la pintura lo mismo (nada depende del origen)", async () => {
    const base = await loadResultado("interseccion_toluca");
    const ref = buildCroquisPaint(base);
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (dx, dy) => {
          const movido: Resultado = structuredClone(base);
          for (const v of movido.vehiculos) {
            v.trayectoria.x = v.trayectoria.x.map((x) => x + dx);
            v.trayectoria.y = v.trayectoria.y.map((y) => y + dy);
          }
          if (movido.punto_impacto) {
            movido.punto_impacto.x += dx;
            movido.punto_impacto.y += dy;
          }
          const m = buildCroquisPaint(movido);
          expect(m.lines.indices).toEqual(ref.lines.indices);
          expect(m.impact.indices).toEqual(ref.impact.indices);
          for (const [a, b] of [
            [m.lines, ref.lines],
            [m.impact, ref.impact],
          ] as const) {
            for (let i = 0; i < a.positions.length; i += 2) {
              expect(a.positions[i]! - dx).toBeCloseTo(b.positions[i]!, 6);
              expect(a.positions[i + 1]! - dy).toBeCloseTo(b.positions[i + 1]!, 6);
            }
          }
        },
      ),
      { numRuns: 25, seed: 20261019 },
    );
  });
});
