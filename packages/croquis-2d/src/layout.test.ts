import { FIXTURE_NAMES, loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { DEFAULT_DIMS, roadLayout, sceneLayout, vehicleDims } from "./layout";

describe("sceneLayout", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: dibuja todos los vehículos dentro de la caja envolvente`, () => {
      const spec = loadFixture(name);
      const layout = sceneLayout(spec);
      expect(layout.vehicles.map((v) => v.id)).toEqual(spec.vehiculos.map((v) => v.id));
      const [minX, minY, maxX, maxY] = layout.bounds;
      for (const v of layout.vehicles) {
        expect(v.inicial.x).toBeGreaterThan(minX);
        expect(v.inicial.x).toBeLessThan(maxX);
        expect(v.inicial.y).toBeGreaterThan(minY);
        expect(v.inicial.y).toBeLessThan(maxY);
        expect(v.corners).toHaveLength(4);
      }
      expect(layout.road.tipo).toBe(spec.lugar.tipo_via.valor);
      expect(
        layout.road.strips.length + layout.road.rings.length + layout.road.arcs.length,
      ).toBeGreaterThan(0);
    });
  }

  it("una intersección en X tiene dos franjas cruzadas y una glorieta un anillo", () => {
    const x = roadLayout(loadFixture("lateral_interseccion").lugar);
    expect(x.strips).toHaveLength(2);
    expect(new Set(x.strips.map((s) => s.heading))).toEqual(new Set([0, 90]));
    const g = roadLayout(loadFixture("glorieta").lugar);
    expect(g.rings).toHaveLength(1);
    expect(g.rings[0]?.outerRadius).toBeGreaterThan(g.rings[0]?.innerRadius ?? 0);
    const c = roadLayout(loadFixture("objeto_fijo_arbol").lugar);
    expect(c.arcs).toHaveLength(1);
  });

  it("usa las medidas de la escena y, si faltan, las de respaldo por clase", () => {
    const alcance = loadFixture("alcance");
    expect(vehicleDims(alcance.vehiculos[0]!)).toEqual({ largo: 4.5, ancho: 1.7 });
    const volcadura = loadFixture("volcadura");
    const sinMedidas = volcadura.vehiculos.find((v) => v.id === "veh-b")!;
    expect(vehicleDims(sinMedidas, {})).toEqual(DEFAULT_DIMS.sedan_compacto);
    expect(vehicleDims(sinMedidas).largo).toBeGreaterThan(4);
    expect(
      vehicleDims(sinMedidas, {
        sedan_compacto: {
          masa_kg: [1, 2],
          largo_m: [1, 2],
          ancho_m: [1, 2],
          alto_m: [1, 2],
          distancia_entre_ejes_m: [1, 2],
          velocidad_max_kmh: 1,
          tipico: { masa_kg: 1, largo_m: 4.1, ancho_m: 1.65, alto_m: 1, distancia_entre_ejes_m: 1 },
        },
      }),
    ).toEqual({ largo: 4.1, ancho: 1.65 });
  });

  it("incluye peatones, objetos, dispositivos, evidencias y eventos", () => {
    const l = sceneLayout(loadFixture("peaton_cruce"));
    expect(l.people.map((p) => p.id)).toEqual(["per-peaton"]);
    expect(l.objects.map((o) => o.tipo)).toEqual(["vehiculo_estacionado"]);
    expect(l.devices.map((d) => d.tipo)).toEqual(["paso_peatonal"]);
    expect(l.evidence.map((e) => e.tipo).sort()).toEqual([
      "distancia_proyeccion",
      "marcas_frenado",
    ]);
    expect(l.events.map((e) => e.id)).toEqual(["ev-impacto"]);
  });

  it("comparte con el solver el modelo de curva y glorieta (ADR 0006)", () => {
    const curva = roadLayout(loadFixture("frontal_curva").lugar);
    expect(curva.strips).toHaveLength(0);
    const arc = curva.arcs[0];
    expect(arc?.center).toEqual({ x: 0, y: -120 });
    expect(arc?.radius).toBe(120);
    // El arco cruza el origen tangente a +X: 90° está dentro del intervalo.
    expect(arc?.from).toBeLessThan(90);
    expect(arc?.to).toBeGreaterThan(90);
    const g = roadLayout(loadFixture("glorieta").lugar);
    const ring = g.rings[0];
    expect(ring).toBeDefined();
    if (!ring) return;
    // Borde exterior por el origen: centro en (0, R + W/2).
    expect(ring.center.x).toBe(0);
    expect(ring.center.y).toBeCloseTo(ring.outerRadius, 9);
    // El acceso sur llega al origen.
    const south = g.strips[0];
    expect(south?.center.y ?? 0).toBeCloseTo(-(south?.length ?? 0) / 2, 9);
  });
});
