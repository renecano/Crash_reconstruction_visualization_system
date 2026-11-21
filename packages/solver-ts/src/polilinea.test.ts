/**
 * Ronda 4 (René, 2026-11-19): la trayectoria sigue la geometría real de la calle. Paridad con la
 * referencia Python (`PolylineLanePath`): las mismas poses en una calle que va al norte y dobla al
 * oriente, con y sin cambio de carril y en sentido contrario. Y el carril sigue al eje.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PolylineLanePath } from "./preimpact";
import { laneFollowingPath, roadAxis } from "./road";

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(
  readFileSync(
    resolve(here, "../../scene-schema/fixtures/inversion/resultados/polilinea_poses.json"),
    "utf8",
  ),
) as {
  eje: [number, number][];
  casos: { pose: [number, number, number]; lateral: number; poses: number[][] }[];
};

describe("el carril sigue el eje real de la calle (paridad con Python)", () => {
  it("las mismas poses que la referencia", () => {
    for (const c of ref.casos) {
      const p = new PolylineLanePath(ref.eje, c.pose, 120, c.lateral, 40);
      for (const [s, x, y, h, k] of c.poses) {
        const q = p.pose(s!);
        expect(q.x).toBeCloseTo(x!, 9);
        expect(q.y).toBeCloseTo(y!, 9);
        expect(q.heading).toBeCloseTo(h!, 9);
        expect(q.curvature).toBeCloseTo(k!, 6);
      }
    }
  });

  it("sin cambio de carril, va a la misma distancia del eje y dobla con él", () => {
    const c = ref.casos[0]!;
    const p = new PolylineLanePath(ref.eje, c.pose, 120, 0, 40);
    // Al principio va al norte; después de la curva, al oriente.
    expect(Math.cos(p.pose(0).heading)).toBeCloseTo(0, 1);
    const fin = p.pose(110);
    expect(Math.cos(fin.heading)).toBeGreaterThan(0.95);
    // 1.5 m a la derecha del eje (al oriente al ir al norte; al sur al ir al oriente).
    expect(fin.y).toBeLessThan(10.5);
  });

  it("la escena con `eje_via` usa el eje real; sin él, la plantilla de siempre", () => {
    const lugar = {
      tipo_via: { valor: "curva" },
      carriles_por_sentido: { valor: 1 },
      sentidos: { valor: "doble_sentido" },
    };
    expect(roadAxis(lugar).kind).toBe("arco");
    const conEje = {
      ...lugar,
      eje_via: { puntos: ref.eje.map(([x, y]) => ({ x, y })), fuente: "mapa", confianza: 0.9 },
    };
    const ax = roadAxis(conEje);
    expect(ax.kind).toBe("polilinea");
    expect(laneFollowingPath(ax, [1.5, -40, Math.PI / 2])).toBeInstanceOf(PolylineLanePath);
  });
});
