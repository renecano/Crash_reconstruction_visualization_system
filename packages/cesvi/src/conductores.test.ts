/**
 * R12a en el paso 6: la escena con el conductor del perito y la lectura del bloque `agentes` (los
 * resultados son los de la referencia Python en `fixtures/agentes/resultados`).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEscena } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import {
  decisionEnPalabras,
  especConConductor,
  leerPruebaConductores,
  problemasHipotesis,
} from "./conductores";
import type { SalidaCorpus } from "./corpus";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import { especDeExpediente, interpretarResultado, type Reconstruccion } from "./reconstruccion";

type Json = Record<string, unknown>;
const aqui = dirname(fileURLToPath(import.meta.url));
const leer = (ruta: string) => JSON.parse(readFileSync(resolve(aqui, ruta), "utf8")) as Json;

/** El crucero de E-R1 (lectura grabada), colocado en el mapa como en las pruebas de R2. */
const grabacion = leer("../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json") as {
  narracion: string;
  salida: SalidaCorpus;
};
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});
function colocado(): Reconstruccion {
  let e = escenaDeNarracion(grabacion.salida, grabacion.narracion).expediente;
  e = conPosicion(e, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
  e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
  const base = especDeExpediente(e);
  const sinInversion = { evidencia: [], parametros: [], velocidad_impacto: [], residuos: [] };
  return interpretarResultado(base, { vehiculos: [], eventos: [], inversion: sinInversion });
}

/** Una reconstrucción de prueba que solo aporta los nombres de los vehículos del caso. */
const conNombres = (ids: Record<string, string>) => ({ ids }) as unknown as Reconstruccion;

describe("la hipótesis del perito sobre un conductor (R12a)", () => {
  it("la escena lleva la decisión, el instante y el tiempo de reacción del perito, y es válida", () => {
    const r = colocado();
    const sid = Object.keys(r.ids).find((k) => r.ids[k] === "V2")!;
    const spec = especConConductor(r, {
      vehiculo: "V2",
      decision: "frenar",
      segundosAntes: 1.2,
      tiempoReaccionS: 0.9,
    });
    expect(validateEscena(spec).ok).toBe(true);
    const vs = spec.vehiculos as Json[];
    expect(vs.find((v) => v.id === sid)!.conductor).toMatchObject({
      decision: { valor: "frenar", fuente: "usuario" },
      instante_decision: { valor: -1.2, unidad: "s", fuente: "usuario" },
      tiempo_reaccion: { valor: 0.9, unidad: "s" },
    });
    expect(vs.filter((v) => v.conductor)).toHaveLength(1);
    // Sin tiempo de reacción del perito, el solver usa el típico: la escena no lo inventa.
    const sinTr = especConConductor(r, { vehiculo: "V2", decision: "seguir", segundosAntes: 0 });
    expect((sinTr.vehiculos as Json[]).find((v) => v.id === sid)!.conductor).not.toHaveProperty(
      "tiempo_reaccion",
    );
  });

  it("dice qué está fuera de rango antes de probar", () => {
    const r = colocado();
    expect(problemasHipotesis(r, { vehiculo: "V1", decision: "frenar", segundosAntes: 1 })).toEqual(
      [],
    );
    expect(
      problemasHipotesis(r, {
        vehiculo: "V9",
        decision: "frenar",
        segundosAntes: -1,
        tiempoReaccionS: 5,
      }),
    ).toHaveLength(3);
    expect(
      problemasHipotesis(r, { vehiculo: "V1", decision: "frenar", segundosAntes: 11 }),
    ).toEqual(["El instante va hasta 10 s antes del impacto."]);
  });

  it("frenar antes: la velocidad relativa contra la reconstrucción, en km/h y en %", () => {
    const r = conNombres({ "veh-a": "V2", "veh-b": "V1" });
    const p = leerPruebaConductores(
      r,
      leer("../../scene-schema/fixtures/agentes/resultados/alcance_frena_antes.json"),
    );
    expect(p.conHipotesis).toMatchObject({ contacto: true, t: 0.293385, vehiculos: ["V2", "V1"] });
    expect(p.sinHipotesis.relativaKmh).toBe(38.51294);
    expect(p.diferenciaRelativa).toEqual({ kmh: -14, pct: -36.36 });
    expect(p.decisiones.map(decisionEnPalabras)).toEqual([
      "V2 frena en −1.15 s (la hipótesis del perito)",
    ]);
    expect(p.tiemposReaccion[0]).toMatchObject({ vehiculo: "V2", s: 1.1, rango: [0.7, 1.5] });
  });

  it("la carambola: la reacción en cadena, en orden, y la sensibilidad al tiempo de reacción", () => {
    const r = conNombres({ "veh-a": "V1", "veh-b": "V2", "veh-c": "V3" });
    const p = leerPruebaConductores(
      r,
      leer("../../scene-schema/fixtures/agentes/resultados/carambola_cadena.json"),
    );
    expect(p.decisiones.map(decisionEnPalabras)).toEqual([
      "V3 frena en −2.50 s (la hipótesis del perito)",
      "V2 frena en −1.40 s, 1.10 s después de ver frenar a V3 (−2.50 s)",
      "V1 frena en −0.30 s, 1.10 s después de ver frenar a V2 (−1.40 s)",
    ]);
    expect(p.conHipotesis.vehiculos).toEqual(["V1", "V2"]);
    expect(p.diferenciaRelativa).toEqual({ kmh: 14.38, pct: 143.77 });
    expect(p.sensibilidad).toEqual({
      muestras: 64,
      sinContacto: 0,
      p10: 21.813615,
      p90: 25.777437,
    });
    expect(p.cambiaElPar).toBe(false);
  });

  it("si el primer contacto cambia de vehículos, no se comparan sus velocidades", () => {
    const r = conNombres({ "veh-a": "V1", "veh-b": "V2", "veh-c": "V3" });
    const agentes = leer("../../scene-schema/fixtures/agentes/resultados/carambola_cadena.json");
    const base = agentes.linea_base as Json;
    const otroPar = { ...agentes, linea_base: { ...base, vehiculos: ["veh-b", "veh-c"] } };
    const p = leerPruebaConductores(r, otroPar);
    expect(p.cambiaElPar).toBe(true);
    expect(p.diferenciaRelativa).toBeNull();
  });
});
