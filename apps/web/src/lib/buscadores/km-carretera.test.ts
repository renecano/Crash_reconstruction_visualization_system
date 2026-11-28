import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buscarKmCarretera,
  consultaKm,
  leerKmCarretera,
  type DepsKm,
  type RespuestaOverpass,
} from "./km-carretera";

/** Respuestas grabadas de OSM (Overpass `out tags geom` y Nominatim), 2026-11-27. */
const G = JSON.parse(
  readFileSync(resolve(__dirname, "__fixtures__/osm-carreteras.json"), "utf8"),
) as {
  mex15: RespuestaOverpass;
  mex45: RespuestaOverpass;
  poblaciones: Record<string, { lat: number; lon: number }>;
};
const POBLACIONES: Record<string, string> = {
  Toluca: "toluca",
  Zitácuaro: "zitacuaro",
  "Villa Victoria": "villa-victoria",
  Chihuahua: "chihuahua",
  "Villa Ahumada": "villa-ahumada",
  "Ciudad Juárez": "ciudad-juarez",
};
const consultas: string[] = [];
const grabadas: DepsKm = {
  overpass: async (q) => {
    consultas.push(q);
    return q.includes("45") ? G.mex45 : G.mex15;
  },
  poblacion: async (n) => G.poblaciones[POBLACIONES[n] ?? ""] ?? null,
};
const distanciaKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const k = Math.PI / 180;
  return Math.hypot((b.lon - a.lon) * k * Math.cos(a.lat * k), (b.lat - a.lat) * k) * 6371;
};

describe("leerKmCarretera", () => {
  it("el número, el tramo, el km y la población cercana", () => {
    expect(
      leerKmCarretera(
        "en la carretera federal 15, tramo Toluca–Zitácuaro, kilómetro 30, cerca de Villa Victoria",
      ),
    ).toEqual({ ref: "MEX 15", tramo: ["Toluca", "Zitácuaro"], km: 30, cercaDe: "Villa Victoria" });
    expect(leerKmCarretera("MEX-15D km 54+300")).toEqual({
      ref: "MEX 15D",
      tramo: null,
      km: 54.3,
      cercaDe: null,
    });
    expect(leerKmCarretera("Carretera 45, km 120")).toMatchObject({ ref: "MEX 45", km: 120 });
    expect(leerKmCarretera("Toluca–Zitácuaro km 30")).toMatchObject({
      ref: null,
      tramo: ["Toluca", "Zitácuaro"],
      km: 30,
    });
    expect(leerKmCarretera("en la avenida Juárez")).toBeNull();
  });

  it("la consulta pide la carretera (libre o de cuota) y sus mojones", () => {
    const q = consultaKm(
      { ref: "MEX 45", tramo: null, km: 120, cercaDe: null },
      { lat: 30, lon: -106 },
      1000,
    );
    expect(q).toContain('["ref"~"^MEX ?-?45D?$"]');
    expect(q).toContain('["highway"="milestone"]');
    expect(
      consultaKm(
        { ref: "MEX 15D", tramo: null, km: 54, cercaDe: null },
        { lat: 19, lon: -99 },
        1000,
      ),
    ).toContain('"^MEX ?-?15D$"');
  });
});

describe("buscarKmCarretera, con OSM grabado", () => {
  it("Toluca–Zitácuaro km 30: medido por la carretera desde Toluca, aproximado y dicho", async () => {
    const p = await buscarKmCarretera(
      "en la carretera federal 15, tramo Toluca–Zitácuaro, kilómetro 30, cerca de Villa Victoria",
      grabadas,
    );
    expect(p).not.toBeNull();
    expect(p!.metodo).toBe("medido-desde-origen");
    expect(p!.seguridad).toBe("baja");
    expect(p!.explicacion).toContain("medido por la carretera desde Toluca");
    expect(p!.explicacion).toContain("aproximado");
    // Ya no cae dentro de Toluca (el error de la prueba como perito): a más de 15 km en línea recta.
    expect(distanciaKm(p!, G.poblaciones.toluca!)).toBeGreaterThan(15);
    expect(distanciaKm(p!, G.poblaciones.toluca!)).toBeLessThan(30);
  });

  it("carretera 45 km 120 desde Chihuahua, cerca de Villa Ahumada: avisa que no cuadran", async () => {
    const p = await buscarKmCarretera(
      "en la carretera federal 45, tramo Chihuahua–Ciudad Juárez, kilómetro 120, cerca de Villa Ahumada",
      grabadas,
    );
    expect(p).not.toBeNull();
    expect(p!.metodo).toBe("medido-desde-origen");
    expect(distanciaKm(p!, G.poblaciones.chihuahua!)).toBeGreaterThan(90);
    // El km 120 desde Chihuahua no está cerca de Villa Ahumada: Croquis lo dice, no lo esconde.
    expect(p!.explicacion).toMatch(/Ojo: queda a [\d.]+ km de Villa Ahumada/);
  });

  it("solo la carretera y la población: el punto más cercano a ella, y dice por qué no ubica el km", async () => {
    const p = await buscarKmCarretera("Carretera 45, km 120, cerca de Villa Ahumada", grabadas);
    expect(p).toMatchObject({ metodo: "cerca-de-poblacion", seguridad: "baja" });
    expect(distanciaKm(p!, G.poblaciones["villa-ahumada"]!)).toBeLessThan(10);
    expect(p!.explicacion).toContain("no se pudo ubicar");
  });

  it("sin tramo ni población no inventa un punto", async () => {
    expect(await buscarKmCarretera("MEX-15D km 54", grabadas)).toBeNull();
  });
});

describe("con mojones (red sintética: OSM no tiene mojones en los tramos de prueba)", () => {
  // Una recta de 20 km hacia el norte, con mojones en los km 100 y 110.
  const linea = Array.from({ length: 21 }, (_, i) => ({
    lat: 20 + (i * 1000) / 111_320,
    lon: -100,
  }));
  const resp: RespuestaOverpass = {
    elements: [
      { type: "way", id: 1, tags: { ref: "MEX 99" }, geometry: linea },
      {
        type: "node",
        id: 2,
        lat: linea[5]!.lat,
        lon: -100,
        tags: { highway: "milestone", distance: "100" },
      },
      {
        type: "node",
        id: 3,
        lat: linea[15]!.lat,
        lon: -100,
        tags: { highway: "milestone", distance: "110" },
      },
    ],
  } as RespuestaOverpass;
  const deps: DepsKm = {
    overpass: async () => resp,
    poblacion: async () => ({ lat: 20, lon: -100 }),
  };
  it("el mojón exacto", async () => {
    const p = await buscarKmCarretera("MEX-99 km 110, cerca de Pueblo", deps);
    expect(p).toMatchObject({ metodo: "mojon", seguridad: "alta", lat: linea[15]!.lat });
  });
  it("interpolado entre dos mojones", async () => {
    const p = await buscarKmCarretera("MEX-99 km 104, cerca de Pueblo", deps);
    expect(p!.metodo).toBe("interpolado");
    expect(p!.explicacion).toContain("entre los mojones 100 y 110");
    expect(p!.lat).toBeCloseTo(linea[9]!.lat, 5);
  });
});
