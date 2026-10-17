import { roadLayout } from "@croquis/croquis-2d";
import { FIXTURE_NAMES, loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import {
  buildRoadGeometry,
  DASH_HASTA_50,
  DASH_MAS_50,
  dashPatternFor,
  markingsFor,
  meshArea,
  stripLineOffsets,
  type Mesh2D,
} from "./road-geometry";

function pointInMesh(m: Mesh2D, x: number, y: number): boolean {
  for (let i = 0; i < m.indices.length; i += 3) {
    const p = [0, 1, 2].map((k) => {
      const idx = m.indices[i + k] ?? 0;
      return { x: m.positions[2 * idx] ?? 0, y: m.positions[2 * idx + 1] ?? 0 };
    });
    const [a, b, c] = p as [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ];
    const d1 = (x - b.x) * (a.y - b.y) - (a.x - b.x) * (y - b.y);
    const d2 = (x - c.x) * (b.y - c.y) - (b.x - c.x) * (y - c.y);
    const d3 = (x - a.x) * (c.y - a.y) - (c.x - a.x) * (y - a.y);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

function geometryFor(name: (typeof FIXTURE_NAMES)[number]) {
  const spec = loadFixture(name);
  return buildRoadGeometry(roadLayout(spec.lugar), {
    dobleSentido: spec.lugar.sentidos.valor === "doble_sentido",
    banquetas: spec.lugar.banquetas?.valor ?? false,
  });
}

describe("geometría de la vía", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: cada vehículo arranca sobre la calzada y los triángulos miran hacia arriba`, () => {
      const g = geometryFor(name);
      const spec = loadFixture(name);
      for (const v of spec.vehiculos) {
        const p = v.posicion_inicial;
        expect(pointInMesh(g.pavement, p.x, p.y), `${v.id} (${p.x}, ${p.y})`).toBe(true);
      }
      expect(meshArea(g.pavement)).toBeGreaterThan(0);
      expect(g.whiteLines.indices.length).toBeGreaterThan(0);
      const [minX, minY, maxX, maxY] = g.bounds;
      expect(maxX).toBeGreaterThan(minX);
      expect(maxY).toBeGreaterThan(minY);
    });
  }

  it("una recta de doble sentido sin camellón tiene doble raya amarilla al centro", () => {
    const off = stripLineOffsets(
      { center: { x: 0, y: 0 }, length: 100, width: 14, heading: 0, lanes: 4, median: 0 },
      true,
    );
    expect(off.center).toEqual([-0.1, 0.1]);
    expect(off.dashed.sort((a, b) => a - b)).toEqual([-3.5, 3.5]);
    expect(off.edges).toHaveLength(2);
    const uno = stripLineOffsets(
      { center: { x: 0, y: 0 }, length: 100, width: 6.6, heading: 0, lanes: 2, median: 0 },
      false,
    );
    expect(uno.center).toEqual([]);
    expect(uno.dashed).toEqual([0]);
  });

  it("las rayas no cruzan el área de la intersección", () => {
    const g = geometryFor("lateral_interseccion");
    const half = 3.3 - 0.2;
    for (let i = 0; i < g.whiteLines.positions.length; i += 8) {
      const cx = ((g.whiteLines.positions[i] ?? 0) + (g.whiteLines.positions[i + 4] ?? 0)) / 2;
      const cy = ((g.whiteLines.positions[i + 1] ?? 0) + (g.whiteLines.positions[i + 5] ?? 0)) / 2;
      expect(Math.abs(cx) < half && Math.abs(cy) < half).toBe(false);
    }
  });

  it("la calzada de una recta tiene el área de su rectángulo", () => {
    const g = geometryFor("alcance");
    const lay = roadLayout(loadFixture("alcance").lugar);
    const s = lay.strips[0];
    expect(s).toBeDefined();
    if (!s) return;
    expect(meshArea(g.pavement)).toBeCloseTo(s.length * s.width, 6);
  });

  it("los pasos peatonales generan franjas sobre la calzada", () => {
    const lay = roadLayout(loadFixture("peaton_cruce").lugar);
    const g = buildRoadGeometry(lay, {
      dobleSentido: true,
      banquetas: true,
      crosswalks: [{ center: { x: 0, y: 0 }, roadHeading: 0, roadWidth: 12 }],
    });
    expect(g.crosswalks.indices.length / 6).toBe(12);
    expect(meshArea(g.crosswalks)).toBeCloseTo(12 * 3 * 0.5, 9);
  });
});

describe("rayas según el manual y los dispositivos de línea (F8c)", () => {
  it("segmentos de la Tabla II.2-3: 2.5 cada 5 m en calle, 5 cada 10 m en carretera o > 50 km/h", () => {
    expect(DASH_HASTA_50).toEqual({ length: 2.5, gap: 5 });
    expect(DASH_MAS_50).toEqual({ length: 5, gap: 10 });
    expect(dashPatternFor("recta")).toBe(DASH_HASTA_50);
    expect(dashPatternFor("recta", 60)).toBe(DASH_MAS_50);
    expect(dashPatternFor("carretera_dos_carriles")).toBe(DASH_MAS_50);
    expect(dashPatternFor("autopista", 40)).toBe(DASH_MAS_50);
  });

  it("en doble sentido la línea habla de la raya central; en un sentido, de los carriles", () => {
    expect(markingsFor(true, [])).toEqual({ centro: "doble_continua", carriles: "discontinua" });
    expect(markingsFor(true, ["linea_discontinua"]).centro).toBe("discontinua");
    expect(markingsFor(true, ["linea_continua", "linea_discontinua"]).centro).toBe(
      "doble_continua",
    );
    expect(markingsFor(false, ["linea_continua"]).carriles).toBe("continua");
    expect(markingsFor(false, ["linea_discontinua"]).carriles).toBe("discontinua");
  });

  it("con rebase permitido la raya central es sencilla y discontinua, con su patrón", () => {
    const spec = loadFixture("frontal_curva");
    const layout = roadLayout(spec.lugar);
    const base = { dobleSentido: true, banquetas: false };
    const doble = buildRoadGeometry(layout, base);
    const disc = buildRoadGeometry(layout, {
      ...base,
      markings: markingsFor(true, ["linea_discontinua"]),
      dash: DASH_MAS_50,
    });
    // La raya discontinua sencilla pinta menos de la mitad que la doble continua.
    expect(meshArea(disc.yellowLines)).toBeLessThan(meshArea(doble.yellowLines) / 2);
    expect(meshArea(disc.yellowLines)).toBeGreaterThan(0);
  });
});

describe("guarniciones y camellón (F8c)", () => {
  function road(name: (typeof FIXTURE_NAMES)[number]) {
    const spec = loadFixture(name);
    return {
      spec,
      g: buildRoadGeometry(roadLayout(spec.lugar), {
        dobleSentido: spec.lugar.sentidos.valor === "doble_sentido",
        banquetas: spec.lugar.banquetas?.valor ?? false,
        guarniciones: spec.lugar.guarniciones?.valor ?? false,
      }),
    };
  }

  it("con camellón hay camellón elevado del ancho del separador, con sus guarniciones", () => {
    const { spec, g } = road("poste");
    expect(spec.lugar.camellon?.valor).toBe(true);
    const strip = roadLayout(spec.lugar).strips[0]!;
    expect(meshArea(g.medians)).toBeGreaterThan(0.9 * strip.median * strip.length);
    expect(g.curbs.length).toBeGreaterThan(0);
  });

  it("sin banquetas ni guarniciones no hay guarniciones", () => {
    const { spec, g } = road("frontal_curva");
    expect(spec.lugar.banquetas?.valor ?? false).toBe(false);
    expect(spec.lugar.guarniciones?.valor ?? false).toBe(false);
    expect(g.curbs).toHaveLength(0);
  });

  it("las guarniciones se cortan donde la otra vía cruza (no hay muro en el cruce)", () => {
    const { spec, g } = road("lateral_interseccion");
    const layout = roadLayout(spec.lugar);
    expect(g.curbs.length).toBeGreaterThan(0);
    for (const c of g.curbs) {
      const mid = { x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 };
      // Ninguna guarnición pasa por el centro del cruce (dentro de las dos calzadas a la vez).
      const inside = layout.strips.filter((s) => {
        const d = {
          x: Math.cos((s.heading * Math.PI) / 180),
          y: Math.sin((s.heading * Math.PI) / 180),
        };
        const rx = mid.x - s.center.x;
        const ry = mid.y - s.center.y;
        const along = rx * d.x + ry * d.y;
        const across = -rx * d.y + ry * d.x;
        return Math.abs(along) <= s.length / 2 && Math.abs(across) < s.width / 2 - 0.5;
      });
      expect(inside.length).toBe(0);
    }
  });
});
