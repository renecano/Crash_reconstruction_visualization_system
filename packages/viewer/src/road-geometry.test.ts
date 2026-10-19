import { roadLayout } from "@croquis/croquis-2d";
import { FIXTURE_NAMES, loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import {
  buildMapRoadGeometry,
  type MapVia,
  SIDEWALK_WIDTH,
  buildRoadGeometry,
  CROSSWALK_LENGTH,
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

  it("donde un paso peatonal cruza el camellón, se corta a nivel de calle (refugio)", () => {
    const spec = loadFixture("poste");
    const layout = roadLayout(spec.lugar);
    const strip = layout.strips[0]!;
    const opts = {
      dobleSentido: true,
      banquetas: spec.lugar.banquetas?.valor ?? false,
      guarniciones: true,
    };
    const sin = buildRoadGeometry(layout, opts);
    const con = buildRoadGeometry(layout, {
      ...opts,
      crosswalks: [{ center: strip.center, roadHeading: strip.heading, roadWidth: strip.width }],
    });
    const corte = meshArea(sin.medians) - meshArea(con.medians);
    // Se quita la franja del paso (3 m a lo largo de la vía) a lo ancho del camellón.
    expect(corte).toBeCloseTo(CROSSWALK_LENGTH * strip.median, 0);
    // Tampoco quedan guarniciones del camellón dentro del paso (las del refugio se quitan).
    const h = (strip.heading * Math.PI) / 180;
    const local = (q: { x: number; y: number }) => {
      const rx = q.x - strip.center.x;
      const ry = q.y - strip.center.y;
      return {
        along: rx * Math.cos(h) + ry * Math.sin(h),
        across: -rx * Math.sin(h) + ry * Math.cos(h),
      };
    };
    const delCamellonEnElPaso = con.curbs.filter((c) => {
      const m = local({ x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 });
      return (
        Math.abs(m.across) <= strip.median / 2 + 0.01 &&
        Math.abs(m.along) < CROSSWALK_LENGTH / 2 - 0.2
      );
    });
    expect(delCamellonEnElPaso).toHaveLength(0);
    expect(sin.curbs.some((c) => Math.abs(local(c.a).along) < 1)).toBe(true);
  });

  it("las rayas centrales se interrumpen en el paso peatonal; las orillas siguen", () => {
    const spec = loadFixture("poste");
    const layout = roadLayout(spec.lugar);
    const strip = layout.strips[0]!;
    const opts = { dobleSentido: true, banquetas: false, guarniciones: true };
    const sin = buildRoadGeometry(layout, opts);
    const con = buildRoadGeometry(layout, {
      ...opts,
      crosswalks: [{ center: strip.center, roadHeading: strip.heading, roadWidth: strip.width }],
    });
    expect(meshArea(con.yellowLines)).toBeLessThan(meshArea(sin.yellowLines));
    expect(meshArea(con.yellowLines)).toBeGreaterThan(0.9 * meshArea(sin.yellowLines));
  });

  it("sin pasos peatonales el camellón queda igual que antes", () => {
    const { g } = road("poste");
    const spec = loadFixture("poste");
    const again = buildRoadGeometry(roadLayout(spec.lugar), {
      dobleSentido: spec.lugar.sentidos.valor === "doble_sentido",
      banquetas: spec.lugar.banquetas?.valor ?? false,
      guarniciones: spec.lugar.guarniciones?.valor ?? false,
      crosswalks: [],
    });
    expect(again.medians.positions).toEqual(g.medians.positions);
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

describe("calzada desde las calles del mapa (ADR 0023)", () => {
  it("cubre cada calle con su ancho y cierra las uniones", () => {
    const vias = [
      {
        puntos: [
          { x: -50, y: 0 },
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
        ancho: 10,
      },
      {
        puntos: [
          { x: 0, y: -40 },
          { x: 0, y: 40 },
        ],
        ancho: 7,
      },
    ];
    const g = buildMapRoadGeometry(vias);
    for (const [x, y] of [
      [-49, 4.5],
      [0, 0],
      [49, -4.5],
      [0, 39],
      [3, -30],
    ] as const) {
      expect(pointInMesh(g.pavement, x, y)).toBe(true);
    }
    expect(pointInMesh(g.pavement, 20, 20)).toBe(false);
    // Área: al menos la de los rectángulos (los discos de las uniones se traslapan con ellos).
    expect(meshArea(g.pavement)).toBeGreaterThan(100 * 10 + 80 * 7 - 70);
    expect(g.bounds[0]).toBeLessThanOrEqual(-55);
    expect(g.bounds[3]).toBeGreaterThanOrEqual(43.5);
    expect(g.curbs).toEqual([]);
    expect(g.whiteLines.indices).toEqual([]);
  });
});

describe("rayas, banquetas y guarniciones en las calles del mapa (ADR 0039)", () => {
  const recta = (puntos: [number, number][], extra: Partial<MapVia> = {}): MapVia => ({
    puntos: puntos.map(([x, y]) => ({ x, y })),
    ancho: 12,
    ...extra,
  });
  /** Centros de los cuadros de una malla (las rayas y banquetas son rectángulos). */
  const centros = (m: { positions: number[] }) => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < m.positions.length; i += 8) {
      out.push({
        x: (m.positions[i]! + m.positions[i + 4]!) / 2,
        y: (m.positions[i + 1]! + m.positions[i + 5]!) / 2,
      });
    }
    return out;
  };

  it("sin carriles de OSM no se pintan rayas; con ellos, como en las plantillas", () => {
    const sin = buildMapRoadGeometry([
      recta([
        [-50, 0],
        [50, 0],
      ]),
    ]);
    expect(meshArea(sin.whiteLines)).toBe(0);
    const doble = buildMapRoadGeometry([
      recta(
        [
          [-50, 0],
          [50, 0],
        ],
        { carriles: 4 },
      ),
    ]);
    expect(meshArea(doble.yellowLines)).toBeGreaterThan(0);
    expect(meshArea(doble.whiteLines)).toBeGreaterThan(0);
    const uno = buildMapRoadGeometry([
      recta(
        [
          [-50, 0],
          [50, 0],
        ],
        { carriles: 3, unSentido: true },
      ),
    ]);
    expect(meshArea(uno.yellowLines)).toBe(0);
    expect(meshArea(uno.whiteLines)).toBeGreaterThan(0);
  });

  it("en un cruce, las rayas de una calle no atraviesan la calzada de la otra", () => {
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
    const g = buildMapRoadGeometry([h, v]);
    for (const c of centros(g.yellowLines)) {
      const enH = Math.abs(c.y) <= 6;
      const enV = Math.abs(c.x) <= 4;
      expect(enH && enV).toBe(false);
    }
  });

  it("una calle que sigue en otra vía de OSM, en línea, no se corta", () => {
    const partida = buildMapRoadGeometry([
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
    const entera = buildMapRoadGeometry([
      recta(
        [
          [-50, 0],
          [50, 0],
        ],
        { carriles: 2 },
      ),
    ]);
    expect(meshArea(partida.yellowLines)).toBeCloseTo(meshArea(entera.yellowLines), 6);
  });

  it("banquetas y guarniciones si la escena las declara, salvo en autopistas", () => {
    const via = recta([
      [-50, 0],
      [50, 0],
    ]);
    expect(meshArea(buildMapRoadGeometry([via]).sidewalk)).toBe(0);
    const con = buildMapRoadGeometry([via], { banquetas: true });
    expect(meshArea(con.sidewalk)).toBeCloseTo(2 * 100 * SIDEWALK_WIDTH, 6);
    expect(con.curbs.length).toBeGreaterThan(0);
    const autopista = buildMapRoadGeometry([{ ...via, tipo: "motorway" }], { banquetas: true });
    expect(meshArea(autopista.sidewalk)).toBe(0);
  });

  it("las banquetas se cortan donde cruza otra calle", () => {
    const h = recta([
      [-60, 0],
      [60, 0],
    ]);
    const v = recta(
      [
        [0, -60],
        [0, 60],
      ],
      { ancho: 8 },
    );
    const g = buildMapRoadGeometry([h, v], { banquetas: true });
    for (const c of centros(g.sidewalk)) {
      // Ninguna banqueta de la horizontal cae en la calzada de la vertical, ni al revés.
      const enCalzadaV = Math.abs(c.x) < 4 && Math.abs(c.y) > 6;
      const enCalzadaH = Math.abs(c.y) < 6 && Math.abs(c.x) > 4;
      expect(enCalzadaV || enCalzadaH).toBe(false);
    }
  });

  it("en una avenida de dos cuerpos muy juntos, la banqueta de uno no cae en el otro", () => {
    const a = recta(
      [
        [-50, 0],
        [50, 0],
      ],
      { ancho: 8 },
    );
    const b = recta(
      [
        [-50, 10],
        [50, 10],
      ],
      { ancho: 8 },
    );
    const g = buildMapRoadGeometry([a, b], { banquetas: true });
    for (const c of centros(g.sidewalk)) {
      expect(Math.abs(c.y) < 4 || Math.abs(c.y - 10) < 4).toBe(false);
    }
    // La de afuera de cada cuerpo sigue entera.
    expect(centros(g.sidewalk).some((c) => c.y < -4)).toBe(true);
    expect(centros(g.sidewalk).some((c) => c.y > 14)).toBe(true);
  });
});
