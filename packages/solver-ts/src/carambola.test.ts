/**
 * Impactos en secuencia (carambolas, ADR 0066); espejo de `solver/tests/test_carambola.py`.
 */
import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { Body2D, state } from "./models";
import {
  contactPoint,
  fourWheels,
  integrateJoint,
  integrateJointImpacts,
  type JointBody,
  type PlannedImpact,
} from "./postimpact";
import { reconstruct, RESTITUTION_VV } from "./reconstruct";

const CAR = Body2D.fromDimensions(1300.0, 4.5, 1.8);
const ROLLING = fourWheels(2.6, 1.55, 1.15, false);
const LOCKED = fourWheels(2.6, 1.55, 1.15, true);

/** B rueda a 6 m/s hacia C, detenido `gap` metros adelante. */
const cadena = (gap: number): JointBody[] => [
  { body: CAR, start: state({ x: 0.0, vx: 6.0 }), wheels: ROLLING, mu: 0.7, rollingDrag: 0.015 },
  { body: CAR, start: state({ x: 4.5 + gap }), wheels: LOCKED, mu: 0.7 },
];
const plan: PlannedImpact = {
  a: 0,
  b: 1,
  eventId: "ev-2",
  restitution: RESTITUTION_VV,
  friction: 0.4,
};

describe("impactos en secuencia", () => {
  it("el punto de contacto son las esquinas que entran", () => {
    const a = [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ] as const;
    const b = [
      [1.5, 0.5],
      [3, 0.5],
      [3, 2],
      [1.5, 2],
    ] as const;
    expect(contactPoint(a, b)).toEqual([1.75, 0.75]);
  });

  it("el impacto planeado ocurre al tocarse y conserva el momento", () => {
    const [[rb, rc], hits] = integrateJointImpacts(cadena(1.0), { impacts: [plan] });
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    expect(hit.eventId).toBe("ev-2");
    expect(hit.t).toBeGreaterThan(0.15);
    expect(hit.t).toBeLessThan(0.19);
    const before = CAR.mass * hit.aBefore.vx + CAR.mass * hit.bBefore.vx;
    const after = CAR.mass * hit.result.aAfter.vx + CAR.mass * hit.result.bAfter!.vx;
    expect(after).toBeCloseTo(before, 9);
    expect(hit.result.energyLoss).toBeGreaterThan(0);
    expect(rc!.distance).toBeGreaterThan(0.5);
    expect(rb!.stopped).toBe(true);
    expect(rc!.stopped).toBe(true);
  });

  it("sin impacto planeado, el contacto es el de siempre", () => {
    const plain = integrateJoint(cadena(1.0));
    const [[rb, rc], hits] = integrateJointImpacts(cadena(1.0));
    expect(hits).toEqual([]);
    expect(rb!.trajectory.x).toEqual(plain[0]!.trajectory.x);
    expect(rc!.trajectory.x).toEqual(plain[1]!.trajectory.x);
  });

  it("el impacto planeado que no se alcanza no ocurre", () => {
    const [, hits] = integrateJointImpacts(cadena(200.0), { impacts: [plan] });
    expect(hits).toEqual([]);
  });

  it("la carambola canónica tiene su segundo impacto, con el daño de cada uno", () => {
    const r = reconstruct(loadFixture("carambola"));
    const segundo = r.eventos.find((e) => e.id === "ev-impacto-2")!;
    expect(segundo.tipo).toBe("impacto_vehiculo_vehiculo");
    expect(segundo.actores).toEqual(["veh-b", "veh-c"]);
    expect(segundo.t).toBeGreaterThan(0);
    expect(r.banderas.some((b) => b.includes("no ocurre"))).toBe(false);
    const vs = new Map(r.vehiculos.map((v) => [v.id, v]));
    expect(vs.get("veh-c")!.involucrado).toBe(true);
    expect(vs.get("veh-c")!.cdc?.lado).toBe("B");
    expect(vs.get("veh-c")!.crushEnergyJ).toBeGreaterThan(0);
    expect(vs.get("veh-b")!.cdc?.lado).toBe("B");
    expect(vs.get("veh-b")!.laterDamage?.map((d) => d.eventId)).toEqual(["ev-impacto-2"]);
    expect(vs.get("veh-b")!.laterDamage?.[0]?.cdc?.lado).toBe("F");
  });

  it("si el segundo impacto no ocurre, lo dice", () => {
    const spec = structuredClone(loadFixture("carambola")) as unknown as {
      vehiculos: { id: string; posicion_inicial: { x: number } }[];
    };
    spec.vehiculos.find((v) => v.id === "veh-c")!.posicion_inicial.x = 300.0;
    const r = reconstruct(spec);
    expect(r.eventos.some((e) => e.id === "ev-impacto-2")).toBe(false);
    expect(r.avisos.some((a) => a.codigo === "impacto_no_ocurre")).toBe(true);
  });
});
