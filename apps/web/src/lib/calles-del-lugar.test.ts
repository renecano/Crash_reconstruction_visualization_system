import type { Expediente } from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { describe, expect, it } from "vitest";
import { deAqui, guardarSiEsDeAqui } from "./calles-del-lugar";

/** Una respuesta de Overpass con una sola calle, alrededor de un punto. */
const calleEn = (id: number, nombre: string, lat: number, lon: number): OverpassResponse =>
  ({
    elements: [
      { type: "node", id: id * 10 + 1, lat, lon: lon - 0.0005 },
      { type: "node", id: id * 10 + 2, lat, lon: lon + 0.0005 },
      {
        type: "way",
        id,
        nodes: [id * 10 + 1, id * 10 + 2],
        tags: { highway: "primary", name: nombre },
      },
    ],
  }) as unknown as OverpassResponse;

const VIEJO = { lat: 19.4269, lon: -99.1677 }; // donde Croquis propuso, mal
const NUEVO = { lat: 19.4269, lon: -99.1567 }; // donde el perito corrigió, ~1.2 km al este
const clave = (p: { lat: number; lon: number }) => `${p.lon.toFixed(3)},${p.lat.toFixed(3)}`;
const vacio = { caso: { lugar: {} }, vehiculos: [] } as unknown as Expediente;
const nombres = (e: Expediente) =>
  (e.caso.lugar?.calles_del_mapa?.vias ?? []).map((v) => (v as { nombre?: string }).nombre);

describe("al corregir el lugar a mano, la escena se arma con las calles del lugar nuevo (#388)", () => {
  it("la respuesta del lugar viejo no se guarda con el nuevo; la del nuevo, sí", () => {
    // 1. En el lugar que propuso Croquis llegan sus calles y se guardan.
    const pedidaVieja = {
      de: clave(VIEJO),
      r: calleEn(1, "Calle del lugar viejo", VIEJO.lat, VIEJO.lon),
    };
    const e1 = guardarSiEsDeAqui(vacio, {
      origen: VIEJO,
      clave: clave(VIEJO),
      overpass: pedidaVieja,
      teselas: null,
      radioM: 150,
    });
    expect(nombres(e1)).toEqual(["Calle del lugar viejo"]);
    // 2. El perito mueve el choque: mientras llegan las del lugar nuevo, la vieja sigue a la vista y no
    //    se guarda con el centro nuevo (era el error: luego se conservaba la vieja).
    const e2 = guardarSiEsDeAqui(e1, {
      origen: NUEVO,
      clave: clave(NUEVO),
      overpass: pedidaVieja,
      teselas: null,
      radioM: 150,
    });
    expect(e2).toBe(e1);
    // 3. Llegan las del lugar nuevo: reemplazan a las viejas, con su centro.
    const e3 = guardarSiEsDeAqui(e2, {
      origen: NUEVO,
      clave: clave(NUEVO),
      overpass: {
        de: clave(NUEVO),
        r: calleEn(2, "Glorieta del lugar nuevo", NUEVO.lat, NUEVO.lon),
      },
      teselas: null,
      radioM: 150,
    });
    expect(nombres(e3)).toEqual(["Glorieta del lugar nuevo"]);
    expect(e3.caso.lugar?.calles_del_mapa?.centro).toEqual(NUEVO);
  });
  it("una respuesta cuenta solo para el lugar que se pidió", () => {
    const r = calleEn(3, "X", 0, 0);
    expect(deAqui({ de: "a", r }, "a")).toBe(r);
    expect(deAqui({ de: "a", r }, "b")).toBeNull();
    expect(deAqui(null, "a")).toBeNull();
  });
});
