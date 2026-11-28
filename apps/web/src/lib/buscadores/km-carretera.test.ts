import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { olvidarGeocodificaciones } from "./geocodificar";
import type { RedLugar } from "../buscadores-lugar";
import {
  buscarKmCarretera,
  ubicarKm,
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
    return structuredClone(q.includes("45") ? G.mex45 : G.mex15);
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

describe("ubicarKm, con OSM grabado", () => {
  it("Toluca–Zitácuaro km 30: medido por la carretera desde Toluca, aproximado y dicho", async () => {
    const p = await ubicarKm(
      "en la carretera federal 15, tramo Toluca–Zitácuaro, kilómetro 30, cerca de Villa Victoria",
      grabadas,
    );
    expect(p).not.toBeNull();
    expect(p!.metodo).toBe("medido-desde-origen");
    // Se prueban los dos sentidos y gana el que deja el km más cerca de Villa Victoria; queda a poco
    // más de 10 km, así que va como dudoso para que el perito lo confirme.
    expect(p!.explicacion).toContain("medido por la carretera desde Toluca");
    expect(p!.explicacion).toContain("contado desde Zitácuaro quedaba a");
    expect(p!.seguridad).toBe("baja");
    expect(p!.explicacion).toContain("Dudoso");
    expect(p!.explicacion).toContain("Aproximado");
    // Ya no cae dentro de Toluca (el error de la prueba como perito): a más de 15 km en línea recta.
    expect(distanciaKm(p!, G.poblaciones.toluca!)).toBeGreaterThan(15);
    expect(distanciaKm(p!, G.poblaciones.toluca!)).toBeLessThan(30);
  });

  it("carretera 45 km 120 cerca de Villa Ahumada: el sentido desde Ciudad Juárez, no desde Chihuahua", async () => {
    const p = await ubicarKm(
      "en la carretera federal 45, tramo Chihuahua–Ciudad Juárez, kilómetro 120, cerca de Villa Ahumada",
      grabadas,
    );
    expect(p!.metodo).toBe("medido-desde-origen");
    // Contado desde Chihuahua quedaba a 108 km de Villa Ahumada (René, 2026-11-28); desde Ciudad Juárez,
    // cerca. Sigue a más de 10 km del punto que da el buscador para Villa Ahumada: dudoso.
    expect(p!.explicacion).toContain("medido por la carretera desde Ciudad Juárez");
    expect(p!.explicacion).toMatch(/contado desde Chihuahua quedaba a 108\.\d km/);
    expect(distanciaKm(p!, G.poblaciones["villa-ahumada"]!)).toBeLessThan(25);
  });

  it("sin población que sirva de ancla, desde el primer extremo que dice la narración", async () => {
    const p = await ubicarKm(
      "en la carretera federal 45, tramo Chihuahua–Ciudad Juárez, kilómetro 120",
      grabadas,
    );
    expect(p).toMatchObject({ metodo: "medido-desde-origen", seguridad: "baja" });
    expect(distanciaKm(p!, G.poblaciones.chihuahua!)).toBeGreaterThan(90);
  });

  it("solo la carretera y la población: el punto más cercano a ella, y dice por qué no ubica el km", async () => {
    const p = await ubicarKm("Carretera 45, km 120, cerca de Villa Ahumada", grabadas);
    expect(p).toMatchObject({ metodo: "cerca-de-poblacion", seguridad: "baja" });
    expect(distanciaKm(p!, G.poblaciones["villa-ahumada"]!)).toBeLessThan(10);
    expect(p!.explicacion).toContain("no se pudo ubicar");
  });

  it("sin tramo ni población no inventa un punto", async () => {
    expect(await ubicarKm("MEX-15D km 54", grabadas)).toBeNull();
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
    const p = await ubicarKm("MEX-99 km 110, cerca de Pueblo", deps);
    expect(p).toMatchObject({ metodo: "mojon", seguridad: "alta", lat: linea[15]!.lat });
  });
  it("interpolado entre dos mojones", async () => {
    const p = await ubicarKm("MEX-99 km 104, cerca de Pueblo", deps);
    expect(p!.metodo).toBe("interpolado");
    expect(p!.explicacion).toContain("entre los mojones 100 y 110");
    expect(p!.lat).toBeCloseTo(linea[9]!.lat, 5);
  });
});

beforeEach(() => olvidarGeocodificaciones());

describe("buscarKmCarretera, con la interfaz de René (red inyectada, respuestas grabadas)", () => {
  /** La red: Nominatim por la población que pide la URL y Overpass por la carretera que pide la consulta. */
  const red: RedLugar = {
    fetch: (async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("nominatim")) {
        const q = decodeURIComponent(new URL(u).searchParams.get("q") ?? "")
          .split(",")[0]!
          .trim();
        const p = G.poblaciones[POBLACIONES[q] ?? ""];
        return new Response(JSON.stringify(p ? [{ lat: String(p.lat), lon: String(p.lon) }] : []));
      }
      const consulta = new URLSearchParams(String(init?.body)).get("data") ?? "";
      return new Response(JSON.stringify(consulta.includes("45") ? G.mex45 : G.mex15));
    }) as typeof fetch,
    pausa: async () => undefined,
  };
  it("encuentra el km y lo dice como lo verá el perito", async () => {
    const r = await buscarKmCarretera(
      "en la carretera federal 15, tramo Toluca–Zitácuaro, kilómetro 30, cerca de Villa Victoria",
      { municipio: "Villa Victoria", estado: "Estado de México" },
      red,
    );
    expect(r).toMatchObject({
      encontrado: true,
      como: "km",
      que: "km 30 de la MEX 15",
    });
    expect(r.encontrado && r.explicacion).toContain("© OpenStreetMap contributors");
  });
  it("no aplica si la narración no nombra un km", async () => {
    expect(await buscarKmCarretera("en el cruce de Juárez y Morelos", {}, red)).toEqual({
      encontrado: false,
      como: "km",
      aplica: false,
      explicacion: "La narración no nombra el kilómetro de una carretera.",
    });
  });
  it("sin tramo ni población: no lo encuentra y dice por qué (nunca un punto por omisión)", async () => {
    const r = await buscarKmCarretera("MEX-15D km 54", {}, red);
    expect(r).toMatchObject({ encontrado: false, como: "km", aplica: true });
    expect(!r.encontrado && r.explicacion).toContain("no dice el tramo ni una población cercana");
  });
  it("si la red falla, lo dice", async () => {
    const caida: RedLugar = {
      fetch: (async () => new Response("", { status: 502 })) as typeof fetch,
    };
    const r = await buscarKmCarretera(
      "carretera federal 15, tramo Toluca–Zitácuaro, km 30",
      {},
      caida,
    );
    expect(r).toMatchObject({ encontrado: false, aplica: true });
    expect(!r.encontrado && r.explicacion).toContain("(el mapa no respondió): reintenta");
    expect(!r.encontrado && r.sinRespuesta).toBe(true);
  });
});
