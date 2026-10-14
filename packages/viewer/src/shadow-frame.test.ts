import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { BufferGeometry, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph, splitByShadow } from "./scene-graph";
import { sunShadowFrame, triangleInShadow } from "./shadow-frame";

function area(g: BufferGeometry | null): number {
  if (!g) return 0;
  const p = g.getAttribute("position");
  let s = 0;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    s += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
  }
  return s;
}

describe("zona de sombra del sol", () => {
  it("la vía se parte sin perder área; lo lejano queda fuera de la cámara de sombra", async () => {
    const r = await loadResultado("glorieta");
    const frame = sunShadowFrame(r, [0.3, -0.4, 0.86]);
    // Franja de 400 m × 7 m que cruza la zona de acción.
    const strip = {
      positions: [-200, -3.5, 200, -3.5, 200, 3.5, -200, 3.5],
      indices: [0, 1, 2, 0, 2, 3],
    };
    const { near, far } = splitByShadow(strip, 0, frame);
    expect(area(near) + area(far)).toBeCloseTo(400 * 7, 3);
    expect(area(near)).toBeGreaterThan(0);
    expect(area(far)).toBeGreaterThan(area(near));
    const p = far!.getAttribute("position");
    for (let i = 0; i < p.count; i += 3) {
      const tri = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(p, i + k)) as [
        Vector3,
        Vector3,
        Vector3,
      ];
      expect(triangleInShadow(frame, ...tri)).toBe(false);
    }
  });

  it("el grafo divide la calzada solo con sombras y dirección de luz", async () => {
    const spec = loadFixture("glorieta");
    const r = await loadResultado("glorieta");
    const base = { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false };
    const lit = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.media,
      env: { ...base, lightDirection: [0.3, -0.4, 0.86] },
    });
    const names = (g: typeof lit) =>
      (g.root.getObjectByName("via")?.children ?? []).map((m) => m.name);
    expect(names(lit)).toContain("calzada");
    expect(names(lit)).toContain("calzada_sin_sombra");
    const far = lit.root.getObjectByName("calzada_sin_sombra") as Mesh;
    expect(far.receiveShadow).toBe(false);
    const plain = buildSceneGraph(spec, r, { quality: QUALITY_PROFILES.media, env: base });
    expect(names(plain)).not.toContain("calzada_sin_sombra");
    const low = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.baja,
      env: { ...base, lightDirection: [0.3, -0.4, 0.86] },
    });
    expect(names(low)).not.toContain("calzada_sin_sombra");
  });
});
