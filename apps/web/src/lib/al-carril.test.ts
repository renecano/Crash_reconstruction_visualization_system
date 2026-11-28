import { describe, expect, it } from "vitest";
import { enMetros } from "@croquis/cesvi";
import { alCarril, type Calle } from "./escena-facil";

/**
 * El toque del perito al centro de su carril (René, 2026-11-27): una calle de 2 carriles de 3.5 m (7 m),
 * de oeste a este. El carril de la derecha (sur) tiene su centro a 1.75 m del eje.
 */
const lat0 = 19.3;
const lon0 = -99.18;
const ll = (x: number, y: number) => ({
  lon: lon0 + x / (111320 * Math.cos((lat0 * Math.PI) / 180)),
  lat: lat0 + y / 111320,
});
const calle: Calle = {
  id: 1,
  nombre: "Calle recta",
  puntos: [
    [ll(-100, 0).lon, ll(-100, 0).lat],
    [ll(100, 0).lon, ll(100, 0).lat],
  ],
  ancho: 7,
  carriles: 2,
  nodos: [1, 2],
  tipo: "residential",
};
const yDe = (p: { lon: number; lat: number }) => enMetros([p.lon, p.lat], [lon0, lat0]).norte;

describe("el toque al centro de su carril", () => {
  it("a 0.5 m del centro de un carril, pasa al centro y dice cuánto se movió", () => {
    const a = alCarril([calle], ll(10, -1.25))!;
    expect(yDe(a.punto)).toBeCloseTo(-1.75, 2);
    expect(a.movidoM).toBeCloseTo(0.5, 2);
    expect(a.carril).toBe(2); // de izquierda a derecha en la dirección de la calle
  });
  it("dos toques unos centímetros distintos quedan en el mismo punto a lo ancho", () => {
    const a = alCarril([calle], ll(10, -1.4))!;
    const b = alCarril([calle], ll(10, -2.1))!;
    expect(yDe(a.punto)).toBeCloseTo(yDe(b.punto), 3);
  });
  it("fuera de la calzada (el acotamiento) o lejos del centro, queda donde tocó", () => {
    expect(alCarril([calle], ll(10, -4.5))).toBeNull();
    expect(alCarril([calle], ll(10, -0.1))).toBeNull();
  });
});
