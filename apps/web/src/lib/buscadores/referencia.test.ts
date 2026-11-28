import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { olvidarGeocodificaciones } from "./geocodificar";
import type { RedLugar } from "../buscadores-lugar";
import {
  buscarReferencia,
  ubicarReferencia,
  consultaCalles,
  leerReferencia,
  type DepsReferencia,
  type Encontrado,
  type RespuestaOverpass,
} from "./referencia";

/** Respuestas grabadas de Nominatim y Overpass, 2026-11-27. */
const G = JSON.parse(
  readFileSync(resolve(__dirname, "__fixtures__/osm-referencias.json"), "utf8"),
) as { busquedas: Record<string, Encontrado[]>; calles: Record<string, RespuestaOverpass> };

const grabadas: DepsReferencia = {
  buscar: async (t) => G.busquedas[t] ?? [],
  // Las calles grabadas del candidato cuya latitud aparece en la consulta.
  overpass: async (q) => {
    const lat = /around:700,([-\d.]+),/.exec(q)?.[1];
    const k = Object.keys(G.calles).find((x) => lat && Math.abs(Number(x) - Number(lat)) < 1e-5);
    return k ? G.calles[k]! : { elements: [] };
  },
};
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const k = Math.PI / 180;
  return Math.hypot((b.lon - a.lon) * k * Math.cos(a.lat * k), (b.lat - a.lat) * k) * 6371;
};

describe("leerReferencia", () => {
  it("el tipo, el nombre y la calle", () => {
    expect(
      leerReferencia("sobre la Calzada de Tlalpan, a la altura de la estación Portales del Metro"),
    ).toEqual({ tipo: "estacion", nombre: "Portales", calle: "Calzada de Tlalpan" });
    expect(
      leerReferencia("en la glorieta de la Diana Cazadora, sobre Paseo de la Reforma"),
    ).toEqual({
      tipo: "glorieta",
      nombre: "Diana Cazadora",
      calle: "Paseo de la Reforma",
    });
    expect(
      leerReferencia("en el Anillo Periférico Sur, a la altura de la salida a San Jerónimo"),
    ).toMatchObject({ tipo: "lugar", nombre: "San Jerónimo", calle: "Anillo Periférico Sur" });
    expect(leerReferencia("frente a la gasolinera Pemex sobre avenida Hidalgo")).toMatchObject({
      tipo: "gasolinera",
      nombre: "Pemex",
    });
    expect(
      leerReferencia("en el estacionamiento del centro comercial Galerías Metepec"),
    ).toMatchObject({
      tipo: "comercio",
      nombre: "Galerías Metepec",
    });
    expect(leerReferencia("en el cruce de Juárez y Morelos")).toBeNull();
  });

  it("las calles alrededor de la referencia, en un radio corto (rápido en Overpass)", () => {
    expect(consultaCalles({ lat: 19.3699, lon: -99.1416 })).toContain(
      "way(around:700,19.369900,-99.141600)",
    );
  });
});

describe("ubicarReferencia, con lo grabado", () => {
  it("Calzada de Tlalpan a la altura de Metro Portales", async () => {
    const p = await ubicarReferencia(
      "sobre la Calzada de Tlalpan, a la altura de la estación Portales del Metro",
      "Benito Juárez, Ciudad de México",
      grabadas,
    );
    expect(p).not.toBeNull();
    expect(p!.calle).toMatch(/Tlalpan/);
    expect(p!.seguridad).toBe("alta");
    expect(p!.explicacion).toMatch(
      /^El punto de .*Tlalpan más cercano a la estación Portales \(a \d+ m\)/,
    );
    // Junto a la estación (19.3699, −99.1416), no a 7.5 km como en la prueba como perito.
    expect(km(p!, { lat: 19.3699, lon: -99.14158 })).toBeLessThan(0.15);
  });

  it("la glorieta de la Diana Cazadora: de las dos del mapa, la que está en Reforma", async () => {
    const p = await ubicarReferencia(
      "en la glorieta de la Diana Cazadora, sobre Paseo de la Reforma",
      "Cuauhtémoc, Ciudad de México",
      grabadas,
    );
    expect(p!.calle).toMatch(/Reforma/);
    expect(km(p!, { lat: 19.42513, lon: -99.17163 })).toBeLessThan(0.15);
    expect(p!.explicacion).toContain("Hay 2 lugares con ese nombre en el mapa");
    // Dos posibles: seguridad media y las dos opciones, la elegida primero.
    expect(p!.seguridad).toBe("media");
    expect(p!.opciones?.length).toBe(2);
  });

  it("Periférico Sur a la altura de la salida a San Jerónimo", async () => {
    const p = await ubicarReferencia(
      "en los carriles centrales del Anillo Periférico Sur, a la altura de la salida a San Jerónimo",
      "Álvaro Obregón, Ciudad de México",
      grabadas,
    );
    expect(p).not.toBeNull();
    expect(p!.calle).toMatch(/Perif[eé]rico/);
    expect(p!.explicacion).toMatch(/más cercano a .*San Jer[oó]nimo/);
    // En el Periférico junto a San Jerónimo (al sur de la CDMX), no en el Zócalo.
    expect(km(p!, { lat: 19.43, lon: -99.13 })).toBeGreaterThan(10);
  });

  it("sin referencia en el mapa no inventa un punto", async () => {
    expect(
      await ubicarReferencia(
        "a la altura de la estación Inexistente",
        "Benito Juárez, Ciudad de México",
        grabadas,
      ),
    ).toBeNull();
  });
});

beforeEach(() => olvidarGeocodificaciones());

describe("buscarReferencia, con la interfaz de René (red inyectada, respuestas grabadas)", () => {
  const red: RedLugar = {
    fetch: (async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("nominatim")) {
        const q = decodeURIComponent(new URL(u).searchParams.get("q") ?? "");
        return new Response(JSON.stringify(G.busquedas[q] ?? []));
      }
      const consulta = new URLSearchParams(String(init?.body)).get("data") ?? "";
      return new Response(JSON.stringify(await grabadas.overpass(consulta)));
    }) as typeof fetch,
    pausa: async () => undefined,
  };
  it("Tlalpan a la altura de Metro Portales", async () => {
    const r = await buscarReferencia(
      "sobre la Calzada de Tlalpan, a la altura de la estación Portales del Metro",
      { municipio: "Benito Juárez", estado: "Ciudad de México" },
      red,
    );
    expect(r).toMatchObject({
      encontrado: true,
      como: "referencia",
      seguridad: "alta",
      que: "Calzada de Tlalpan a la altura de Portales",
    });
  });
  it("la Diana: las dos opciones, la de Reforma primero", async () => {
    const r = await buscarReferencia(
      "en la glorieta de la Diana Cazadora, sobre Paseo de la Reforma",
      { municipio: "Cuauhtémoc", estado: "Ciudad de México" },
      red,
    );
    expect(r.encontrado && r.opciones?.length).toBe(2);
    // La primera es la Diana de la glorieta de Reforma (19.4251, −99.1716), no la otra escultura.
    expect(
      r.encontrado && km(r.opciones![0]!.punto, { lat: 19.42513, lon: -99.17163 }),
    ).toBeLessThan(0.1);
  });
  it("no aplica sin referencia; sin municipio no busca", async () => {
    expect(await buscarReferencia("en el cruce de Juárez y Morelos", {}, red)).toMatchObject({
      encontrado: false,
      aplica: false,
    });
    const r = await buscarReferencia("a la altura de la estación Portales", {}, red);
    expect(r).toMatchObject({ encontrado: false, aplica: true });
  });
});

describe("«la colonia X»: una colonia, nunca una calle con ese nombre (René, 2026-11-28, caso 1)", () => {
  const narracion =
    "El hecho se ubica sobre Paseo de los Matlatzincas, a la altura de la colonia Ciprés, en Toluca, Estado de México.";

  it("lee la colonia y la calle", () => {
    expect(leerReferencia(narracion)).toEqual({
      tipo: "lugar",
      nombre: "Ciprés",
      calle: "Paseo de los Matlatzincas",
      asentamiento: true,
    });
  });

  it("si el mapa solo tiene calles Ciprés, no se encontró (y no se consulta Overpass)", async () => {
    let consultas = 0;
    const p = await ubicarReferencia(narracion, "Toluca, Estado de México", {
      buscar: async () => [
        {
          category: "highway",
          type: "residential",
          name: "Calle Ciprés",
          lat: 19.3452805,
          lon: -99.6829827,
        },
        {
          category: "highway",
          type: "residential",
          name: "Privada Ciprés",
          lat: 19.2784709,
          lon: -99.6618347,
        },
      ],
      overpass: async () => {
        consultas++;
        return { elements: [] };
      },
    });
    expect(p).toBeNull();
    expect(consultas).toBe(0);
  });

  it("la consulta de calles pide solo la calle narrada, por su nombre", () => {
    const q = consultaCalles({ lat: 19.29, lon: -99.68 }, "Paseo de los Matlatzincas");
    expect(q).toContain(
      '["highway"]["name"~"m[aáÁA]tl[aáÁA]tz[iíÍI][nñÑN]c[aáÁA]s",i];out tags geom;',
    );
    expect(consultaCalles({ lat: 19.29, lon: -99.68 })).toContain('["highway"]["name"];');
  });
});

describe("una población sobre una carretera, sin km (René, 2026-11-28, casos 5 y 6 de la demo)", () => {
  const caso5 =
    "El hecho se ubica sobre la carretera federal 134 Toluca–Temascaltepec (Calzada al Pacífico), a la altura de la localidad de Santa Cruz Cuahutenco, en Zinacantepec, Estado de México.";
  const caso6 =
    "El hecho se ubica sobre la carretera Hermosillo–Bahía de Kino, a la altura del poblado Miguel Alemán, en Hermosillo, Sonora.";
  const caso6b =
    "El hecho se ubica sobre la carretera Hermosillo–Bahía de Kino, poco antes de llegar a Bahía de Kino, en Hermosillo, Sonora.";

  it("lee la población y la carretera, no un km ni una calle", () => {
    expect(leerReferencia(caso5)).toMatchObject({
      tipo: "lugar",
      nombre: "Santa Cruz Cuahutenco",
      calle: null,
      asentamiento: true,
      carretera: { ref: "MEX 134", tramo: ["Toluca", "Temascaltepec"] },
    });
    expect(leerReferencia(caso6)).toMatchObject({
      nombre: "Miguel Alemán",
      asentamiento: true,
      carretera: { ref: null, tramo: ["Hermosillo", "Bahía de Kino"] },
    });
    expect(leerReferencia(caso6b)).toMatchObject({ nombre: "Bahía de Kino", asentamiento: true });
    // «cerca de X» sin carretera no es una referencia de población.
    expect(leerReferencia("El hecho ocurrió cerca de Metepec, en la calle Hidalgo.")).toBeNull();
  });

  // La carretera pasa de oeste a este por la latitud 19.2540; la localidad está 580 m al norte.
  const carretera = {
    type: "way",
    id: 1,
    tags: { ref: "MEX 134", highway: "primary" },
    geometry: [
      { lat: 19.254, lon: -99.75 },
      { lat: 19.254, lon: -99.7 },
    ],
  };
  const deps = (lugares: Encontrado[]): DepsReferencia & { consultas: string[] } => {
    const consultas: string[] = [];
    return {
      consultas,
      buscar: async () => lugares,
      overpass: async (q) => {
        consultas.push(q);
        return { elements: [carretera] };
      },
    };
  };
  const pueblo = (name: string, lat: number, lon: number): Encontrado => ({
    category: "place",
    type: "village",
    name,
    lat,
    lon,
  });

  it("el punto de la carretera más cercano a la población, con su distancia", async () => {
    const d = deps([pueblo("Santa Cruz Cuahutenco", 19.2592, -99.73)]);
    const p = await ubicarReferencia(caso5, "Zinacantepec, Estado de México", d);
    expect(p).toMatchObject({ seguridad: "media", calle: "la MEX 134" });
    expect(p!.lat).toBeCloseTo(19.254, 4);
    expect(p!.lon).toBeCloseTo(-99.73, 4);
    expect(p!.explicacion).toMatch(
      /^El punto de la MEX 134 más cercano a Santa Cruz Cuahutenco \(a 580 m\), según el mapa; la narración no da el kilómetro\./,
    );
    // Una sola consulta: la carretera por su número o su tramo, sin mojones.
    expect(d.consultas).toHaveLength(1);
    expect(d.consultas[0]).toContain('["ref"~"^MEX ?-?134D?$"]');
    expect(d.consultas[0]).not.toContain("milestone");
  });

  it("con dos poblaciones del mismo nombre: opciones por cercanía, con su distancia", async () => {
    const d = deps([
      pueblo("Santa Cruz Cuahutenco", 19.2722, -99.71), // a 2 km
      pueblo("Santa Cruz Cuahutenco", 19.2567, -99.735), // a 300 m
    ]);
    const p = await ubicarReferencia(caso5, "Zinacantepec, Estado de México", d);
    expect(p!.seguridad).toBe("baja");
    expect(p!.opciones!.map((o) => o.nombre)).toEqual([
      "MEX 134 a 300 m de Santa Cruz Cuahutenco",
      "MEX 134 a 2.0 km de Santa Cruz Cuahutenco",
    ]);
    expect(p!.lon).toBeCloseTo(-99.735, 4);
  });

  it("solo calles con ese nombre en el mapa: no se encontró (nunca otra calle del pueblo)", async () => {
    const d = deps([
      {
        category: "highway",
        type: "residential",
        name: "Calle Miguel Alemán",
        lat: 28.84,
        lon: -111.5,
      },
    ]);
    expect(await ubicarReferencia(caso6, "Hermosillo, Sonora", d)).toBeNull();
    expect(d.consultas).toHaveLength(0);
  });
});
