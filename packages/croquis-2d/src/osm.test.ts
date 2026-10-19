import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadFixture } from "@croquis/scene-schema";
import {
  applyMap,
  crossingAt,
  distinctArms,
  enu,
  nearestCrossing,
  OSM_ATTRIBUTION,
  overpassQuery,
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
    });
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

describe("calles reales en producción (ADR 0040)", () => {
  const MANIFEST = JSON.parse(
    readFileSync(join(process.cwd(), "../../data/osm/manifest.json"), "utf-8"),
  ) as Record<string, { consulta: string; lat: number; lon: number; radio_m: number }>;

  it("la consulta es la misma que la del extracto versionado", () => {
    const m = MANIFEST.toluca_carranza_juarez!;
    expect(overpassQuery(m.lat, m.lon, m.radio_m)).toBe(m.consulta);
  });

  it("el cruce más cercano a unas coordenadas cerca de la esquina es el del extracto", () => {
    // ~20 m al norte del cruce.
    expect(nearestCrossing(RESP, ORIGEN.lat + 0.00018, ORIGEN.lon)).toBe(NODO);
    // A más de 60 m de cualquier cruce: ninguno.
    expect(nearestCrossing(RESP, ORIGEN.lat + 0.01, ORIGEN.lon + 0.01)).toBeNull();
  });

  it("aplicar el mapa a una escena reproduce la red y la plantilla de la escena de Toluca", () => {
    const toluca = loadFixture("interseccion_toluca");
    const base = structuredClone(toluca);
    delete (base.lugar as { red_vial?: unknown }).red_vial;
    const r = applyMap(base, RESP, {
      lat: ORIGEN.lat + 0.00009,
      lon: ORIGEN.lon - 0.00009,
      radioM: toluca.lugar.ubicacion_real?.radio_m ?? 150,
    });
    expect(r.nodo).toBe(NODO);
    expect(r.spec.lugar.red_vial).toEqual(toluca.lugar.red_vial);
    expect(r.spec.lugar.ubicacion_real?.rotacion_deg).toBe(
      toluca.lugar.ubicacion_real?.rotacion_deg,
    );
    expect(r.spec.lugar.tipo_via.valor).toBe(toluca.lugar.tipo_via.valor);
    expect(r.spec.lugar.tipo_via.fuente).toBe("mapa");
    // La evidencia del relato se conserva.
    expect(r.spec.lugar.tipo_via.evidencia).toEqual(toluca.lugar.tipo_via.evidencia);
    expect(r.spec.lugar.sentidos.valor).toBe(toluca.lugar.sentidos.valor);
    expect(r.spec.lugar.carriles_por_sentido?.valor).toBe(toluca.lugar.carriles_por_sentido?.valor);
    expect(r.vias).toBe(toluca.lugar.red_vial!.vias.length);
    // La escena original no cambia.
    expect((base.lugar as { red_vial?: unknown }).red_vial).toBeUndefined();
  });

  it("sin un cruce cerca, error en vez de inventar una orientación", () => {
    const spec = loadFixture("alcance");
    expect(() =>
      applyMap(spec, RESP, { lat: ORIGEN.lat + 0.01, lon: ORIGEN.lon, radioM: 150 }),
    ).toThrow(/cruce/);
  });
});
