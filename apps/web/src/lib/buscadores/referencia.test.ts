import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buscarReferencia,
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

describe("buscarReferencia, con lo grabado", () => {
  it("Calzada de Tlalpan a la altura de Metro Portales", async () => {
    const p = await buscarReferencia(
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
    const p = await buscarReferencia(
      "en la glorieta de la Diana Cazadora, sobre Paseo de la Reforma",
      "Cuauhtémoc, Ciudad de México",
      grabadas,
    );
    expect(p!.calle).toMatch(/Reforma/);
    expect(km(p!, { lat: 19.42513, lon: -99.17163 })).toBeLessThan(0.15);
    expect(p!.explicacion).toContain("Hay 2 lugares con ese nombre en el mapa");
  });

  it("Periférico Sur a la altura de la salida a San Jerónimo", async () => {
    const p = await buscarReferencia(
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
      await buscarReferencia(
        "a la altura de la estación Inexistente",
        "Benito Juárez, Ciudad de México",
        grabadas,
      ),
    ).toBeNull();
  });
});
