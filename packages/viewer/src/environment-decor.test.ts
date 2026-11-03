import { roadLayout } from "@croquis/croquis-2d";
import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import {
  corridorsOf,
  distanceToRoad,
  HILLS_SEGMENTS,
  planEnvironment,
  RELIEF_FLAT_M,
  RELIEF_MAX_M,
  terrainHeightAt,
  TREE_CLEAR_M,
  zoneFor,
} from "./environment-decor";

const center = { x: 0, y: 0 };

describe("entorno procedural (T1.3)", () => {
  it("la zona sale del tipo de vía o de las calles del mapa", () => {
    const urbano = loadFixture("lateral_interseccion");
    expect(zoneFor(urbano.lugar)).toBe("urbana");
    const carretera = {
      ...urbano.lugar,
      tipo_via: { ...urbano.lugar.tipo_via, valor: "carretera_dos_carriles" as const },
    };
    expect(zoneFor(carretera)).toBe("rural");
    const vias = [
      {
        puntos: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        ancho: 7,
        tipo: "motorway",
      },
    ];
    expect(zoneFor(urbano.lugar, vias)).toBe("rural");
    expect(zoneFor(urbano.lugar, [{ ...vias[0]!, tipo: "residential" }])).toBe("urbana");
  });

  it("en ciudad hay edificios y árboles de banqueta, nunca sobre la calzada, y es determinista", () => {
    const spec = loadFixture("lateral_interseccion");
    const layout = roadLayout(spec.lugar);
    const corridors = corridorsOf(layout);
    const plan = planEnvironment(spec.lugar, layout, undefined, {
      seed: 102,
      center,
      maxTrees: 200,
    });
    const again = planEnvironment(spec.lugar, layout, undefined, {
      seed: 102,
      center,
      maxTrees: 200,
    });
    expect(plan).toEqual(again);
    expect(plan.zone).toBe("urbana");
    expect(plan.buildings.length).toBeGreaterThan(10);
    expect(plan.trees.length).toBeGreaterThan(10);
    expect(plan.trees.length).toBeLessThanOrEqual(200);
    for (const b of plan.buildings) {
      expect(distanceToRoad({ x: b.x, y: b.y }, corridors)).toBeGreaterThan(3);
      expect(b.floors).toBeGreaterThanOrEqual(1);
      expect(b.floors).toBeLessThanOrEqual(3);
      expect(b.h).toBeGreaterThan(3);
    }
    for (const t of plan.trees) {
      expect(distanceToRoad(t, corridors)).toBeGreaterThan(0.9);
      expect(Math.hypot(t.x - center.x, t.y - center.y)).toBeGreaterThanOrEqual(TREE_CLEAR_M);
    }
    expect(plan.skyline.length).toBeGreaterThan(20);
    // Fachadas y señales (T1.3b): cada lote dice a dónde mira y qué lleva; hay señales genéricas.
    expect(plan.signs.length).toBeGreaterThan(2);
    for (const s of plan.signs)
      expect(["alto", "ceda", "velocidad", "informativa"]).toContain(s.kind);
    expect(plan.buildings.some((b) => b.shutter)).toBe(true);
    expect(plan.buildings.some((b) => b.material === "tabique")).toBe(true);
    expect(plan.parcels).toEqual([]);
    // Otra semilla, otro entorno.
    const otra = planEnvironment(spec.lugar, layout, undefined, {
      seed: 103,
      center,
      maxTrees: 200,
    });
    expect(otra.buildings).not.toEqual(plan.buildings);
  });

  it("en carretera hay parcelas, cercas, postes y grupos de árboles lejos de la vía; sin edificios", () => {
    const base = loadFixture("alcance");
    const lugar = {
      ...base.lugar,
      tipo_via: { ...base.lugar.tipo_via, valor: "carretera_dos_carriles" as const },
    };
    const layout = roadLayout(lugar);
    const corridors = corridorsOf(layout);
    const plan = planEnvironment(lugar, layout, undefined, { seed: 7, center, maxTrees: 200 });
    expect(plan.zone).toBe("rural");
    expect(plan.buildings).toEqual([]);
    expect(plan.parcels.length).toBeGreaterThan(1);
    expect(plan.fences.length).toBeGreaterThan(2);
    // Con el claro de 26 m de la órbita de la cámara (T1.3b) quedan menos postes en la ventana.
    expect(plan.poles.length).toBeGreaterThanOrEqual(1);
    expect(plan.trees.length).toBeGreaterThan(5);
    for (const t of plan.trees) expect(distanceToRoad(t, corridors)).toBeGreaterThanOrEqual(8);
    expect(plan.skyline).toEqual([]);
    expect(plan.signs).toEqual([]);
    // Cerros en capas (T1.3b): el anillo del fondo completo y, delante, arcos a otros radios.
    expect(plan.hills.length).toBeGreaterThanOrEqual(2);
    const fondo = plan.hills[0]!;
    expect(fondo.heights).toHaveLength(HILLS_SEGMENTS);
    expect(fondo.to - fondo.from).toBeCloseTo(Math.PI * 2, 9);
    expect(new Set(plan.hills.map((h) => h.radius)).size).toBeGreaterThanOrEqual(2);
    for (const capa of plan.hills) {
      for (const h of capa.heights) {
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(250);
      }
    }
  });

  it("el relieve es cero en el corredor de la vía y pequeño afuera", () => {
    const spec = loadFixture("alcance");
    const corridors = corridorsOf(roadLayout(spec.lugar));
    const h = terrainHeightAt(102, corridors, "rural");
    const s = roadLayout(spec.lugar).strips[0]!;
    // Sobre la calzada y hasta RELIEF_FLAT_M del borde: plano.
    expect(h(s.center.x, s.center.y)).toBe(0);
    expect(h(s.center.x, s.center.y + s.width / 2 + RELIEF_FLAT_M - 1)).toBe(0);
    // Lejos: dentro del máximo, y continuo (sin saltos de un metro entre puntos vecinos).
    let maxAbs = 0;
    for (let x = -300; x <= 300; x += 10) {
      for (let y = 100; y <= 300; y += 10) {
        const v = h(x, y);
        maxAbs = Math.max(maxAbs, Math.abs(v));
        expect(Math.abs(h(x + 1, y) - v)).toBeLessThan(1);
      }
    }
    expect(maxAbs).toBeGreaterThan(0.3);
    expect(maxAbs).toBeLessThanOrEqual(RELIEF_MAX_M);
  });
});
