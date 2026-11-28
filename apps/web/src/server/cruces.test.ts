import { describe, expect, it } from "vitest";
import {
  consultaCruces,
  crucesDeNodos,
  crucesPorCercania,
  crucesPorNombre,
  nombresDeCalle,
  patronDeCalle,
} from "./cruces";

describe("los cruces por nombre (#388)", () => {
  it("el patrón no lleva el tipo de la calle y acepta acentos", () => {
    const p = patronDeCalle("avenida Lerdo de Tejada")!;
    expect(new RegExp(p, "i").test("Avenida Sebastián Lerdo de Tejada")).toBe(true);
    expect(new RegExp(patronDeCalle("calle Nicolas Bravo")!, "i").test("Calle Nicolás Bravo")).toBe(
      true,
    );
    // Sin barras invertidas: Overpass QL no las pasa dentro de una cadena.
    expect(p).not.toContain("\\");
    // Un nombre que es solo un número se busca completo: «Calle 5», no «5 de Mayo».
    const cinco = new RegExp(patronDeCalle("calle 5")!, "i");
    expect(cinco.test("Calle 5")).toBe(true);
    expect(cinco.test("Calle 5 de Mayo")).toBe(false);
  });
  it("un eje se busca también por sus dos partes", () => {
    expect(nombresDeCalle("Eje Central Lázaro Cárdenas")).toEqual([
      "Eje Central Lázaro Cárdenas",
      "Eje Central",
      "Lázaro Cárdenas",
    ]);
  });
  it("la consulta busca en name, alt_name, official_name y ref", () => {
    const q = consultaCruces("a", "b", { sur: 1, oeste: 2, norte: 3, este: 4 });
    expect(q).toContain("alt_name");
    expect(q).toContain("node(w.a)(w.b);");
  });
  it("los nodos de los cuerpos de una avenida son un solo cruce, del más cercano al centro", () => {
    const c = crucesDeNodos(
      [
        { lat: 19.3, lon: -99.6 },
        { lat: 19.30015, lon: -99.6 },
        { lat: 19.31, lon: -99.6 },
      ],
      { lat: 19.311, lon: -99.6 },
    );
    expect(c).toHaveLength(2);
    expect(c[0]!.lat).toBeCloseTo(19.31, 5);
  });
  it("sin respuesta de Overpass, null; sin nodos comunes, lista vacía", async () => {
    const caja = { sur: 19, oeste: -100, norte: 20, este: -99 };
    const falla = (async () => new Response("", { status: 504 })) as unknown as typeof fetch;
    expect(await crucesPorNombre(["Av. Uno", "Calle Dos"], caja, null, falla)).toBeNull();
    const vacia = (async () =>
      new Response(JSON.stringify({ elements: [] }), { status: 200 })) as unknown as typeof fetch;
    expect(await crucesPorNombre(["Av. Uno", "Calle Dos"], caja, null, vacia)).toEqual([]);
    // Tiempo agotado: no es «no se cruzan».
    const agotada = (async () =>
      new Response(
        JSON.stringify({ elements: [], remark: 'runtime error: Query timed out in "query"' }),
        { status: 200 },
      )) as unknown as typeof fetch;
    expect(await crucesPorNombre(["Av. Uno", "Calle Dos"], caja, null, agotada)).toBeNull();
  });
});

describe("los nombres que no empataban (René, 2026-11-27)", () => {
  const empata = (narrado: string, osm: string) =>
    new RegExp(patronDeCalle(narrado)!, "i").test(osm);
  it("abreviaturas y títulos, con sus dos formas o sin ellos", () => {
    expect(empata("Av. Gral. Lázaro Cárdenas", "Avenida General Lázaro Cárdenas")).toBe(true);
    expect(empata("Avenida General Lázaro Cárdenas", "Avenida Lázaro Cárdenas")).toBe(true);
    expect(empata("Blvd. Lic. Adolfo López Mateos", "Boulevard Adolfo López Mateos")).toBe(true);
    expect(
      empata("Calz. Ing. Juan Guillermo Villasana", "Calzada Ingeniero Juan Guillermo Villasana"),
    ).toBe(true);
    expect(empata("Prol. Dr. Gustavo Baz", "Prolongación Doctor Gustavo Baz")).toBe(true);
    expect(empata("Avda. Gob. Sánchez Colín", "Avenida Gobernador Sánchez Colín")).toBe(true);
    expect(empata("Pdte. Juárez", "Presidente Juárez")).toBe(true);
    expect(empata("Sta. Rosa de Lima", "Santa Rosa de Lima")).toBe(true);
  });
  it("acentos, mayúsculas y artículos de en medio", () => {
    expect(empata("AVENIDA REFORMA", "Avenida Reforma")).toBe(true);
    expect(empata("calle Nicolas Bravo", "Calle Nicolás Bravo")).toBe(true);
    expect(empata("Glorieta de las Cibeles", "Glorieta de Cibeles")).toBe(true);
  });
  it("números en cifra o en letra", () => {
    expect(empata("5 de Mayo", "Calle Cinco de Mayo")).toBe(true);
    expect(empata("Cinco de Mayo", "Avenida 5 de Mayo")).toBe(true);
    expect(empata("16 de Septiembre", "Dieciséis de Septiembre")).toBe(true);
  });
  it("un cruce sin nodo común: donde las vías pasan a menos de 20 m", () => {
    const via = (name: string, puntos: [number, number][]) => ({
      tags: { name },
      geometry: puntos.map(([lat, lon]) => ({ lat, lon })),
    });
    // Dos avenidas que se cruzan por un paso a desnivel: no comparten nodo.
    const c = crucesPorCercania(
      [
        via("Avenida Universidad", [
          [19.34, -99.17],
          [19.35, -99.17],
        ]),
        via("Avenida Miguel Ángel de Quevedo", [
          [19.345, -99.175],
          [19.345, -99.165],
        ]),
        via("Avenida Miguel Ángel de Quevedo", [
          [19.36, -99.175],
          [19.36, -99.165],
        ]),
      ],
      patronDeCalle("Avenida Universidad")!,
      patronDeCalle("Avenida Miguel Ángel de Quevedo")!,
    );
    expect(c).toHaveLength(1);
    expect(c[0]!.lat).toBeCloseTo(19.345, 4);
    expect(c[0]!.lon).toBeCloseTo(-99.17, 4);
  });
  it("sin barras invertidas ni (?: para el motor de Overpass", () => {
    for (const n of ["Av. Gral. Lázaro Cárdenas", "calle 5", "Glorieta de las Cibeles"]) {
      const p = patronDeCalle(n)!;
      expect(p).not.toContain("\\");
      expect(p).not.toContain("(?:");
    }
  });
});
