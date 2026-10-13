import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { Mesh } from "three";
import { describe, expect, it } from "vitest";
import { computeGroundMarks, puddleRadius, visibleCount, type MarkVehicle } from "./ground-marks";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph } from "./scene-graph";

const straight = (over: Partial<MarkVehicle> = {}): MarkVehicle => {
  const t = Array.from({ length: 101 }, (_, i) => -1 + i * 0.02);
  return {
    id: "v",
    clase: "sedan_mediano",
    dims: { length: 4.6, width: 1.8, height: 1.45, wheelbase: 2.7 },
    track: {
      t,
      x: t.map((s) => 10 * s),
      y: t.map(() => 0),
      rumbo: t.map(() => 0),
      vx: t.map(() => 10),
      vy: t.map(() => 0),
      vel_angular: t.map(() => 0),
    },
    abs: false,
    bloqueadas: false,
    aplastamientoFrontal: 0,
    ...over,
  };
};

describe("marcas en el piso", () => {
  it("frenar sin ABS deja marcas solo entre el inicio de frenado y el impacto", () => {
    const m = computeGroundMarks([straight({ tFrenado: -0.5 })]);
    expect(m.frenado.length).toBeGreaterThan(0);
    expect(m.frenado.every((q) => q.t > -0.5 && q.t < 0)).toBe(true);
    expect(computeGroundMarks([straight({ tFrenado: -0.5, abs: true })]).frenado).toHaveLength(0);
    expect(computeGroundMarks([straight()]).frenado).toHaveLength(0);
  });

  it("después del impacto: bloqueadas siempre marcan; rodando solo si deslizan de lado", () => {
    expect(
      computeGroundMarks([straight({ bloqueadas: true, tReposo: 1 })]).derrape.length,
    ).toBeGreaterThan(0);
    expect(computeGroundMarks([straight({ tReposo: 1 })]).derrape).toHaveLength(0);
    const yawing = straight({ tReposo: 1 });
    yawing.track = { ...yawing.track, vel_angular: yawing.track.t.map((s) => (s > 0 ? 1.5 : 0)) };
    expect(computeGroundMarks([yawing]).derrape.length).toBeGreaterThan(0);
  });

  it("las marcas aparecen conforme pasa el tiempo y el charco crece desde el reposo", () => {
    const m = computeGroundMarks([
      straight({ tFrenado: -0.8, aplastamientoFrontal: 0.4, tReposo: 0.5 }),
    ]);
    expect(visibleCount(m.frenado, -1)).toBe(0);
    expect(visibleCount(m.frenado, -0.4)).toBeGreaterThan(0);
    expect(visibleCount(m.frenado, 0)).toBe(m.frenado.length);
    const c = m.charcos[0];
    expect(c).toBeDefined();
    if (!c) return;
    expect(puddleRadius(c, 0.4)).toBe(0);
    expect(puddleRadius(c, 2)).toBeGreaterThan(0);
    expect(puddleRadius(c, 9)).toBeCloseTo(c.radius, 12);
  });

  it("en la escena de alcance el vehículo que frenó deja marcas antes del impacto", async () => {
    const r = await loadResultado("alcance");
    const sg = buildSceneGraph(loadFixture("alcance"), r, {
      quality: QUALITY_PROFILES.media,
      env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
    });
    const mesh = sg.root.getObjectByName("marcas_frenado") as Mesh | undefined;
    expect(mesh).toBeDefined();
    if (!mesh) return;
    sg.update(r.t_inicio);
    expect(mesh.geometry.drawRange.count).toBe(0);
    sg.update(0);
    expect(mesh.geometry.drawRange.count).toBeGreaterThan(0);
  });
});
