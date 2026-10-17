import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { SpotLight } from "three";
import { describe, expect, it } from "vitest";
import {
  HEADLIGHT_HALF_ANGLE_DEG,
  HEADLIGHT_INTENSITY,
  headlightsOn,
  NIGHT_LIGHT_BUDGET,
  planNightLights,
} from "./night-lights";
import { QUALITY_PROFILES, type QualityLevel } from "./quality";
import { buildSceneGraph } from "./scene-graph";

const NOCHE = { night: true, streetLights: true };

function spots(root: { traverse(fn: (o: unknown) => void): void }, name: string): SpotLight[] {
  const out: SpotLight[] = [];
  root.traverse((o) => {
    if (o instanceof SpotLight && o.name === name) out.push(o);
  });
  return out;
}

describe("luces de noche (F8b)", () => {
  it("sin dato las luces van encendidas, como en el solver; lo declarado manda", () => {
    expect(headlightsOn(loadFixture("frontal_curva"), "veh-a")).toBe(true);
    expect(headlightsOn(loadFixture("alcance"), "veh-a")).toBe(false);
    expect(headlightsOn(loadFixture("nocturno_lluvia"), "veh-b")).toBe(true);
  });

  it("de día no hay focos; de noche, hasta el tope del nivel de calidad", async () => {
    const spec = loadFixture("poste");
    const r = await loadResultado("poste");
    expect(planNightLights(spec, r, { night: false, streetLights: false }, "alta")).toEqual({
      vehicles: [],
      poles: [],
    });
    for (const q of ["baja", "media", "alta"] as QualityLevel[]) {
      const plan = planNightLights(spec, r, NOCHE, q);
      expect(plan.vehicles.length).toBeLessThanOrEqual(NIGHT_LIGHT_BUDGET[q].vehicles);
      expect(plan.poles.length).toBeLessThanOrEqual(NIGHT_LIGHT_BUDGET[q].poles);
    }
    expect(planNightLights(spec, r, NOCHE, "media")).toEqual({
      vehicles: ["veh-a"],
      poles: ["poste-impacto"],
    });
    // Sin alumbrado público el poste no da luz.
    expect(planNightLights(spec, r, { night: true, streetLights: false }, "media").poles).toEqual(
      [],
    );
  });

  it("un vehículo con las luces apagadas no lleva foco", async () => {
    const spec = loadFixture("alcance");
    const r = await loadResultado("alcance");
    expect(planNightLights(spec, r, NOCHE, "alta").vehicles).toEqual([]);
  });

  it("la escena lleva los focos del plan, con el cono del solver, y el del poste apunta abajo", async () => {
    const spec = loadFixture("poste");
    const r = await loadResultado("poste");
    const sg = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.media,
      env: { night: true, wet: true, groundColor: "#2a3326", streetLights: true },
    });
    const faros = spots(sg.root, "luz_faros");
    expect(faros).toHaveLength(1);
    expect(faros[0]!.angle).toBeCloseTo((HEADLIGHT_HALF_ANGLE_DEG * Math.PI) / 180, 12);
    const poste = spots(sg.root, "luz_poste");
    expect(poste).toHaveLength(1);
    expect(poste[0]!.target.position.y).toBeLessThan(poste[0]!.position.y);
    // En baja no hay focos: solo brillan los materiales.
    const baja = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.baja,
      env: { night: true, wet: true, groundColor: "#2a3326", streetLights: true },
    });
    expect(spots(baja.root, "luz_faros")).toHaveLength(0);
    sg.dispose();
    baja.dispose();
  });

  it("los faros rotos por el choque apagan el foco después del impacto", async () => {
    const spec = loadFixture("frontal_curva");
    const r = await loadResultado("frontal_curva");
    const sg = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.alta,
      env: { night: true, wet: false, groundColor: "#2a3326", streetLights: false },
    });
    sg.update(r.t_inicio);
    const antes = spots(sg.root, "luz_faros").map((s) => s.intensity);
    expect(antes.every((i) => i === HEADLIGHT_INTENSITY)).toBe(true);
    sg.update(r.t_fin);
    const rotos = sg.vehicles.filter((n) => n.rig.notas.join(" ").match(/Faros? rotos?/));
    expect(rotos.length).toBeGreaterThan(0);
    for (const n of rotos) {
      const s = spots(n.group, "luz_faros")[0]!;
      expect(s.intensity).toBeLessThan(HEADLIGHT_INTENSITY);
      expect(s.intensity).toBe(HEADLIGHT_INTENSITY * n.rig.workingHeadlights(r.t_fin));
    }
    sg.dispose();
  });
});
