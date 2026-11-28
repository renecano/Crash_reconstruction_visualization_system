import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cargarCarreteras, decodificar, sinAdornos, viasDeLaRed } from "./carreteras-locales";
import { leerKmCarretera, ubicarKm, type DepsKm } from "./km-carretera";

/**
 * Sin red (René, 2026-11-28): las carreteras salen del archivo guardado en Croquis y las poblaciones,
 * de Nominatim grabado (el límite o el lugar que elige `depsDeRed`, 2026-11-27 y 2026-11-28).
 */
const G = JSON.parse(
  readFileSync(resolve(__dirname, "__fixtures__/osm-carreteras.json"), "utf8"),
) as { poblaciones: Record<string, { lat: number; lon: number }> };
const POBLACIONES: Record<string, { lat: number; lon: number }> = {
  Toluca: G.poblaciones.toluca!,
  Chihuahua: G.poblaciones.chihuahua!,
  "Ciudad Juárez": G.poblaciones["ciudad-juarez"]!,
  "Villa Ahumada": G.poblaciones["villa-ahumada"]!,
  // Nominatim, 2026-11-28 (el límite municipal, el que elige `depsDeRed`).
  Atlacomulco: { lat: 19.8159192, lon: -99.8681193 },
  Jiquipilco: { lat: 19.5916325, lon: -99.6311743 },
};
const sinRed: DepsKm = {
  overpass: async () => {
    throw new Error("sin red: no se debe llamar a Overpass");
  },
  locales: async (n, c, r) => viasDeLaRed(await cargarCarreteras(), n, c, r),
  poblacion: async (n) => POBLACIONES[n] ?? null,
};
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const k = Math.PI / 180;
  return Math.hypot((b.lon - a.lon) * k * Math.cos(a.lat * k), (b.lat - a.lat) * k) * 6371;
};

describe("las carreteras guardadas en Croquis", () => {
  it("decodifica la geometría («encoded polyline», 1e-5)", () => {
    // El ejemplo de la documentación de Google.
    expect(decodificar("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });

  it("lee el tramo con guion, guion largo, «Carretera» o «Autopista»", () => {
    for (const t of [
      "autopista Toluca–Atlacomulco, kilómetro 35",
      "Autopista Toluca-Atlacomulco km 35",
      "Carretera Toluca — Atlacomulco, km 35",
      "la carretera Toluca - Atlacomulco en el km 35",
    ])
      expect(leerKmCarretera(t)).toMatchObject({ tramo: ["Toluca", "Atlacomulco"], km: 35 });
    expect(sinAdornos("Autopista Toluca - Atlacomulco")).toBe("toluca atlacomulco");
  });

  it("la volcadura en la Toluca–Atlacomulco, km 35, en Jiquipilco: sin red y sobre esa carretera", async () => {
    const p = await ubicarKm(
      "El hecho ocurrió en la autopista Toluca–Atlacomulco, kilómetro 35, en el municipio de Jiquipilco, Estado de México",
      sinRed,
    );
    expect(p).not.toBeNull();
    expect(p!.metodo).not.toBe("cerca-de-poblacion");
    // Entre Toluca y Atlacomulco, a menos de 15 km del municipio que dice la narración.
    expect(km(p!, POBLACIONES.Jiquipilco!)).toBeLessThan(15);
    expect(km(p!, POBLACIONES.Toluca!)).toBeGreaterThan(15);
    expect(km(p!, POBLACIONES.Atlacomulco!)).toBeGreaterThan(10);
  });

  it("el km 120 de la 45 en Chihuahua, cerca de Villa Ahumada: sin red, desde Ciudad Juárez", async () => {
    const p = await ubicarKm(
      "en la carretera federal 45, tramo Chihuahua–Ciudad Juárez, kilómetro 120, cerca de Villa Ahumada",
      sinRed,
    );
    expect(p).not.toBeNull();
    expect(p!.explicacion).toContain("desde Ciudad Juárez");
    expect(km(p!, POBLACIONES["Villa Ahumada"]!)).toBeLessThan(25);
  });

  it("si la carretera no está en el archivo, no inventa: no hay vías", async () => {
    const r = await cargarCarreteras();
    const n = leerKmCarretera("carretera federal 999, km 10, cerca de Toluca")!;
    expect(viasDeLaRed(r, n, [POBLACIONES.Toluca!], 25_000).elements).toEqual([]);
  });
});
