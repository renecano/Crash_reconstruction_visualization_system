import { describe, expect, it } from "vitest";
import { conLugarDelEjemplo, EJEMPLOS } from "./ejemplos-narracion";

/**
 * Los cinco ejemplos abren siempre en su lugar (René, 2026-11-25): la carambola preguntaba «¿Dónde
 * fue?» porque el buscador daba Avenida Puerta del Sol por Boulevard de los Pinos.
 */
describe("el lugar de los ejemplos", () => {
  it("los cinco traen su lugar, en México", () => {
    expect(EJEMPLOS).toHaveLength(5);
    for (const e of EJEMPLOS) {
      expect(e.lugar.lat).toBeGreaterThan(14);
      expect(e.lugar.lat).toBeLessThan(33);
      expect(e.lugar.lon).toBeGreaterThan(-118);
      expect(e.lugar.lon).toBeLessThan(-86);
      expect(e.lugar.nombre.length).toBeGreaterThan(3);
    }
  });

  it("un ejemplo sin cambios abre en su lugar; con un cambio, lo busca la app", () => {
    const e = { caso: { lugar: { descripcion: { valor: "Boulevard de los Pinos" } } } };
    const carambola = EJEMPLOS.find((x) => x.clave === "carambola-lluvia")!;
    const con = conLugarDelEjemplo(carambola.narracion, e) as unknown as {
      caso: { lugar: { coordenadas: { lat: number; lon: number }; descripcion: unknown } };
    };
    expect(con.caso.lugar.coordenadas).toEqual({
      lat: carambola.lugar.lat,
      lon: carambola.lugar.lon,
    });
    expect(con.caso.lugar.descripcion).toEqual({ valor: "Boulevard de los Pinos" });
    expect(conLugarDelEjemplo(`${carambola.narracion} Otra cosa.`, e)).toBe(e);
  });
});
