import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { distanciaM, rumboDeg } from "./geo";
import { medidasDe, posesDeImpacto } from "./poses-impacto";

const P = { lat: 19.3576, lon: -99.0625 };
const exp = (caras: [string, string] | null): Expediente =>
  ({
    caso: { modalidades: ["alcance"] },
    vehiculos: [
      { id: "V1", clase: "sedan_mediano" },
      { id: "V2", clase: "pickup" },
    ],
    impactos: [
      {
        orden: 1,
        vehiculos: ["V1", "V2"],
        fuente: "perito",
        ...(caras
          ? {
              zonas: [
                { vehiculo: "V1", zona: { cara: caras[0] } },
                { vehiculo: "V2", zona: { cara: caras[1] } },
              ],
            }
          : {}),
      },
    ],
  }) as unknown as Expediente;
const ll = (p: { lat: number; lon: number }) => [p.lon, p.lat] as [number, number];

describe("las poses de impacto desde el punto del perito (V2)", () => {
  it("alcance: el mismo rumbo, frente con parte posterior en el punto", () => {
    const [a, b] = posesDeImpacto(exp(["frontal", "posterior"]), P, 30);
    expect(a!.rumbo).toBe(30);
    expect(b!.rumbo).toBe(30);
    // A queda medio largo detrás del punto; B, medio largo delante.
    expect(distanciaM(ll(a!.punto), ll(P))).toBeCloseTo(
      medidasDe({ id: "V1", clase: "sedan_mediano" } as never).largo / 2,
      2,
    );
    expect(rumboDeg(ll(a!.punto), ll(P))).toBeCloseTo(30, 0);
    expect(rumboDeg(ll(P), ll(b!.punto))).toBeCloseTo(30, 0);
  });

  it("frontal: rumbos contrarios", () => {
    const [a, b] = posesDeImpacto(exp(["frontal", "frontal"]), P, 0);
    expect(b!.rumbo).toBe(180);
    expect(rumboDeg(ll(P), ll(b!.punto))).toBeCloseTo(0, 0);
    expect(a!.rumbo).toBe(0);
  });

  it("frente contra el costado derecho: perpendicular, con el costado de cara al otro", () => {
    const [, b] = posesDeImpacto(exp(["frontal", "lateral_derecho"]), P, 0);
    // A va al norte y pega en el costado derecho de B: ese costado mira al sur, hacia A, así que
    // B apunta al oriente (90°); con el costado izquierdo, al poniente (270°).
    expect(b!.rumbo).toBe(90);
    expect(rumboDeg(ll(P), ll(b!.punto))).toBeCloseTo(0, 0);
    expect(distanciaM(ll(b!.punto), ll(P))).toBeCloseTo(
      medidasDe({ id: "V2", clase: "pickup" } as never).ancho / 2,
      2,
    );
    const [, c] = posesDeImpacto(exp(["frontal", "lateral_izquierdo"]), P, 0);
    expect(c!.rumbo).toBe(270);
  });

  it("sin caras de contacto, los dos en el punto con el rumbo de la flecha", () => {
    const [a, b] = posesDeImpacto(exp(null), P, 45);
    expect(a).toEqual({ vehiculo: "V1", punto: P, rumbo: 45 });
    expect(b).toEqual({ vehiculo: "V2", punto: P, rumbo: 45 });
  });
});

describe("la huella de frenado que mide el perito (V2)", () => {
  it("se agrega con fuente perito y reemplaza su medida anterior, no las del reporte", async () => {
    const { conHuella, problemasExpediente } = await import("./escena-narracion");
    const base = {
      ...exp(["frontal", "posterior"]),
      evidencias: {
        huellas: [
          {
            tipo: "frenado",
            vehiculo: "V1",
            longitud: { valor: 9, unidad: "m", fuente: "expediente" },
          },
        ],
      },
    } as unknown as Expediente;
    let e = conHuella(base, "V1", 12.5);
    e = conHuella(e, "V1", 13);
    const hs = e.evidencias!.huellas!;
    expect(hs.map((h) => [h.longitud?.valor, h.longitud?.fuente])).toEqual([
      [9, "expediente"],
      [13, "perito"],
    ]);
    expect(problemasExpediente(e).filter((p) => p.includes("huellas"))).toEqual([]);
  });
});
