import { roadLayout } from "@croquis/croquis-2d";
import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { SpotLight } from "three";
import { describe, expect, it } from "vitest";
import { actionBounds } from "./cameras";
import {
  DEFAULT_POLE_HEIGHT_M,
  DEFAULT_POLE_SPACING_M,
  HEADLIGHT_HALF_ANGLE_DEG,
  HEADLIGHT_INTENSITY,
  headlightsOn,
  MAX_PROCEDURAL_POLES,
  NIGHT_LIGHT_BUDGET,
  planNightLights,
  POLE_HEIGHT_M,
  POLE_REACH_M,
  POLE_SPACING_M,
  proceduralPoles,
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

describe("luminarias procedurales (T1.1)", () => {
  it("con alumbrado declarado y sin postes, van a un lado de la vía cada tramo y miran a la calzada", async () => {
    const spec = loadFixture("nocturno_lluvia");
    const r = await loadResultado("nocturno_lluvia");
    const layout = roadLayout(spec.lugar);
    const poles = proceduralPoles(spec, r, layout);
    expect(poles.length).toBeGreaterThanOrEqual(3);
    expect(poles.length).toBeLessThanOrEqual(MAX_PROCEDURAL_POLES);
    const strip = layout.strips[0]!;
    const h = (strip.heading * Math.PI) / 180;
    for (const p of poles) {
      // A un metro fuera de la calzada, del lado derecho del rumbo.
      const dx = p.x - strip.center.x;
      const dy = p.y - strip.center.y;
      const across = -dx * Math.sin(h) + dy * Math.cos(h);
      expect(across).toBeCloseTo(-(strip.width / 2 + 1), 6);
      expect(p.altura_m).toBe(DEFAULT_POLE_HEIGHT_M);
      // El brazo apunta a la calzada: hacia el lado izquierdo del rumbo.
      const arm = (p.rumbo_deg * Math.PI) / 180;
      expect(-Math.cos(arm) * Math.sin(h) + Math.sin(arm) * Math.cos(h)).toBeCloseTo(1, 6);
    }
    // Ordenadas de la más cercana a la acción a la más lejana, con ids estables.
    expect(poles[0]!.id).toBe("luminaria_1");
    const b = actionBounds(r);
    const d = poles.map((p) => Math.hypot(p.x - b.cx, p.y - b.cy));
    expect([...d].sort((a, c) => a - c)).toEqual(d);
    expect(d[d.length - 1]!).toBeLessThanOrEqual(POLE_REACH_M);
    // Separación de la clase de vía (recta: la de omisión), medida a lo largo del eje.
    const along = poles
      .map((p) => (p.x - strip.center.x) * Math.cos(h) + (p.y - strip.center.y) * Math.sin(h))
      .sort((a, c) => a - c);
    for (let i = 1; i < along.length; i++) {
      expect(along[i]! - along[i - 1]!).toBeCloseTo(DEFAULT_POLE_SPACING_M, 6);
    }
  });

  it("en un cruce no caen dentro de la otra calle", async () => {
    const spec = loadFixture("lateral_interseccion");
    const r = await loadResultado("lateral_interseccion");
    const layout = roadLayout(spec.lugar);
    const poles = proceduralPoles(spec, r, layout);
    expect(poles.length).toBeGreaterThan(4);
    for (const p of poles) {
      for (const s of layout.strips) {
        const h = (s.heading * Math.PI) / 180;
        const dx = p.x - s.center.x;
        const dy = p.y - s.center.y;
        const along = dx * Math.cos(h) + dy * Math.sin(h);
        const across = Math.abs(-dx * Math.sin(h) + dy * Math.cos(h));
        if (Math.abs(along) <= s.length / 2) expect(across).toBeGreaterThan(s.width / 2 + 0.5);
      }
    }
  });

  it("con postes declarados no se inventan; con calles del mapa siguen las calles con alumbrado", async () => {
    const spec = loadFixture("poste");
    const r = await loadResultado("poste");
    expect(proceduralPoles(spec, r, roadLayout(spec.lugar))).toEqual([]);
    const noche = loadFixture("nocturno_lluvia");
    const rn = await loadResultado("nocturno_lluvia");
    const vias = [
      {
        puntos: [
          { x: -100, y: 0 },
          { x: 100, y: 0 },
        ],
        ancho: 7,
        tipo: "primary",
      },
      {
        puntos: [
          { x: 0, y: -50 },
          { x: 0, y: 50 },
        ],
        ancho: 4,
        tipo: "service",
      },
    ];
    const poles = proceduralPoles(noche, rn, { strips: [] }, vias);
    expect(poles.length).toBeGreaterThan(2);
    for (const p of poles) {
      expect(p.y).toBeCloseTo(-(7 / 2 + 1), 6); // a la derecha del sentido +x
      expect(p.altura_m).toBe(POLE_HEIGHT_M.primary);
    }
    const xs = poles.map((p) => p.x).sort((a, c) => a - c);
    expect(xs[1]! - xs[0]!).toBeCloseTo(POLE_SPACING_M.primary!, 6);
    // El plan de luces las toma como postes: las más cercanas a la acción hasta el tope.
    const plan = planNightLights(noche, rn, NOCHE, "media", poles);
    expect(plan.poles).toHaveLength(NIGHT_LIGHT_BUDGET.media.poles);
    expect(plan.poles[0]).toBe("luminaria_1");
  });
});
