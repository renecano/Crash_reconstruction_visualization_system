import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { posicionesEncimadas, HOLGURA_M } from "./encimadas";
import { conPosicion } from "./escena-narracion";
import { desdeMetros, enMetros } from "./geo";
import { medidasDe } from "./poses-impacto";

/** Un punto a `norte` y `este` metros de un origen fijo (entrada de prueba, no un dato del caso). */
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => {
  const [lon, lat] = desdeMetros(este, norte, [P.lon, P.lat]);
  return { lat, lon };
};

const base: Expediente = {
  caso: {},
  vehiculos: [
    { id: "V1", clase: "pickup" },
    { id: "V2", clase: "sedan_mediano" },
  ],
} as unknown as Expediente;

const final = (e: Expediente, v: "V1" | "V2", norte: number, este: number, rumbo: number) =>
  conPosicion(e, { vehiculo: v, fase: "final", punto: m(norte, este), rumbo });

describe("posiciones finales que se enciman (comentario de René)", () => {
  it("avisa con cuánto se traslapan y la propuesta las separa con su holgura", () => {
    // V1 hacia el norte en el origen; V2 de lado, 1 m al este: se traslapan.
    const e = final(final(base, "V1", 0, 0, 0), "V2", 0, 1, 90);
    const [enc, ...resto] = posicionesEncimadas(e);
    expect(resto).toEqual([]);
    expect(enc!.vehiculos).toEqual(["V1", "V2"]);
    // V2 de lado mide su ancho en norte-sur y su largo en este-oeste: el menor traslape es este-oeste,
    // (ancho de V1 + largo de V2) / 2 − 1 m.
    const w1 = medidasDe(base.vehiculos[0]!).ancho;
    const l2 = medidasDe(base.vehiculos[1]!).largo;
    expect(enc!.traslape_m).toBeCloseTo((w1 + l2) / 2 - 1, 2);
    // Aplicada la propuesta, ya no se enciman y quedan a la holgura, sin girarse.
    let sep = e;
    for (const p of enc!.propuesta) sep = conPosicion(sep, { ...p, fase: "final" });
    expect(posicionesEncimadas(sep)).toEqual([]);
    const [a, b] = enc!.propuesta;
    const este = (p: { lat: number; lon: number }) => enMetros([p.lon, p.lat], [P.lon, P.lat]).este;
    expect(este(b.punto) - este(a.punto) - (w1 + l2) / 2).toBeCloseTo(HOLGURA_M, 3);
    expect([a.rumbo, b.rumbo]).toEqual([0, 90]);
  });

  it("separadas, o con una sola posición final, no avisa", () => {
    expect(posicionesEncimadas(final(final(base, "V1", 0, 0, 0), "V2", 10, 0, 0))).toEqual([]);
    expect(posicionesEncimadas(final(base, "V1", 0, 0, 0))).toEqual([]);
    expect(posicionesEncimadas(base)).toEqual([]);
  });
});
