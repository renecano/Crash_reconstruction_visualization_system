/**
 * Terreno (C3, W5): espejo de `solver/tests/test_terreno.py`. La paridad de la escena de referencia
 * (`terraceria_topes`) contra Python va en `parity.test.ts`, con las demás canónicas.
 */
import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { zoneFriction, zoneRanges } from "./friction";
import { Body2D, G, state } from "./models";
import { monteCarlo, ranges } from "./montecarlo";
import { fourWheels, integrate } from "./postimpact";
import { SpeedProfile, StraightPath, brakingDeceleration, skidDistance } from "./preimpact";
import { reconstruct, reconstructionToDict } from "./reconstruct";
import {
  BUMP_CONTACT,
  BUMP_ENERGY,
  BUMP_SAMPLED,
  Bump,
  bumpSampler,
  bumpSeed,
  ReliefMesh,
  Terrain,
  brakeProfile,
  poseOn,
  sampleBumpAssumptions,
  terrainFromSpec,
  withRelief,
} from "./terrain";

type Json = Record<string, unknown>;
const MU = 0.6;
const V0 = 20.0;
const WHEELBASE = 2.6;
const CG = 1.2;
const BODY = Body2D.fromDimensions(1400.0, 4.4, 1.8);
const WHEELS = fourWheels(WHEELBASE, 1.5, CG, true);
const PATH = new StraightPath([0.0, 0.0], 0.0, 400.0);

/** Una malla de 10 m que sube `pendiente` (m/m) hacia +X y `haciaY` hacia +Y. */
function planoInclinado(pendiente: number, haciaY = 0.0): Terrain {
  const nx = 60;
  const ny = 12;
  const paso = 10.0;
  const x0 = -100.0;
  const y0 = -60.0;
  const alturas: number[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      alturas.push(pendiente * (x0 + i * paso) + haciaY * (y0 + j * paso));
  return new Terrain([], [], [], new ReliefMesh(x0, y0, paso, nx, ny, alturas));
}

const zona = (mu: number, x0 = -500, x1 = 500): Json => ({
  superficies: [
    {
      id: "zona",
      tipo: "terraceria",
      poligono: [
        { x: x0, y: -50 },
        { x: x1, y: -50 },
        { x: x1, y: 50 },
        { x: x0, y: 50 },
      ],
      friccion: { valor: mu, fuente: "usuario", confianza: 0.9 },
      procedencia: { fuente: "usuario", confianza: 0.9 },
    },
  ],
});

function frenado(terrain: Terrain, mu = MU): number {
  const prof = brakeProfile(PATH, V0, 0.0, 1.0, terrain, mu, 1.0, 0.0, CG, WHEELBASE);
  expect(prof.stops).toBe(true);
  return prof.ss[prof.ss.length - 1]!;
}

describe("gravedad: el frenado en pendiente constante coincide con la fórmula", () => {
  it.each([0.08, -0.08, 0.02, -0.15])("frenado previo, pendiente %f", (pendiente) => {
    const formula = skidDistance(V0, brakingDeceleration(MU, 1.0, 100.0 * pendiente));
    expect(frenado(planoInclinado(pendiente)) / formula).toBeCloseTo(1, 9);
  });

  it.each([0.08, -0.08])("deslizamiento posterior, pendiente %f", (pendiente) => {
    const formula = skidDistance(V0, brakingDeceleration(MU, 1.0, 100.0 * pendiente));
    const r = integrate(BODY, state({ vx: V0 }), WHEELS, MU, {
      terrain: planoInclinado(pendiente),
      dt: 0.001,
    });
    expect(r.stopped).toBe(true);
    const plano = integrate(BODY, state({ vx: V0 }), WHEELS, MU, { dt: 0.001 });
    const margen = Math.abs(plano.distance - skidDistance(V0, MU * G)) / plano.distance + 2e-3;
    expect(Math.abs(r.distance - formula) / formula).toBeLessThan(margen);
  });
});

describe("fricción por zona", () => {
  it("la distancia va con el inverso de la fricción de la zona, no con la del lugar", () => {
    const a = terrainFromSpec({ terreno: zona(0.4) })!;
    const b = terrainFromSpec({ terreno: zona(0.7) })!;
    expect(frenado(a, 0.9) / skidDistance(V0, 0.4 * G)).toBeCloseTo(1, 9);
    expect(frenado(a, 0.9) / frenado(b, 0.9) / (0.7 / 0.4)).toBeCloseTo(1, 9);
    const postA = integrate(BODY, state({ vx: V0 }), WHEELS, 0.9, { terrain: a }).distance;
    const postB = integrate(BODY, state({ vx: V0 }), WHEELS, 0.9, { terrain: b }).distance;
    expect(Math.abs(postA / postB - 0.7 / 0.4)).toBeLessThan(0.01);
  });

  it("fuera de la zona vale la del lugar", () => {
    const t = terrainFromSpec({ terreno: zona(0.4, 10, 20) })!;
    expect(t.mu(15, 0, 0.7)).toBe(0.4);
    expect(t.mu(25, 0, 0.7)).toBe(0.7);
    expect(frenado(t, 0.7)).toBeGreaterThan(skidDistance(V0, 0.7 * G));
  });

  it("cada tipo de zona tiene su fila de la tabla, y el pasto es el medido", () => {
    expect(zoneFriction("pasto", "seco")).toMatchObject({ low: 0.21, high: 0.38, nominal: 0.36 });
    expect(zoneFriction("pasto", "encharcado")).toMatchObject({ low: 0.17, high: 0.24 });
    expect(zoneFriction("grava", "seco").nominal).toBe(zoneFriction("grava", "mojado").nominal);
    expect(zoneFriction("asfalto", "mojado").nominal).toBe(0.5);
  });

  it("el Monte Carlo muestrea la fricción de cada zona en su rango", () => {
    const spec = loadFixture("terraceria_topes") as unknown as Json;
    const lugar = spec.lugar as Json;
    const declarada = (((lugar.terreno as Json).superficies as Json[])[0]!.friccion as Json)
      .rango as number[];
    expect(zoneRanges(lugar).map((z) => [z[1], z[2]])).toEqual([declarada]);
    const campo = ranges(spec).find((c) => c.ruta === "lugar.terreno.superficies.0.friccion")!;
    expect([campo.minimo, campo.maximo]).toEqual(declarada);
  });
});

describe("topes", () => {
  it("el reductor circular de la norma tiene radio de 2.5 m", () => {
    const b = Bump.make("t", [0, -3], [0, 3], 0.1, 1.4);
    expect(b.radius).toBeCloseTo(2.5, 12);
    expect(b.heightAt(0, 0)).toBeCloseTo(0.1, 12);
    expect(b.heightAt(0.7, 0)).toBeCloseTo(0, 12);
    expect(b.heightAt(0, 3.5)).toBe(0);
    expect(b.contact(Math.sqrt(G * 2.5))).toBeCloseTo(0, 12);
    expect(b.contact(0)).toBe(1);
  });

  it("cruzar un tope rodando libre quita la energía declarada", () => {
    const tope = Bump.make("t", [10, -5], [10, 5], 0.1, 1.4);
    const libres = fourWheels(WHEELBASE, 1.5, CG, false);
    const v0 = 3.0;
    const r = integrate(BODY, state({ vx: v0 }), libres, MU, {
      terrain: new Terrain([], [], [tope], null),
      rollingDrag: 0.0,
      tMax: 6.0,
    });
    const v1 = r.trajectory.vx[r.trajectory.vx.length - 1]!;
    const esperado = 2.0 * BUMP_ENERGY[0] * G * 0.1;
    expect(Math.abs(v0 * v0 - v1 * v1 - esperado) / esperado).toBeLessThan(0.02);
  });

  it("frenar sobre un tope a velocidad alarga el frenado lo que dicen los supuestos", () => {
    const tope = Bump.make("t", [5, -5], [5, 5], 0.1, 1.4);
    const con = frenado(new Terrain([], [], [tope], null));
    const sin = skidDistance(V0, MU * G);
    const vCruce = Math.sqrt(V0 * V0 - 2.0 * MU * G * 5.0);
    const esperado = BUMP_CONTACT[0] * (1.4 + vCruce * tope.flightS) - (BUMP_ENERGY[0] * 0.1) / MU;
    expect(Math.abs(con - sin - esperado) / esperado).toBeLessThan(0.1);
  });

  it("la escena de referencia registra los cruces con su velocidad y lleva la pose", () => {
    const r = reconstructionToDict(reconstruct(loadFixture("terraceria_topes")));
    const cruces = (r.eventos as Json[]).filter((e) => e.tipo === "cruce_tope");
    expect(cruces.map((e) => e.id).sort()).toEqual([
      "tope-tope-antes-veh-a",
      "tope-tope-despues-veh-b",
    ]);
    const a = (r.vehiculos as Json[]).find((v) => v.id === "veh-a")!;
    const antes = cruces.find((e) => e.id === "tope-tope-antes-veh-a")!;
    expect(Number((antes.detalle as Json).velocidad_cruce_kmh)).toBeGreaterThan(
      Number(a.v_impacto_kmh),
    );
    const tr = a.trayectoria as Record<string, number[]>;
    expect(tr.z!.length).toBe(tr.t!.length);
    expect(Math.max(...tr.z!)).toBeGreaterThan(0.03);
    expect(Object.keys(r.parametros as Json)).toEqual(
      expect.arrayContaining(["perdida_energia_tope", "perdida_contacto_tope"]),
    );
  });
});

describe("pose en el terreno", () => {
  it("sale del plano de las llantas, con sus signos", () => {
    const ruedas = WHEELS.positions;
    const sube = planoInclinado(0.1);
    const [z, cabeceo, alabeo] = poseOn(sube, ruedas, 5.0, 0.0, 0.0);
    expect(z).toBeCloseTo(0.5, 9);
    expect(cabeceo).toBeCloseTo(Math.atan(0.1), 9);
    expect(alabeo).toBeCloseTo(0, 12);
    expect(poseOn(sube, ruedas, 5.0, 0.0, Math.PI)[1]).toBeCloseTo(-Math.atan(0.1), 9);
    expect(poseOn(planoInclinado(0.0, 0.1), ruedas, 0, 0, 0)[2]).toBeCloseTo(Math.atan(0.1), 9);
  });
});

describe("un terreno plano da exactamente el resultado de hoy", () => {
  const malla: Json = {
    id: "plana",
    origen: { lat: 19.0, lon: -99.0, x: -150.0, y: -150.0 },
    resolucion_m: 30.0,
    ancho: 11,
    alto: 11,
    alturas_m: new Array<number>(121).fill(0.0),
    fuente: "prueba",
    licencia: "prueba",
    resolucion_nativa_m: 30.0,
  };
  const conRelieve = (spec: Json, id: string): Json => ({
    ...spec,
    lugar: {
      ...(spec.lugar as Json),
      terreno: {
        relieve: {
          fuente: "dem",
          malla_id: id,
          procedencia: { fuente: "default", confianza: 0.5 },
        },
      },
    },
  });

  it.each(["alcance", "lateral_interseccion", "carambola", "poste"] as const)("%s", (escena) => {
    const spec = loadFixture(escena) as unknown as Json;
    const hoy = JSON.stringify(reconstructionToDict(reconstruct(spec)));
    const vacio: Json = {
      ...spec,
      lugar: { ...(spec.lugar as Json), terreno: { superficies: [], ondulaciones: [], topes: [] } },
    };
    expect(JSON.stringify(reconstructionToDict(reconstruct(vacio)))).toBe(hoy);
    const citada = conRelieve(spec, "plana");
    expect(JSON.stringify(reconstructionToDict(reconstruct(citada, { relieve: malla })))).toBe(hoy);
    // Adjunta en memoria, como llega a la inversión y al Monte Carlo.
    expect(JSON.stringify(reconstructionToDict(reconstruct(withRelief(citada, malla))))).toBe(hoy);
  });

  it("sin la malla que cita la escena se avisa y se reconstruye en plano", () => {
    const spec = loadFixture("alcance") as unknown as Json;
    const r = reconstruct(conRelieve(spec, "falta"));
    expect(r.avisos.some((a) => a.codigo === "relieve_sin_malla")).toBe(true);
    expect(r.vehiculos.map((v) => v.vImpactKmh)).toEqual(
      reconstruct(spec).vehiculos.map((v) => v.vImpactKmh),
    );
  });

  it("el perfil sobre terreno sin efectos es el analítico", () => {
    const t = terrainFromSpec({ terreno: zona(MU) })!;
    const decel = MU * G;
    const prof = brakeProfile(PATH, V0, 30.0, decel, t, MU, 1.0, 0.0, CG, WHEELBASE);
    const plano = new SpeedProfile(V0, 30.0 / V0, decel);
    for (const tiempo of [0.5, 1.5, 2.0, 3.0, 4.2, 6.0]) {
      expect(prof.speed(tiempo)).toBeCloseTo(plano.speed(tiempo), 8);
      expect(prof.distance(tiempo)).toBeCloseTo(plano.distance(tiempo), 8);
    }
    for (const s of [10.0, 30.0, 45.0, 60.0])
      expect(prof.timeToDistance(s)!).toBeCloseTo(plano.timeToDistance(s)!, 8);
    expect(prof.timeToDistance(200.0)).toBeNull();
    expect(prof.stopTime).toBeCloseTo(plano.stopTime, 8);
  });
});

describe("los supuestos del tope en el Monte Carlo (W5, ADR 0131)", () => {
  it("van en un generador aparte, con la semilla del caso, igual que en Python", () => {
    expect(bumpSeed(101)).toBe(121_261_413);
    expect(bumpSeed(0)).toBe(20_261_110);
    const spec = loadFixture("terraceria_topes") as unknown as Json;
    const lhs = bumpSampler(spec, 64, 101)!;
    const energias: number[] = [];
    const contactos: number[] = [];
    for (let i = 0; i < 64; i++) {
      const s = structuredClone(spec);
      sampleBumpAssumptions(s, lhs.sample(i));
      const sorteo = ((s.lugar as Json).terreno as Json)[BUMP_SAMPLED] as Record<string, number>;
      energias.push(sorteo.energia!);
      contactos.push(sorteo.contacto!);
      const t = terrainFromSpec(s.lugar as Json)!;
      expect([t.bumpEnergy, t.bumpContact]).toEqual([sorteo.energia, sorteo.contacto]);
    }
    expect(Math.min(...energias)).toBeLessThan(0.52);
    expect(Math.max(...energias)).toBeGreaterThan(1.48);
    expect(Math.min(...contactos)).toBeLessThan(0.02);
    expect(Math.max(...contactos)).toBeGreaterThan(0.98);
    const nominal = terrainFromSpec(spec.lugar as Json)!;
    expect([nominal.bumpEnergy, nominal.bumpContact]).toEqual([BUMP_ENERGY[0], BUMP_CONTACT[0]]);
  });

  it("una escena sin topes no lo usa, y el Monte Carlo de la escena con topes reporta sus supuestos", () => {
    for (const n of ["alcance", "carambola"] as const)
      expect(bumpSampler(loadFixture(n) as unknown as Json, 64, 101)).toBeNull();
    const spec = loadFixture("terraceria_topes") as unknown as Json;
    const rutas = monteCarlo(spec, { samples: 8 }).campos.map((c) => c.ruta);
    expect(rutas.slice(-2)).toEqual([
      "parametros.perdida_energia_tope",
      "parametros.perdida_contacto_tope",
    ]);
    expect(rutas.slice(0, -2)).toEqual(ranges(spec).map((c) => c.ruta));
  });
});
