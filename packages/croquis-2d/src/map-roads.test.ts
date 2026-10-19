import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mapCrossings, mapLaneLines, mapViaLineOffsets, type MapVia } from "./map-roads";

const recta = (puntos: [number, number][], extra: Partial<MapVia> = {}): MapVia => ({
  puntos: puntos.map(([x, y]) => ({ x, y })),
  ancho: 12,
  ...extra,
});
const largo = (l: { a: { x: number; y: number }; b: { x: number; y: number } }) =>
  Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);

describe("rayas de las calles del mapa en el croquis 2D (ADR 0041)", () => {
  it("sin carriles de OSM no hay rayas; con ellos, las mismas posiciones que en el visor", () => {
    expect(
      mapLaneLines([
        recta([
          [-50, 0],
          [50, 0],
        ]),
      ]),
    ).toEqual([]);
    // Doble sentido, 4 carriles: el eje y una raya de carril por sentido, de punta a punta.
    const doble = mapLaneLines([
      recta(
        [
          [-50, 0],
          [50, 0],
        ],
        { carriles: 4 },
      ),
    ]);
    expect(doble.map((l) => l.a.y).sort((p, q) => p - q)).toEqual([-3, 0, 3]);
    for (const l of doble) expect(largo(l)).toBeCloseTo(100, 9);
    // Un sentido, 3 carriles: dos rayas de carril y ninguna en el eje.
    const uno = mapLaneLines([
      recta(
        [
          [-50, 0],
          [50, 0],
        ],
        { carriles: 3, unSentido: true },
      ),
    ]);
    expect(uno.map((l) => l.a.y).sort((p, q) => p - q)).toEqual([-2, 2]);
    expect(mapViaLineOffsets(recta([[0, 0]], { carriles: 3, unSentido: true }))!.dashed).toEqual([
      -2, 2,
    ]);
  });

  it("en un cruce, las rayas se cortan en la calzada de la otra calle y siguen del otro lado", () => {
    const h = recta(
      [
        [-60, 0],
        [60, 0],
      ],
      { carriles: 4 },
    );
    const v = recta(
      [
        [0, -60],
        [0, 60],
      ],
      { carriles: 2, ancho: 8 },
    );
    const lines = mapLaneLines([h, v]);
    // El eje de cada calle queda en dos tramos, uno a cada lado del cruce.
    const ejeH = lines.filter((l) => l.via === 0 && Math.abs(l.a.y) < 1e-9);
    expect(ejeH).toHaveLength(2);
    for (const l of ejeH) {
      expect(Math.min(Math.abs(l.a.x), Math.abs(l.b.x))).toBeGreaterThanOrEqual(4);
      expect(Math.min(Math.abs(l.a.x), Math.abs(l.b.x))).toBeLessThanOrEqual(5);
    }
    const ejeV = lines.filter((l) => l.via === 1);
    expect(ejeV).toHaveLength(2);
    for (const l of ejeV) {
      expect(Math.min(Math.abs(l.a.y), Math.abs(l.b.y))).toBeGreaterThanOrEqual(6);
    }
  });

  it("una calle que sigue en otra vía de OSM, en línea, no se corta", () => {
    const lines = mapLaneLines([
      recta(
        [
          [-50, 0],
          [0, 0],
        ],
        { carriles: 2 },
      ),
      recta(
        [
          [0, 0],
          [50, 0],
        ],
        { carriles: 2 },
      ),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.reduce((s, l) => s + largo(l), 0)).toBeCloseTo(100, 9);
  });

  it("propiedad: ningún tramo de raya pasa por la calzada de una calle que la cruza", () => {
    const via = fc.record({
      x0: fc.double({ min: -40, max: 40, noNaN: true }),
      y0: fc.double({ min: -40, max: 40, noNaN: true }),
      rumbo: fc.double({ min: 0, max: Math.PI, noNaN: true }),
      largo: fc.double({ min: 10, max: 80, noNaN: true }),
      carriles: fc.integer({ min: 1, max: 6 }),
      unSentido: fc.boolean(),
      ancho: fc.double({ min: 6, max: 20, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(via, { minLength: 1, maxLength: 4 }), (spec) => {
        const vias: MapVia[] = spec.map((s) => ({
          puntos: [
            { x: s.x0, y: s.y0 },
            { x: s.x0 + Math.cos(s.rumbo) * s.largo, y: s.y0 + Math.sin(s.rumbo) * s.largo },
          ],
          ancho: s.ancho,
          carriles: s.carriles,
          unSentido: s.unSentido,
        }));
        const { inCrossing } = mapCrossings(vias);
        for (const l of mapLaneLines(vias)) {
          const len = largo(l);
          if (len < 1e-9) continue;
          const d = { x: (l.b.x - l.a.x) / len, y: (l.b.y - l.a.y) / len };
          // Cada metro del tramo, por su centro (como se probó al cortarlo).
          for (let s = 0.5; s < len - 0.5; s += 1) {
            const p = { x: l.a.x + d.x * s, y: l.a.y + d.y * s };
            expect(inCrossing(p, vias[l.via]!, d, 0.5 - 0.51)).toBe(false);
          }
        }
      }),
      { seed: 41, numRuns: 200 },
    );
  });
});
