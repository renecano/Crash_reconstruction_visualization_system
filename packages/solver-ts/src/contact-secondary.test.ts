/**
 * Integración conjunta y contacto secundario después del impacto (ADR 0063); espejo de
 * `solver/tests/test_contact_secondary.py`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_NAMES, loadFixture, type FixtureName } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { Body2D, state, type State2D } from "./models";
import {
  boxCorners,
  boxPenetration,
  AXIS_HYSTERESIS,
  SEPARATION_S,
  deformedExtents,
  fourWheels,
  integrate,
  integrateJoint,
  type JointBody,
  JointState,
  resolveSecondaryContact,
} from "./postimpact";
import { reconstruct, type VehicleOutcome } from "./reconstruct";

const CAR = Body2D.fromDimensions(1300.0, 4.5, 1.8);
const VAN = Body2D.fromDimensions(2600.0, 5.0, 2.0);
const LOCKED = fourWheels(2.6, 1.55, 1.15, true);
const ROLLING = fourWheels(2.6, 1.55, 1.15, false);

const full = (b: Body2D) => deformedExtents(b.length, b.width, 0.0, "F");
const body = (b: Body2D, start: State2D, extra: Partial<JointBody> = {}): JointBody => ({
  body: b,
  start,
  wheels: LOCKED,
  mu: 0.7,
  ...extra,
});

describe("cajas y contornos deformados", () => {
  it("penetración de dos cajas alineadas, con la normal de a hacia b", () => {
    const a = boxCorners(0.0, 0.0, 0.0, full(CAR));
    const b = boxCorners(4.2, 0.0, 0.0, full(CAR));
    const [depth, n] = boxPenetration(a, b);
    expect(depth).toBeCloseTo(0.3, 12);
    expect(n[0]).toBeCloseTo(1.0, 12);
    expect(n[1]).toBeCloseTo(0.0, 12);
    const [depthBa, nBa] = boxPenetration(b, a);
    expect(depthBa).toBeCloseTo(0.3, 12);
    expect(nBa[0]).toBeCloseTo(-1.0, 12);
    expect(boxPenetration(a, boxCorners(4.6, 0.0, 0.0, full(CAR)))).toEqual([0.0, [0.0, 0.0]]);
  });

  it.each([
    ["F", [2.25 - 0.3, 2.25, 0.9, 0.9]],
    ["B", [2.25, 2.25 - 0.3, 0.9, 0.9]],
    ["L", [2.25, 2.25, 0.9 - 0.3, 0.9]],
    ["R", [2.25, 2.25, 0.9, 0.9 - 0.3]],
  ] as const)("la cara %s se hunde su aplastamiento", (face, expected) => {
    deformedExtents(4.5, 1.8, 0.3, face).forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 12));
    expect(deformedExtents(4.5, 1.8, 5.0, face)[0]).toBeGreaterThanOrEqual(0);
  });
});

describe("contacto secundario", () => {
  it("plástico: conserva el momento, iguala la velocidad normal y separa el exceso", () => {
    const a = JointState.fromBody(body(CAR, state({ x: 0.0, vx: 8.0 })));
    const b = JointState.fromBody(body(VAN, state({ x: 4.5, vx: 2.0 })));
    const p0 = CAR.mass * a.vx + VAN.mass * b.vx;
    const cm0 = (CAR.mass * a.x + VAN.mass * b.x) / (CAR.mass + VAN.mass);
    const [left, axis] = resolveSecondaryContact(a, b, 0.1);
    expect(left).toBeCloseTo(0.1, 15);
    expect(axis).not.toBeNull();
    expect(CAR.mass * a.vx + VAN.mass * b.vx).toBeCloseTo(p0, 9);
    expect(a.vx).toBeCloseTo(b.vx, 12);
    expect((CAR.mass * a.x + VAN.mass * b.x) / (CAR.mass + VAN.mass)).toBeCloseTo(cm0, 12);
    const [depth] = boxPenetration(
      boxCorners(a.x, a.y, a.yaw, a.extents),
      boxCorners(b.x, b.y, b.yaw, b.extents),
    );
    expect(depth).toBeCloseTo(0.1, 12);
    expect(a.u).toBeCloseTo(a.vx, 12);
    expect(b.u).toBeCloseTo(b.vx, 12);
  });

  it("sin impulso si ya se separan; solo se deshace el encaje", () => {
    const a = JointState.fromBody(body(CAR, state({ x: 0.0, vx: 2.0 })));
    const b = JointState.fromBody(body(CAR, state({ x: 4.2, vx: 6.0 })));
    resolveSecondaryContact(a, b, 0.0);
    expect([a.vx, b.vx]).toEqual([2.0, 6.0]);
    expect(b.x - a.x).toBeCloseTo(4.5, 12);
  });

  it("sin encaje no hace nada", () => {
    const a = JointState.fromBody(body(CAR, state({ x: 0.0, vx: 8.0 })));
    const b = JointState.fromBody(body(CAR, state({ x: 4.4, vx: 2.0 })));
    const [left, axis] = resolveSecondaryContact(a, b, 0.2);
    expect(left).toBeCloseTo(0.1, 12);
    expect(axis).toBeNull();
    expect([a.x, a.vx, b.x, b.vx]).toEqual([0.0, 8.0, 4.4, 2.0]);
    expect(a.moved).toBe(false);
    expect(b.moved).toBe(false);
  });

  it("un detenido que el empujón no saca del reposo se queda y detiene al otro", () => {
    const a = JointState.fromBody(body(CAR, state({ x: 0.0, vx: 0.06 })));
    const b = JointState.fromBody(body(VAN, state({ x: 4.6 })));
    expect(b.active).toBe(false);
    resolveSecondaryContact(a, b, 0.0);
    expect([b.vx, b.x, b.active, b.moved]).toEqual([0.0, 4.6, false, false]);
    expect(a.vx).toBeCloseTo(0.0, 15);
    expect(b.x - a.x).toBeCloseTo(4.75, 12);
  });

  it("la normal del contacto se conserva con histéresis", () => {
    const h = AXIS_HYSTERESIS;
    const a = JointState.fromBody(body(CAR, state()));
    const b = JointState.fromBody(body(CAR, state({ x: 4.2, y: 1.5 - 0.5 * h })));
    const [, first] = resolveSecondaryContact(a, b, 0.25);
    expect(first).not.toBeNull();
    a.x = a.y = 0.0;
    b.x = 4.2 - 0.5 * h;
    b.y = 1.5;
    expect(resolveSecondaryContact(a, b, 0.25, first)[1]).toBe(first);
    a.x = a.y = 0.0;
    b.x = 4.2 - 0.5 * h;
    b.y = 1.5 + h;
    const [, axis] = resolveSecondaryContact(a, b, 0.25, first);
    expect(axis).not.toBeNull();
    expect(axis).not.toBe(first);
  });
});

describe("integración conjunta", () => {
  it("lejos, es idéntica a integrar cada uno", () => {
    const s1 = state({ yaw: 0.3, vx: 12.0, vy: 4.0, yawRate: 1.5 });
    const s2 = state({ y: 200.0, yaw: -1.0, vx: 6.0, vy: -1.0, yawRate: -0.4 });
    const joint = integrateJoint(
      [body(CAR, s1), body(VAN, s2, { wheels: ROLLING, rollingDrag: 0.2 })],
      { dtOut: 0.02 },
    );
    const solo = [
      integrate(CAR, s1, LOCKED, 0.7),
      integrate(VAN, s2, ROLLING, 0.7, { rollingDrag: 0.2 }),
    ];
    joint.forEach((j, i) => {
      const s = solo[i]!;
      expect(j.trajectory.t).toEqual(s.trajectory.t);
      expect(j.trajectory.x).toEqual(s.trajectory.x);
      expect(j.trajectory.y).toEqual(s.trajectory.y);
      expect(j.trajectory.yaw).toEqual(s.trajectory.yaw);
      expect(j.trajectory.vx).toEqual(s.trajectory.vx);
      expect([j.stopped, j.distance, j.duration]).toEqual([s.stopped, s.distance, s.duration]);
      expect(j.energyDissipated).toBe(s.energyDissipated);
    });
  });

  it("empuja al que está detenido sin atravesarlo", () => {
    const aSpec = body(CAR, state({ vx: 10.0 }), { wheels: ROLLING, rollingDrag: 0.05 });
    const [ra, rb] = integrateJoint([aSpec, body(VAN, state({ x: 5.75 }))]);
    expect(ra!.stopped && rb!.stopped).toBe(true);
    expect(rb!.distance).toBeGreaterThan(1.0);
    expect(rb!.trajectory.x[rb!.trajectory.length - 1]!).toBeGreaterThan(ra!.distance);
    const n = Math.min(ra!.trajectory.length, rb!.trajectory.length);
    for (let k = 0; k < n; k++) {
      const [depth] = boxPenetration(
        boxCorners(ra!.trajectory.x[k]!, ra!.trajectory.y[k]!, ra!.trajectory.yaw[k]!, full(CAR)),
        boxCorners(rb!.trajectory.x[k]!, rb!.trajectory.y[k]!, rb!.trajectory.yaw[k]!, full(VAN)),
      );
      expect(depth).toBeLessThan(1e-9);
    }
  });

  it("un ulp en la entrada no cambia el resultado (bien condicionado)", () => {
    const bSpec = body(VAN, state({ x: 5.0, yaw: 0.4, vx: 1.0 }), { crush: 0.1 });
    const aState = (y: number) => state({ y, vx: 12.0, vy: 0.5 });
    const extra = { wheels: ROLLING, rollingDrag: 0.1 };
    const base = integrateJoint([body(CAR, aState(0.3), extra), bSpec]);
    const nudged = 0.3 + Number.EPSILON * 0.25; // el siguiente doble después de 0.3
    expect(nudged).not.toBe(0.3);
    const pert = integrateJoint([body(CAR, aState(nudged), extra), bSpec]);
    base.forEach((r0, i) => {
      const r1 = pert[i]!;
      expect(r1.trajectory.length).toBe(r0.trajectory.length);
      r0.trajectory.x.forEach((x, k) =>
        expect(Math.abs(x - r1.trajectory.x[k]!)).toBeLessThan(1e-9),
      );
      r0.trajectory.y.forEach((y, k) =>
        expect(Math.abs(y - r1.trajectory.y[k]!)).toBeLessThan(1e-9),
      );
    });
  });

  it("el encaje inicial se deshace en SEPARATION_S", () => {
    // Encajados 0.2 m: se separan parejo en dos cuadros de 0.02 s y desde ahí solo se tocan.
    const [ra, rb] = integrateJoint([body(CAR, state()), body(CAR, state({ x: 4.3 }))]);
    const ta = ra!.trajectory;
    const gaps = ta.x.map((x, k) => rb!.trajectory.x[k]! - x);
    expect(gaps[gaps.length - 1]!).toBeCloseTo(4.5, 9);
    const perFrame = (0.2 * 0.02) / SEPARATION_S + 1e-9;
    for (let i = 1; i < gaps.length; i++)
      expect(gaps[i]! - gaps[i - 1]!).toBeLessThanOrEqual(perFrame);
    const k = ta.t.findIndex((t) => t >= SEPARATION_S - 1e-9);
    for (const g of gaps.slice(k)) expect(g).toBeGreaterThanOrEqual(4.5 - 1e-9);
    expect(ra!.duration).toBeLessThanOrEqual(SEPARATION_S + 0.02);
  });
});

const VV = FIXTURE_NAMES.filter((n) =>
  (loadFixture(n).eventos as { tipo?: string }[]).some(
    (e) => e.tipo === "impacto_vehiculo_vehiculo",
  ),
);

function excess(a: VehicleOutcome, b: VehicleOutcome, k: number): number {
  const ta = a.trajectory;
  const tb = b.trajectory;
  const [depth] = boxPenetration(
    boxCorners(ta.x[k]!, ta.y[k]!, ta.yaw[k]!, deformedExtents(a.length, a.width, 0.0, "F")),
    boxCorners(tb.x[k]!, tb.y[k]!, tb.yaw[k]!, deformedExtents(b.length, b.width, 0.0, "F")),
  );
  return depth - Math.max(0.0, ...a.crushProfileM) - Math.max(0.0, ...b.crushProfileM);
}

function depth(a: VehicleOutcome, b: VehicleOutcome, ka: number, kb: number): number {
  const ta = a.trajectory;
  const tb = b.trajectory;
  return boxPenetration(
    boxCorners(ta.x[ka]!, ta.y[ka]!, ta.yaw[ka]!, deformedExtents(a.length, a.width, 0.0, "F")),
    boxCorners(tb.x[kb]!, tb.y[kb]!, tb.yaw[kb]!, deformedExtents(b.length, b.width, 0.0, "F")),
  )[0];
}

const AXA = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../demo/escenas-r11/axa.json"),
    "utf8",
  ),
) as Record<string, unknown>;
const escena = (name: FixtureName | "axa") =>
  name === "axa" ? structuredClone(AXA) : loadFixture(name);

describe("escenas canónicas: los vehículos no se atraviesan", () => {
  // Comentario de René (2026-10-24, ADR 0089): ningún contorno (la caja sin deformar, que contiene
  // lo que dibuja el 3D) traslapa a otro desde SEPARATION_S después de cada impacto entre los dos.
  it.each([...VV, "axa" as const].map((n) => [n]))(
    "%s: desde SEPARATION_S ningún contorno traslapa a otro, ni en el reposo",
    (name) => {
      const r = reconstruct(escena(name));
      const vs = r.vehiculos;
      for (let i = 0; i < vs.length; i++) {
        for (let j = i + 1; j < vs.length; j++) {
          const a = vs[i]!;
          const b = vs[j]!;
          const impactos = [
            0,
            ...r.eventos
              .filter(
                (e) =>
                  e.tipo === "impacto_vehiculo_vehiculo" &&
                  e.actores.includes(a.id) &&
                  e.actores.includes(b.id),
              )
              .map((e) => e.t),
          ];
          const ta = a.trajectory;
          const tb = b.trajectory;
          const indexB = new Map(tb.t.map((t, k) => [Math.round(t * 1e6), k]));
          ta.t.forEach((t, ka) => {
            if (t < SEPARATION_S - 1e-9) return;
            if (impactos.some((lo) => lo <= t && t < lo + SEPARATION_S - 1e-9)) return;
            const kb =
              indexB.get(Math.round(t * 1e6)) ?? (t > tb.t[tb.length - 1]! ? tb.length - 1 : null);
            if (kb === null) return;
            expect(depth(a, b, ka, kb), `${name} ${a.id}-${b.id} t=${t}`).toBeLessThanOrEqual(1e-9);
          });
          expect(depth(a, b, ta.length - 1, tb.length - 1), `${name} reposo`).toBeLessThanOrEqual(
            1e-9,
          );
        }
      }
    },
    30_000,
  );

  it("en el impacto solo la moto pasa de su aplastamiento: la esquina de su caja", () => {
    for (const name of VV) {
      const r = reconstruct(loadFixture(name));
      const [a, b] = r.vehiculos as [VehicleOutcome, VehicleOutcome];
      const k = a.trajectory.t.indexOf(0.0);
      const ex = excess(a, b, k);
      if (name !== "motociclista") {
        expect(ex, name).toBeLessThanOrEqual(0.01);
        continue;
      }
      const moto = r.vehiculos.find((v) => v.clase === "motocicleta")!;
      const auto = r.vehiculos.find((v) => v.clase !== "motocicleta")!;
      const theta = moto.trajectory.yaw[k]! - (auto.trajectory.yaw[k]! + Math.PI / 2);
      const corner = (moto.width / 2) * Math.abs(Math.sin(theta));
      expect(ex + Math.max(...a.crushProfileM) + Math.max(...b.crushProfileM)).toBeCloseTo(
        corner,
        2,
      );
      expect(ex).toBeGreaterThan(0.01);
    }
  }, 30_000);
});
