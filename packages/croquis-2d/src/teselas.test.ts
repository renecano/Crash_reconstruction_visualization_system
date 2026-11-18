import { describe, expect, it } from "vitest";
import { nearestCrossing, type OsmWay } from "./osm";
import { overpassDeTeselas, type LineaTesela } from "./teselas";

/** Un cruce en T, como lo dan las teselas: el boulevard de norte a sur y una calle al este. */
const C: [number, number] = [-99.1987, 19.4042];
const d = (este: number, norte: number): [number, number] => [
  C[0] + este / (111_320 * Math.cos((C[1] * Math.PI) / 180)),
  C[1] + norte / 111_320,
];
const linea = (props: Record<string, unknown>, ...pts: [number, number][]): LineaTesela => ({
  geometry: { type: "LineString", coordinates: pts },
  properties: props,
});
const boulevard = [d(0, -80), d(0, 0), d(0, 80)] as const;
const calles: LineaTesela[] = [
  linea({ class: "trunk", oneway: 1 }, ...boulevard),
  // La misma línea en la tesela vecina: sale una vez.
  linea({ class: "trunk", oneway: 1 }, ...boulevard),
  linea({ class: "minor" }, d(0, 0), d(60, 0)),
  linea({ class: "path" }, d(0, 0), d(-40, 0)),
  linea({ class: "minor" }, d(900, 900), d(950, 900)),
];
const nombres: LineaTesela[] = [
  linea(
    { name: "Boulevard Adolfo Ruiz Cortines", "name:es": "Boulevard Adolfo Ruiz Cortines" },
    ...boulevard,
  ),
];

describe("las calles desde las teselas del mapa (ronda 4)", () => {
  it("una vía por tramo cercano, con su tipo, su sentido y su nombre; sin veredas ni repetidos", () => {
    const r = overpassDeTeselas(calles, nombres, C, 150);
    const vias = r.elements.filter((e) => e.type === "way") as OsmWay[];
    expect(vias.map((v) => v.tags)).toEqual([
      { highway: "trunk", name: "Boulevard Adolfo Ruiz Cortines", oneway: "yes" },
      { highway: "residential" },
    ]);
  });

  it("el vértice compartido es el mismo nodo: el cruce se encuentra como con Overpass", () => {
    const r = overpassDeTeselas(calles, nombres, C, 150);
    const id = nearestCrossing(r, C[1], C[0]);
    expect(id).not.toBeNull();
    const n = r.elements.find((e) => e.type === "node" && (e as { id: number }).id === id) as {
      lat: number;
      lon: number;
    };
    expect(n.lat).toBeCloseTo(C[1], 7);
    expect(n.lon).toBeCloseTo(C[0], 7);
  });

  it("las rampas son enlaces y MultiLineString cuenta como varias líneas", () => {
    const r = overpassDeTeselas(
      [
        {
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [d(0, 10), d(10, 20)],
              [d(0, -10), d(-10, -20)],
            ],
          },
          properties: { class: "primary", ramp: 1 },
        },
      ],
      [],
      C,
      150,
    );
    const vias = r.elements.filter((e) => e.type === "way") as OsmWay[];
    expect(vias.map((v) => v.tags?.highway)).toEqual(["primary_link", "primary_link"]);
  });
});
