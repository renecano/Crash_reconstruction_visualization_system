import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { Mesh } from "three";
import { describe, expect, it } from "vitest";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph } from "./scene-graph";

const opts = {
  quality: QUALITY_PROFILES.media,
  env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
};

async function graph(name: Parameters<typeof loadFixture>[0]) {
  const r = await loadResultado(name);
  return { r, sg: buildSceneGraph(loadFixture(name), r, opts) };
}

describe("daño en la escena", () => {
  it("la deformación es nula antes del impacto y completa al terminar el contacto", async () => {
    const { sg } = await graph("lateral_interseccion");
    const a = sg.vehicles.find((v) => v.id === "veh-a");
    const body = a?.group.getObjectByName("fusion_pintura") as Mesh;
    sg.update(-0.5);
    expect(body.morphTargetInfluences?.[0]).toBe(0);
    sg.update(0.06);
    expect(body.morphTargetInfluences?.[0]).toBeCloseTo(0.5, 9);
    sg.update(0.5);
    expect(body.morphTargetInfluences?.[0]).toBe(1);
    // La pintura dañada usa el material de nodos con transferencia del otro vehículo.
    expect((body.material as { isNodeMaterial?: boolean }).isNodeMaterial).toBe(true);
  });

  it("el parabrisas se agrieta solo si la cabeza del peatón pega en él", async () => {
    const { r, sg } = await graph("peaton_cruce");
    const p = r.personas.find((x) => x.proyeccion);
    const head = p?.proyeccion?.contacto.cabeza;
    const v = sg.vehicles[0];
    const ws = v?.group.getObjectByName("windshield") as Mesh;
    const cracked = (ws.material as { isNodeMaterial?: boolean }).isNodeMaterial === true;
    expect(cracked).toBe(head === "parabrisas");
    expect(v?.rig.notas.join(" ").includes("Parabrisas agrietado")).toBe(head === "parabrisas");
  });

  it("el choque de frente rompe faros y decide bolsas de aire con el umbral referenciado", async () => {
    const { r, sg } = await graph("frontal_curva");
    for (const n of sg.vehicles) {
      const v = r.vehiculos.find((x) => x.id === n.id);
      expect(n.rig.airbag.motivo).toMatch(/Frontal|Lateral|trasero|dos ruedas|Sin impacto/);
      if ((v?.delta_v_kmh ?? 0) > 30 && n.rig.airbag.umbralKmh) {
        expect(n.rig.airbag.frontal).toBe(true);
        sg.update(0.5);
        expect(n.group.getObjectByName("bolsa_frontal")?.scale.x).toBeGreaterThan(0.5);
      }
    }
    const notas = sg.vehicles.flatMap((n) => n.rig.notas).join(" ");
    expect(notas).toMatch(/Faros? rotos?/);
  });

  it("sin impacto no hay daño", async () => {
    const { sg } = await graph("volcadura");
    const b = sg.vehicles.find((v) => v.id === "veh-b");
    expect(b?.rig.damage).toBeNull();
  });
});
