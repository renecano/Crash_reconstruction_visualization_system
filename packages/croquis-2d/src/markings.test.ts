import { loadFixture, type EscenaSpec } from "@croquis/scene-schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { roadLayout, sceneLayout } from "./layout";
import {
  controlledVehicles,
  crosswalkLength,
  sceneCrosswalks,
  STOP_LINE_GAP,
  STOP_LINE_WIDTH,
  stopLines,
  type Crosswalk,
} from "./markings";

function lines(spec: EscenaSpec, crosswalks?: Crosswalk[]) {
  const layout = roadLayout(spec.lugar);
  const mw = layout.strips[0]?.width ?? 7;
  return stopLines(
    spec,
    layout,
    sceneLayout(spec).mapa?.vias,
    crosswalks ?? sceneCrosswalks(spec.lugar, mw),
  );
}

describe("raya de alto (NOM-034, 5.8; ADR 0044)", () => {
  it("en un cruce con semáforo, 1.20 m antes de la vía que cruza, en los carriles de su sentido", () => {
    // Calle principal de un sentido (2 × 3.3 m) y secundaria de uno (3.3 m).
    const spec = loadFixture("lateral_interseccion");
    expect(controlledVehicles(spec)).toEqual(["veh-a", "veh-b"]);
    const [a, b] = lines(spec);
    // A viene del poniente por la principal: la secundaria empieza en x = -1.65.
    expect(a!.center.x).toBeCloseTo(-1.65 - STOP_LINE_GAP - STOP_LINE_WIDTH / 2, 1);
    expect(a!.center.y).toBeCloseTo(0, 6);
    expect(a!.heading).toBeCloseTo(0, 6);
    expect(a!.length).toBeCloseTo(6.6, 6);
    // B viene del sur por la secundaria: la principal empieza en y = -3.3.
    expect(b!.center.y).toBeCloseTo(-3.3 - STOP_LINE_GAP - STOP_LINE_WIDTH / 2, 1);
    expect(b!.heading).toBeCloseTo(90, 6);
    expect(b!.length).toBeCloseTo(3.3, 6);
  });

  it("en una recta no hay vía que se cruce: no se dibuja", () => {
    expect(lines(loadFixture("alcance"))).toEqual([]);
  });

  it("en las calles del mapa, solo a lo ancho de la calzada por la que llega", () => {
    const spec = loadFixture("interseccion_toluca");
    const ls = lines(spec);
    expect(ls).toHaveLength(2);
    const vias = sceneLayout(spec).mapa!.vias;
    for (const l of ls) {
      // El ancho de la raya es el de una calzada del mapa (todas son de un sentido aquí).
      expect(vias.some((v) => Math.abs(v.ancho - l.length) < 1e-6)).toBe(true);
    }
  });

  it("con paso peatonal en el camino, 1.20 m antes del paso; en doble sentido, la mitad derecha", () => {
    const spec = structuredClone(loadFixture("lateral_interseccion"));
    spec.lugar.sentidos = { ...spec.lugar.sentidos, valor: "doble_sentido" };
    const layout = roadLayout(spec.lugar);
    const main = layout.strips[0]!;
    const sec = layout.strips[1]!;
    const cw: Crosswalk = {
      center: { x: -sec.width / 2 - 4, y: 0 },
      roadHeading: 0,
      roadWidth: main.width,
      length: crosswalkLength("interseccion_x", 2, false),
    };
    const a = lines(spec, [cw])[0]!;
    expect(a.center.x).toBeCloseTo(
      cw.center.x - cw.length / 2 - STOP_LINE_GAP - STOP_LINE_WIDTH / 2,
      1,
    );
    // A va hacia +x: su lado derecho es y < 0, del eje a la orilla.
    expect(a.length).toBeCloseTo(main.width / 2, 6);
    expect(a.center.y).toBeCloseTo(-main.width / 4, 6);
  });

  it("un alto sin `aplica_a` aplica al vehículo más cercano", () => {
    const spec = structuredClone(loadFixture("lateral_interseccion"));
    spec.lugar.dispositivos = [
      {
        id: "alto-1",
        tipo: "alto",
        posicion: { x: 2.5, y: -8 },
        procedencia: { fuente: "supuesto", confianza: 0.5 },
      },
    ];
    expect(controlledVehicles(spec)).toEqual(["veh-b"]);
    expect(lines(spec)).toHaveLength(1);
  });

  it("propiedad: la raya queda fuera de la calle que se cruza y dentro de la suya", () => {
    const base = loadFixture("lateral_interseccion");
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: -6, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.boolean(),
        (x, y, doble) => {
          const spec = structuredClone(base);
          spec.lugar.sentidos = {
            ...spec.lugar.sentidos,
            valor: doble ? "doble_sentido" : "un_sentido",
          };
          spec.vehiculos[0]!.posicion_inicial = {
            ...spec.vehiculos[0]!.posicion_inicial,
            x,
            y,
            rumbo_deg: 0,
          };
          const layout = roadLayout(spec.lugar);
          const sec = layout.strips[1]!;
          const main = layout.strips[0]!;
          for (const l of lines(spec)) {
            if (Math.abs(l.heading) > 1) continue; // la de B
            expect(l.center.x + STOP_LINE_WIDTH / 2).toBeLessThanOrEqual(
              -sec.width / 2 - STOP_LINE_GAP + 0.06,
            );
            expect(Math.abs(l.center.y) + l.length / 2).toBeLessThanOrEqual(main.width / 2 + 1e-9);
          }
        },
      ),
      { seed: 44, numRuns: 100 },
    );
  });
});
