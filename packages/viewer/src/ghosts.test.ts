import { loadResultado } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { toThree } from "./coords";
import { buildGhostLayer, compareHypotheses } from "./ghosts";
import { sampleVehicle } from "./sample";

describe("hipótesis (fantasmas)", () => {
  it("cada vehículo de la hipótesis sigue su propia trayectoria", async () => {
    const r = await loadResultado("lateral_interseccion");
    const layer = buildGhostLayer(r);
    expect(layer.group.children).toHaveLength(r.vehiculos.length);
    const t = 0.5;
    layer.update(t);
    r.vehiculos.forEach((v, i) => {
      const pose = sampleVehicle(v.trayectoria, t);
      const [x, , z] = toThree(pose.x, pose.y, 0);
      const g = layer.group.children[i]!;
      expect(g.position.x).toBeCloseTo(x, 6);
      expect(g.position.z).toBeCloseTo(z, 6);
      expect(g.rotation.y).toBeCloseTo(pose.yaw, 6);
    });
    layer.dispose();
  });

  it("la comparación consigo misma no tiene diferencias", async () => {
    const r = await loadResultado("alcance");
    for (const d of compareHypotheses(r, r)) {
      expect(d.v_impacto_kmh[0]).toBe(d.v_impacto_kmh[1]);
      expect(d.separacion_reposo_m).toBe(0);
    }
  });

  it("la comparación reporta la diferencia por vehículo", async () => {
    const base = await loadResultado("alcance");
    const otra = structuredClone(base);
    otra.vehiculos[0]!.v_impacto_kmh += 10;
    otra.vehiculos[0]!.pose_final.x += 3;
    otra.vehiculos[0]!.pose_final.y += 4;
    const d = compareHypotheses(base, otra)[0]!;
    expect(d.v_impacto_kmh[1] - d.v_impacto_kmh[0]).toBeCloseTo(10, 9);
    expect(d.separacion_reposo_m).toBeCloseTo(5, 9);
  });
});
