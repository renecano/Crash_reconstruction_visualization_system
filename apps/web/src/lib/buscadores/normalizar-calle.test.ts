import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { coincideCalle, nombresDeVia, normalizarNombreCalle } from "./normalizar-calle";

/** Las calles de OSM alrededor de cada lugar (solo sus etiquetas de nombre), grabadas el 2026-11-27. */
const OSM = JSON.parse(
  readFileSync(resolve(__dirname, "__fixtures__/osm-nombres.json"), "utf8"),
) as { lugares: Record<string, { vias: { id: number; tags: Record<string, string> }[] }> };

/** Las vías del lugar que coinciden con el nombre narrado. */
/** Las vías del lugar que coinciden con el nombre narrado, una por nombre de OSM. */
const enElMapa = (lugar: string, narrada: string) => {
  const out: ({ id: number } & NonNullable<ReturnType<typeof coincideCalle>>)[] = [];
  for (const v of OSM.lugares[lugar]!.vias) {
    const c = coincideCalle(narrada, v.tags);
    if (c && !out.some((o) => o.nombre === c.nombre && o.etiqueta === c.etiqueta))
      out.push({ id: v.id, ...c });
  }
  return out;
};

describe("normalizarNombreCalle", () => {
  it("abreviaturas, títulos, acentos, mayúsculas y el tipo de vía", () => {
    expect(normalizarNombreCalle("Av. Gral. Lázaro Cárdenas")).toBe("lazaro cardenas");
    expect(normalizarNombreCalle("AVENIDA LÁZARO CÁRDENAS")).toBe("lazaro cardenas");
    expect(normalizarNombreCalle("Blvd. Aeropuerto")).toBe("aeropuerto");
    expect(normalizarNombreCalle("Calz. de Tlalpan")).toBe("tlalpan");
    expect(normalizarNombreCalle("Prol. Lic. Benito Juárez")).toBe("prolongacion benito juarez");
    expect(normalizarNombreCalle("Priv. Sta. Fe")).toBe("privada santa fe");
    expect(normalizarNombreCalle("Cda. Sto. Domingo")).toBe("cerrada santo domingo");
    expect(normalizarNombreCalle("Avenida de la Independencia")).toBe("independencia");
    expect(normalizarNombreCalle("Ing. Dr. Pdte. Gob. Madero")).toBe("madero");
  });

  it("los números escritos en fechas", () => {
    expect(normalizarNombreCalle("Cinco de Mayo")).toBe(normalizarNombreCalle("Calle 5 de Mayo"));
    expect(normalizarNombreCalle("Dieciséis de Septiembre")).toBe("16 de septiembre");
    expect(normalizarNombreCalle("Primero de Mayo")).toBe(normalizarNombreCalle("1o. de Mayo"));
    expect(normalizarNombreCalle("Cinco de Febrero")).not.toBe(normalizarNombreCalle("5 de Mayo"));
  });

  it("todos los nombres de una vía de OSM", () => {
    expect(
      nombresDeVia({
        name: "Avenida Lázaro Cárdenas",
        alt_name: "Eje Central;Eje Central Lázaro Cárdenas",
      }),
    ).toEqual([
      { nombre: "Avenida Lázaro Cárdenas", etiqueta: "name" },
      { nombre: "Eje Central", etiqueta: "alt_name" },
      { nombre: "Eje Central Lázaro Cárdenas", etiqueta: "alt_name" },
    ]);
  });
});

describe("coincideCalle, con las calles grabadas de OSM", () => {
  it("Lerdo de Tejada y Nicolás Bravo (centro de Toluca)", () => {
    const lerdo = enElMapa("toluca-centro", "avenida Lerdo de Tejada");
    expect(lerdo.map((c) => c.nombre)).toEqual(["Avenida Sebastián Lerdo de Tejada"]);
    expect(lerdo[0]).toMatchObject({ como: "parte", seguridad: "media" });
    expect(lerdo[0]!.explicacion).toBe(
      "«avenida Lerdo de Tejada» es parte del nombre de «Avenida Sebastián Lerdo de Tejada» en el mapa.",
    );
    const bravo = enElMapa("toluca-centro", "calle Nicolás Bravo");
    expect(bravo.map((c) => [c.nombre, c.seguridad])).toEqual([["Calle Nicolás Bravo", "alta"]]);
  });

  it("Eje Central y Lázaro Cárdenas (centro de la CDMX)", () => {
    const eje = enElMapa("eje-central", "Eje Central");
    expect(eje.map((c) => [c.nombre, c.etiqueta, c.seguridad])).toEqual([
      ["Eje Central", "alt_name", "media"],
    ]);
    expect(eje[0]!.explicacion).toContain("es otro nombre de «Avenida Lázaro Cárdenas»");
    expect(enElMapa("eje-central", "Eje Central Lázaro Cárdenas").length).toBeGreaterThan(0);
    expect(enElMapa("eje-central", "Av. Lázaro Cárdenas")[0]).toMatchObject({
      nombre: "Avenida Lázaro Cárdenas",
      seguridad: "alta",
    });
  });

  it("Blvd. Aeropuerto (Toluca)", () => {
    const b = enElMapa("aeropuerto", "Blvd. Aeropuerto");
    expect(b.map((c) => c.nombre)).toEqual(["Boulevard Aeropuerto Miguel Alemán Valdez"]);
    expect(b[0]!.seguridad).toBe("baja"); // una sola palabra coincide: el perito confirma
    expect(enElMapa("aeropuerto", "boulevard Aeropuerto Miguel Alemán")[0]!.seguridad).toBe(
      "media",
    );
  });

  it("Paseo Tollocan (Toluca)", () => {
    const t = enElMapa("tollocan", "Paseo Tollocan");
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((c) => /Tollocan/.test(c.nombre))).toBe(true);
    expect(t.some((c) => c.seguridad === "alta")).toBe(true);
    // La ciclovía no es la calle: «Ciclovía Tollocan» no es «Paseo Tollocan».
    expect(enElMapa("tollocan", "Paseo Tollocan").some((c) => /Ciclov/.test(c.nombre))).toBe(false);
  });

  it("sin coincidencias falsas", () => {
    expect(enElMapa("toluca-centro", "calle 5 de Mayo")).toEqual([]);
    expect(enElMapa("toluca-centro", "calle Morelos")).toEqual([]);
    expect(coincideCalle("de", { name: "Calle 5 de Febrero" })).toBeNull();
  });
});
