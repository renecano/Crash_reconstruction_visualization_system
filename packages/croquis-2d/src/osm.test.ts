import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  crossingAt,
  distinctArms,
  enu,
  OSM_ATTRIBUTION,
  redVialFrom,
  rotateDeg,
  templateFromCrossing,
  type OverpassResponse,
} from "./osm";

// Extracto versionado de OpenStreetMap (ODbL; ver data/osm/README.md).
const RESP = JSON.parse(
  // Vitest corre desde la carpeta del paquete.
  readFileSync(join(process.cwd(), "../../data/osm/toluca_carranza_juarez.overpass.json"), "utf-8"),
) as OverpassResponse;
const NODO = 305269145;
const ORIGEN = { lat: 19.278975, lon: -99.6539869 };

describe("OpenStreetMap a red vial (ADR 0023)", () => {
  it("la proyección local da metros: un minuto de latitud son ~1 853 m", () => {
    const p = enu(ORIGEN.lat + 1 / 60, ORIGEN.lon, ORIGEN.lat, ORIGEN.lon);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(1853.3, 0);
    // Un minuto de longitud se acorta con el coseno de la latitud.
    const q = enu(ORIGEN.lat, ORIGEN.lon + 1 / 60, ORIGEN.lat, ORIGEN.lon);
    expect(q.x).toBeCloseTo(1853.3 * Math.cos((ORIGEN.lat * Math.PI) / 180), 0);
    const r = rotateDeg({ x: 1, y: 0 }, 90);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
  });

  it("Carranza y Juárez: cruce en X de dos calles de un sentido, Juárez es la principal", () => {
    const c = crossingAt(RESP, NODO);
    expect(distinctArms(c.arms)).toBe(4);
    expect(c.main.tags?.name).toBe("Calle Benito Juárez Garcia");
    expect(c.secondary?.tags?.name).toBe("Avenida General Venustiano Carranza");
    const t = templateFromCrossing(c);
    expect(t).toMatchObject({
      tipo_via: "interseccion_x",
      sentidos: "un_sentido",
      carriles_por_sentido: 4,
      carriles_por_sentido_secundaria: 3,
    });
    // Sin `width` en OSM no se deriva el ancho de carril.
    expect(t.ancho_carril_m).toBeUndefined();
  });

  it("con la rotación de la plantilla la principal queda sobre +X y la otra, perpendicular", () => {
    const c = crossingAt(RESP, NODO);
    const t = templateFromCrossing(c);
    const red = redVialFrom(RESP, {
      ...ORIGEN,
      radioM: 150,
      rotacionDeg: t.rotacion_deg,
      nodoCruce: NODO,
    });
    expect(red.licencia).toBe("ODbL-1.0");
    expect(red.atribucion).toBe(OSM_ATTRIBUTION);
    expect(red.consultado).toBe(RESP.osm3s?.timestamp_osm_base);
    expect(red.nodo_cruce).toBe(NODO);
    const brazo = (id: number) => {
      const v = red.vias.find((x) => x.id_osm === id)!;
      const [a, b] = [v.puntos[0]!, v.puntos[1]!];
      return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    };
    expect(Math.abs(brazo(614145444))).toBeLessThan(1); // Juárez hacia +X
    expect(Math.abs(Math.abs(brazo(1334343292)) - 90)).toBeLessThan(5); // Carranza, perpendicular
    for (const v of red.vias) {
      expect(v.puntos.length).toBeGreaterThanOrEqual(2);
      expect(v.puntos.length).toBeLessThanOrEqual(400);
      for (const p of v.puntos) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(225 + 1e-6);
    }
    expect(red.vias.length).toBeLessThanOrEqual(64);
    // Determinista: la misma respuesta da la misma red.
    expect(redVialFrom(RESP, { ...ORIGEN, radioM: 150, rotacionDeg: t.rotacion_deg })).toEqual({
      ...red,
      nodo_cruce: undefined,
    } as unknown);
  });

  it("andadores y ciclovías no entran; un nodo ajeno es error", () => {
    const resp: OverpassResponse = {
      elements: [
        { type: "node", id: 1, lat: 0, lon: 0 },
        { type: "node", id: 2, lat: 0.0005, lon: 0 },
        { type: "way", id: 10, nodes: [1, 2], tags: { highway: "footway" } },
      ],
    };
    expect(redVialFrom(resp, { lat: 0, lon: 0, radioM: 100, rotacionDeg: 0 }).vias).toEqual([]);
    expect(() => crossingAt(resp, 1)).toThrow(/no es parte/);
    expect(() => crossingAt(resp, 99)).toThrow(/no está/);
  });
});
