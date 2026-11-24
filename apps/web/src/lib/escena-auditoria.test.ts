import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  escenaDeNarracion,
  impactosEncimados,
  type Expediente,
  type SalidaCorpus,
} from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { poseDe, sentidoEnElCaso } from "./escena-facil";
import { proponerEscena } from "./escena-propuesta";
import { impactosAColocar } from "./pasos-caso";

/**
 * Las causas que encontró la revisión sistemática de la cadena (René, 2026-11-24), con un caso cada
 * una: lo que la escena propuesta sola tiene que hacer bien.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, "../../../..");
const grabada = (ruta: string) => {
  const g = JSON.parse(readFileSync(resolve(RAIZ, ruta), "utf8")) as {
    narracion: string;
    salida: SalidaCorpus;
  };
  return { ...escenaDeNarracion(g.salida, g.narracion), narracion: g.narracion };
};

describe("«en sentido contrario»: el contrario del otro vehículo", () => {
  const { expediente: e, narracion } = grabada("data/cesvi/grabaciones/ronda4/ronda4-subida.json");

  it("el Tsuru que «bajaba en sentido contrario» a la Ranger (de norte a sur) va de sur a norte", () => {
    const ranger = sentidoEnElCaso(narracion, e.vehiculos[0]!, e.vehiculos);
    const tsuru = sentidoEnElCaso(narracion, e.vehiculos[1]!, e.vehiculos);
    expect(ranger?.rumbo).toBe(180);
    expect(tsuru?.rumbo).toBe(0);
    expect(tsuru?.cita).toMatch(/sentido contrario/);
  });
});

describe("el segundo choque de una carambola, propuesto por las zonas", () => {
  const c = JSON.parse(
    readFileSync(resolve(RAIZ, "data/cesvi/casos/rene-carambola-semaforo.croquis"), "utf8"),
  ) as { expediente: Expediente; narracion: string };
  // Como llega a La escena: sin posiciones.
  const e0: Expediente = {
    ...c.expediente,
    versiones: (c.expediente.versiones ?? []).map((v) => ({ ...v, posiciones: [] })),
  };
  const P = { lat: 19.2795, lon: -99.6417 };
  const p = proponerEscena({
    expediente: e0,
    impactos: impactosAColocar(e0),
    calles: [],
    narracion: c.narracion,
    lugar: P,
    nombreDe: (id) => id,
  })!;

  it("coloca a los tres, sin encimarse en ningún choque", () => {
    for (const v of ["V1", "V2", "V3"]) expect(poseDe(p.expediente, v, "impacto")).toBeTruthy();
    expect(impactosEncimados(p.expediente)).toEqual([]);
    expect(p.propuestos.some((x) => x.clave === "choque-2")).toBe(true);
    expect(p.faltan.some((x) => x.clave === "choque-2")).toBe(false);
  });

  it("la Rio queda delante del Aveo, en su mismo rumbo (el Aveo la golpeó con su frente)", () => {
    const b = poseDe(p.expediente, "V2", "impacto")!;
    const cc = poseDe(p.expediente, "V3", "impacto")!;
    const dif = Math.abs(((b.rumbo - cc.rumbo + 540) % 360) - 180);
    expect(dif).toBeLessThan(1);
  });
});
