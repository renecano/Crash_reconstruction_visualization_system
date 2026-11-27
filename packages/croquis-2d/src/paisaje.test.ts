import { describe, expect, it } from "vitest";
import { paisajeDelClima } from "./clima";
import { overpassQueryObjetos, paisajeDelMapa, type OverpassResponse } from "./osm";

/** El paisaje del lugar para el 3D (contrato #335), con la cobertura del suelo de OSM. */
const O = { lat: 21.3, lon: -100.5 };
const kx = 111320 * Math.cos((O.lat * Math.PI) / 180);
/** Un cuadrado de lado `l` m centrado en (cx, cy) m del lugar, como vía cerrada de OSM. */
function cuadrado(id: number, cx: number, cy: number, l: number, tags: Record<string, string>) {
  const esquinas = [
    [cx - l / 2, cy - l / 2],
    [cx + l / 2, cy - l / 2],
    [cx + l / 2, cy + l / 2],
    [cx - l / 2, cy + l / 2],
  ];
  const nodos = esquinas.map(([x, y], k) => ({
    type: "node" as const,
    id: id * 10 + k,
    lat: O.lat + y! / 111320,
    lon: O.lon + x! / kx,
  }));
  return {
    nodos,
    via: { type: "way" as const, id, nodes: [...nodos.map((n) => n.id), nodos[0]!.id], tags },
  };
}
const resp = (...partes: ReturnType<typeof cuadrado>[]): OverpassResponse => ({
  elements: partes.flatMap((p) => [...p.nodos, p.via]),
});

describe("el paisaje del lugar (contrato #335)", () => {
  it("matorral que cubre más que el campo de cultivo: árido", () => {
    const r = resp(
      cuadrado(1, 0, 0, 200, { natural: "scrub" }),
      cuadrado(2, 120, 0, 60, { landuse: "farmland" }),
    );
    expect(paisajeDelMapa(r, { ...O, radioM: 150 })).toBe("arido");
  });

  it("bosque que cubre más que la arena: templado", () => {
    const r = resp(
      cuadrado(1, 0, 0, 250, { landuse: "forest" }),
      cuadrado(2, 0, 0, 40, { natural: "sand" }),
    );
    // La arena está dentro del bosque: cada punto cuenta una vez, por el primer polígono.
    expect(paisajeDelMapa(r, { ...O, radioM: 150 })).toBe("templado");
  });

  it("sin cobertura, o fuera del radio, decide el clima del lugar (en México)", () => {
    // O está en el Bajío semiárido (BSh/BSk): sin cobertura de OSM, el clima dice «árido».
    expect(paisajeDelMapa({ elements: [] }, { ...O, radioM: 150 })).toBe("arido");
    const lejos = resp(cuadrado(1, 2000, 0, 100, { landuse: "forest" }));
    expect(paisajeDelMapa(lejos, { ...O, radioM: 150 })).toBe("arido");
    // Lo que no es cobertura (un edificio) no cuenta.
    expect(
      paisajeDelMapa(resp(cuadrado(1, 0, 0, 100, { building: "yes" })), { ...O, radioM: 150 }),
    ).toBe("arido");
    // Fuera de México no hay clima guardado: no dice nada (Unity dibuja el templado de siempre).
    expect(paisajeDelMapa({ elements: [] }, { lat: 40.4, lon: -3.7, radioM: 150 })).toBeNull();
  });

  it("OSM manda si trae cobertura, aunque el clima diga otra cosa", () => {
    const r = resp(cuadrado(1, 0, 0, 300, { landuse: "forest" }));
    expect(paisajeDelMapa(r, { ...O, radioM: 150 })).toBe("templado");
  });

  it("el clima de lugares conocidos (Köppen-Geiger de Beck et al., 1991–2020)", () => {
    // Bahía de Kino y la carretera Hermosillo–Kino (Sonora): desierto.
    expect(paisajeDelClima(28.82, -111.94)).toBe("arido");
    expect(paisajeDelClima(28.94045, -111.3259)).toBe("arido");
    // Toluca y la Ciudad de México: templados.
    expect(paisajeDelClima(19.2925, -99.6557)).toBe("templado");
    expect(paisajeDelClima(19.4326, -99.1332)).toBe("templado");
    // Fuera del recorte: nada.
    expect(paisajeDelClima(40.4, -3.7)).toBeNull();
  });

  it("una relación cuenta por sus vías exteriores cerradas", () => {
    const c = cuadrado(1, 0, 0, 260, {});
    const r: OverpassResponse = {
      elements: [
        ...c.nodos,
        { ...c.via, tags: undefined },
        {
          type: "relation",
          id: 9,
          members: [{ type: "way", ref: 1, role: "outer" }],
          tags: { type: "multipolygon", natural: "bare_rock" },
        } as never,
      ],
    };
    expect(paisajeDelMapa(r, { ...O, radioM: 150 })).toBe("arido");
  });

  it("la consulta de objetos pide la cobertura seca y la verde", () => {
    const q = overpassQueryObjetos(O.lat, O.lon, 150);
    expect(q).toContain("scrub|sand|bare_rock|scree|desert");
    expect(q).toContain("forest|meadow|farmland|orchard|grass");
    expect(q).toContain("relation(");
  });
});
