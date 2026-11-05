import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { CURB_HEIGHT } from "./road-geometry";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph } from "./scene-graph";

describe("los vehículos se apoyan en el piso (René, 2026-11-04, C2)", () => {
  it("en lateral_interseccion la pickup termina sobre la banqueta, a la altura de la guarnición", async () => {
    const spec = loadFixture("lateral_interseccion");
    const r = await loadResultado("lateral_interseccion");
    const sg = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.media,
      env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
    });
    sg.update(r.t_inicio);
    for (const n of sg.vehicles) expect(n.group.position.y).toBeCloseTo(0, 6);
    sg.update(r.t_fin);
    const alturas = sg.vehicles.map((n) => n.group.position.y);
    // Alguna llega a la banqueta (con dos o más llantas arriba); ninguna queda bajo la calzada ni
    // por encima de la guarnición.
    expect(Math.max(...alturas)).toBeGreaterThan(CURB_HEIGHT / 2 - 1e-9);
    for (const y of alturas) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(CURB_HEIGHT + 1e-9);
    }
    sg.dispose();
  });

  it("los marcadores de interfaz van marcados para salir de las fotos del dictamen (C3)", async () => {
    const spec = loadFixture("lateral_interseccion");
    const r = await loadResultado("lateral_interseccion");
    const sg = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.media,
      env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
    });
    const marcados: string[] = [];
    sg.root.traverse((o) => {
      if (o.userData.interfaz === true) marcados.push(o.name);
    });
    expect(marcados).toEqual(expect.arrayContaining(["punto_impacto", "punto_impacto_centro"]));
    sg.dispose();
  });
});
