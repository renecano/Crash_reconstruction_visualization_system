import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { escenaComoPerito } from "./ejemplo-como-perito";
import { conLugarDelEjemplo } from "./ejemplos-narracion";
import { AVISO_VUELTA_SIN_CRUCE, vueltasSinCruce } from "./escena-propuesta";
import { RECETAS_PERITO } from "./recetas-perito";

/**
 * La vuelta narrada necesita una esquina (René, 2026-11-28: el camión del caso 2 «dio vuelta a la
 * derecha» y, en un lugar sin cruce, seguía recto en silencio).
 */
const choque = { lat: 19.2565, lon: -99.6043 };
const conVuelta = (tipo: string) =>
  ({
    caso: {},
    vehiculos: [{ id: "V1" }],
    impactos: [{ orden: 1, vehiculos: ["V1"], objeto_fijo: "peatón", fuente: "perito" }],
    versiones: [
      {
        tipo: "evidencia",
        maniobras: [
          {
            vehiculo: "V1",
            tipo,
            cita: { texto: "dio vuelta a la derecha para incorporarse a Avenida Estado de México" },
          },
        ],
      },
    ],
  }) as unknown as Expediente;

describe("la vuelta narrada sin cruce en el lugar", () => {
  it("sin una esquina cerca del choque: se avisa, con la cita", () => {
    const lejos = [{ punto: { lat: 19.2575, lon: -99.6043 } }]; // ~111 m al norte
    expect(vueltasSinCruce(conVuelta("vira_derecha"), lejos, { 1: choque })).toEqual([
      {
        vehiculo: "V1",
        cita: "dio vuelta a la derecha para incorporarse a Avenida Estado de México",
      },
    ]);
    expect(vueltasSinCruce(conVuelta("vira_izquierda"), [], { 1: choque })).toHaveLength(1);
    expect(AVISO_VUELTA_SIN_CRUCE).toBe(
      "la narración dice que dio vuelta, pero aquí no hay un cruce: revisa el lugar",
    );
  });

  it("con la esquina a pocos metros, o sin vuelta narrada, no se avisa", () => {
    const cerca = [{ punto: { lat: 19.2567, lon: -99.6042 } }]; // ~24 m
    expect(vueltasSinCruce(conVuelta("vira_derecha"), cerca, { 1: choque })).toEqual([]);
    expect(vueltasSinCruce(conVuelta("circula"), [], { 1: choque })).toEqual([]);
  });
});

describe("en los cinco ejemplos, en su lugar real, el aviso no sale de más", () => {
  for (const receta of RECETAS_PERITO)
    it(receta.clave, () => {
      const g = JSON.parse(
        readFileSync(
          resolve(__dirname, `../../../../data/cesvi/grabaciones/ejemplos/${receta.clave}.json`),
          "utf8",
        ),
      ) as { narracion: string; salida: SalidaCorpus };
      const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
      const e0 = conLugarDelEjemplo(
        g.narracion,
        leida.expediente as never,
      ) as unknown as Expediente;
      const r = escenaComoPerito(e0, g.narracion, leida.posiciones, receta);
      expect(r.propuestos.map((p) => p.clave)).not.toContainEqual(
        expect.stringMatching(/^vuelta-sin-cruce/),
      );
    });
});
