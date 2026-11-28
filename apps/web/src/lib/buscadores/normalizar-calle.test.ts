import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claveDeCalle,
  coincideCalle,
  nombresDeVia,
  normalizarNombreCalle,
} from "./normalizar-calle";

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

describe("claveDeCalle", () => {
  it("abreviaturas, títulos, acentos, mayúsculas y el tipo de vía", () => {
    expect(claveDeCalle("Av. Gral. Lázaro Cárdenas")).toBe("lazaro cardenas");
    expect(claveDeCalle("AVENIDA LÁZARO CÁRDENAS")).toBe("lazaro cardenas");
    expect(claveDeCalle("Blvd. Aeropuerto")).toBe("aeropuerto");
    expect(claveDeCalle("Calz. de Tlalpan")).toBe("tlalpan");
    expect(claveDeCalle("Prol. Lic. Benito Juárez")).toBe("prolongacion benito juarez");
    expect(claveDeCalle("Priv. Sta. Fe")).toBe("privada santa fe");
    expect(claveDeCalle("Cda. Sto. Domingo")).toBe("cerrada santo domingo");
    expect(claveDeCalle("Avenida de la Independencia")).toBe("independencia");
    expect(claveDeCalle("Ing. Dr. Pdte. Gob. Madero")).toBe("madero");
  });

  it("los números escritos en fechas", () => {
    expect(claveDeCalle("Cinco de Mayo")).toBe(claveDeCalle("Calle 5 de Mayo"));
    expect(claveDeCalle("Dieciséis de Septiembre")).toBe("16 de septiembre");
    expect(claveDeCalle("Primero de Mayo")).toBe(claveDeCalle("1o. de Mayo"));
    expect(claveDeCalle("Cinco de Febrero")).not.toBe(claveDeCalle("5 de Mayo"));
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

describe("normalizarNombreCalle (la interfaz de René)", () => {
  it("base, formas y patrón", () => {
    const r = normalizarNombreCalle("Av. Gral. Lázaro Cárdenas");
    expect(r.base).toBe("general lazaro cardenas");
    expect(r.formas).toEqual([
      "general lazaro cardenas",
      "lazaro cardenas",
      "gral lazaro cardenas",
    ]);
    expect(r.patron).not.toContain("\\");
    // El patrón encuentra los nombres como vienen en OSM, con acentos, mayúsculas y abreviaturas.
    const re = new RegExp(r.patron!, "i");
    for (const osm of [
      "Avenida Lázaro Cárdenas",
      "Av. Gral. Lázaro Cárdenas",
      "Eje Central Lázaro Cárdenas",
    ])
      expect(re.test(osm)).toBe(true);
    expect(re.test("Avenida Cuauhtémoc")).toBe(false);
  });
  it("los números en cifra y en letra", () => {
    const r = normalizarNombreCalle("Calle Cinco de Mayo");
    expect(r.formas).toEqual(expect.arrayContaining(["5 de mayo", "cinco de mayo"]));
    const re = new RegExp(r.patron!, "i");
    expect(re.test("Calle 5 de Mayo")).toBe(true);
    expect(re.test("Avenida Cinco de Mayo")).toBe(true);
    expect(re.test("Calle 5 de Febrero")).toBe(false);
  });
  it("sin nombre, sin patrón", () => {
    expect(normalizarNombreCalle("  ").patron).toBeNull();
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
