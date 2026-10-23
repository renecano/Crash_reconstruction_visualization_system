import { describe, expect, it } from "vitest";
import { objetosDelMapa, overpassQueryObjetos, type OverpassResponse } from "./osm";

const O = { lat: 19.3576, lon: -99.0625 };
const m = (n: number, e: number) => ({
  lat: O.lat + n / 111320,
  lon: O.lon + e / (111320 * Math.cos((O.lat * Math.PI) / 180)),
});
const resp: OverpassResponse = {
  elements: [
    { type: "node", id: 1, ...m(10, 0), tags: { natural: "tree" } },
    { type: "node", id: 2, ...m(0, 5), tags: { highway: "street_lamp" } },
    { type: "node", id: 3, ...m(400, 0), tags: { natural: "tree" } },
    { type: "node", id: 4, ...m(-20, -10) },
    { type: "node", id: 5, ...m(-20, 10) },
    { type: "node", id: 6, ...m(2, 2), tags: { amenity: "bench" } },
    { type: "way", id: 9, nodes: [4, 5], tags: { barrier: "wall" } },
  ],
};

describe("los objetos del lugar desde OpenStreetMap (R10)", () => {
  it("árboles, postes y muros, en metros del marco de la escena, del más cercano al más lejano", () => {
    const os = objetosDelMapa(resp, { ...O, radioM: 150, max: 40 });
    expect(os.map((x) => [x.id, x.tipo])).toEqual([
      ["osm-2", "poste"],
      ["osm-1", "arbol"],
      ["osm-9-0", "muro"],
    ]);
    const muro = os.find((x) => x.tipo === "muro")!;
    expect(muro.largo_m).toBeCloseTo(20, 0);
    expect(muro.rumbo_deg).toBeCloseTo(90, 0);
    expect(muro.posicion.y).toBeCloseTo(-20, 0);
    // Lo que queda fuera del radio, o no es un objeto que se dibuje, no entra.
    expect(os.some((x) => x.id === "osm-3" || x.id === "osm-6")).toBe(false);
  });

  it("respeta el máximo y la consulta pide solo esos objetos", () => {
    expect(objetosDelMapa(resp, { ...O, radioM: 150, max: 1 })).toHaveLength(1);
    const q = overpassQueryObjetos(O.lat, O.lon, 150);
    expect(q).toContain('["natural"="tree"]');
    expect(q).toContain('["highway"="street_lamp"]');
    expect(q).toContain("barrier");
  });
});
