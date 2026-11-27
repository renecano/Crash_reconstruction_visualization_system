import { describe, expect, it } from "vitest";
import {
  consultaCruces,
  crucesDeNodos,
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
    expect(patronDeCalle("calle 5")).toBeNull();
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
