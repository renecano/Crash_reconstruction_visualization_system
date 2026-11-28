import { distanciaM, type Expediente } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { conReposoNarradoDePersonas, distanciaNarradaDePersona } from "./escena-facil";

/**
 * El peatón golpeado, donde la narración dice que quedó (René, 2026-11-28, caso 2: «El peatón quedó
 * tendido sobre el arroyo vehicular, aproximadamente a 4 m del punto de contacto y a 1 m del paso
 * peatonal»): se coloca solo, como los vehículos, sin que el perito lo ponga.
 */
const caso2 =
  "Al dar la vuelta, impactó con su parte frontal derecha a un peatón, adulto, que cruzaba Avenida Estado de México sobre el paso peatonal, de oriente a poniente. El peatón quedó tendido sobre el arroyo vehicular, aproximadamente a 4 m del punto de contacto y a 1 m del paso peatonal. El vehículo A frenó y quedó detenido 6 m después del paso peatonal.";

const contacto = { lat: 19.2504, lon: -99.5776 };
const expediente = (fuente: "supuesto" | "perito"): Expediente =>
  ({
    caso: { modalidades: ["atropellamiento"] },
    vehiculos: [{ id: "V1" }],
    impactos: [
      { orden: 1, vehiculos: ["V1"], objeto_fijo: "peatón", persona: "per-1", fuente: "perito" },
    ],
    personas: [{ id: "per-1", rol: "peaton", punto: contacto, fuente }],
    versiones: [
      {
        tipo: "evidencia",
        // El camión ya dio la vuelta: avanza hacia el oriente (rumbo 90).
        posiciones: [
          {
            vehiculo: "V1",
            fase: "impacto",
            punto: { lat: 19.2504, lon: -99.57762 },
            rumbo: 90,
            fuente: "perito",
          },
        ],
      },
    ],
  }) as unknown as Expediente;

describe("el peatón, donde la narración dice que quedó", () => {
  it("lee los metros entre el contacto y donde quedó", () => {
    expect(distanciaNarradaDePersona(caso2)).toBe(4);
    expect(distanciaNarradaDePersona("La ciclista quedó a 6.5 metros del impacto.")).toBe(6.5);
    // Los metros del vehículo no son los del peatón.
    expect(
      distanciaNarradaDePersona("El vehículo A quedó 6 m después del paso peatonal."),
    ).toBeNull();
    expect(distanciaNarradaDePersona(null)).toBeNull();
  });

  it("lo coloca a 4 m del contacto, hacia donde avanzaba el camión", () => {
    const e = conReposoNarradoDePersonas(expediente("supuesto"), caso2);
    const per = e.personas![0]!;
    expect(per.final).toBeDefined();
    const d = distanciaM([contacto.lon, contacto.lat], [per.final!.lon, per.final!.lat]);
    expect(d).toBeCloseTo(4, 1);
    expect(per.final!.lon).toBeGreaterThan(contacto.lon); // al oriente
    expect(per.final!.lat).toBeCloseTo(contacto.lat, 5);
    // Idempotente.
    expect(conReposoNarradoDePersonas(e, caso2)).toBe(e);
  });

  it("si el perito ya lo hizo suyo, no se toca; sin metros narrados, tampoco", () => {
    const delPerito = expediente("perito");
    expect(conReposoNarradoDePersonas(delPerito, caso2)).toBe(delPerito);
    const sinMetros = expediente("supuesto");
    expect(conReposoNarradoDePersonas(sinMetros, "El peatón quedó tendido sobre el arroyo.")).toBe(
      sinMetros,
    );
  });
});
