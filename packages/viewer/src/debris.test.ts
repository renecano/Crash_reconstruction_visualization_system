import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { bakeDebris, debrisPoseAt, mulberry32, type DebrisSpec } from "./debris";
import { attachDebris, planDebris } from "./debris-scene";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph } from "./scene-graph";

const opts = {
  quality: QUALITY_PROFILES.media,
  env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
};

const box = (y: number): DebrisSpec => ({
  kind: "plastico",
  half: [0.05, 0.05, 0.05],
  position: new Vector3(0, y, 0),
  quaternion: new Quaternion(),
  linvel: new Vector3(1, 0, 0),
  angvel: new Vector3(0, 0, 0),
  t0: 0,
});

describe("restos con Rapier", () => {
  it("el generador con semilla es determinista", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("un cuerpo soltado cae, se detiene sobre el piso y el horneado es reproducible", async () => {
    const a = await bakeDebris([box(1)], [], [], 3);
    const b = await bakeDebris([box(1)], [], [], 3);
    expect(Array.from(a.frames)).toEqual(Array.from(b.frames));
    const pos = new Vector3();
    const q = new Quaternion();
    debrisPoseAt(a, 0, 0, pos, q);
    expect(pos.y).toBeCloseTo(1, 6);
    debrisPoseAt(a, 0, 3, pos, q);
    expect(pos.y).toBeGreaterThan(0.03);
    expect(pos.y).toBeLessThan(0.08);
    expect(pos.x).toBeGreaterThan(0);
  });

  it("en el choque de frente se desprenden piezas y quedan restos en el piso al final", async () => {
    const spec = loadFixture("frontal_curva");
    const r = await loadResultado("frontal_curva");
    const sg = buildSceneGraph(spec, r, opts);
    const plan = planDebris(spec, r, sg);
    expect(plan.bodies.some((b) => b.part?.name === "bumper_front")).toBe(true);
    expect(plan.bodies.some((b) => b.kind === "plastico")).toBe(true);
    const att = await attachDebris(spec, r, sg);
    expect(att.counts.pieza).toBeGreaterThan(0);
    const part = plan.bodies.find((b) => b.part);
    const vehicle = sg.vehicles.find((v) => v.id === part?.part?.vehicleId);
    const original = vehicle?.group.getObjectByName(part?.part?.name ?? "");
    sg.update(-0.5);
    expect(original?.scale.x).toBe(1);
    sg.update(r.t_fin);
    expect(original?.scale.x).toBeLessThan(0.001);
    const pos = new Vector3();
    const q = new Quaternion();
    for (let i = 0; i < att.bake.bodies.length; i++) {
      debrisPoseAt(att.bake, i, r.t_fin, pos, q);
      expect(pos.y).toBeGreaterThan(-0.05);
      expect(pos.y).toBeLessThan(2.5);
    }
  });

  it("sin impacto entre vehículos u objetos no hay restos plásticos", async () => {
    const spec = loadFixture("peaton_cruce");
    const r = await loadResultado("peaton_cruce");
    const plan = planDebris(spec, r, buildSceneGraph(spec, r, opts));
    expect(plan.bodies.filter((b) => b.kind === "plastico")).toHaveLength(0);
  });
});
