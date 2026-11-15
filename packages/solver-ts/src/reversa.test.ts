/**
 * Reversa (R4b, ADR 0069); espejo de `solver/tests/test_reversa.py`. El vehículo avanza con la
 * parte posterior por delante y el rumbo del frente es el que dejó el perito.
 */
import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { wrapAngle } from "./models";
import { ReversePath, StraightPath, travelHeading } from "./preimpact";
import { reconstruct, reconstructionToDict } from "./reconstruct";
import { roadAxis } from "./road";

describe("reversa", () => {
  it("la trayectoria en reversa conserva el rumbo del frente", () => {
    const p = new ReversePath(new StraightPath([0, 0], Math.PI, 50));
    const pose = p.pose(10);
    expect(pose.x).toBeCloseTo(-10, 12);
    expect(wrapAngle(pose.heading)).toBeCloseTo(0, 12);
    expect(travelHeading(p, pose.heading)).toBeCloseTo(Math.PI, 12);
    expect(travelHeading(new StraightPath([0, 0], 0.3, 1), 0.3)).toBe(0.3);
  });

  it("en la escena canónica, el que retrocede choca con su parte posterior", () => {
    const r = reconstruct(loadFixture("reversa"));
    const vs = new Map(r.vehiculos.map((v) => [v.id, v]));
    const a = vs.get("veh-a")!;
    const tr = a.trajectory;
    const antes = tr.t.map((t, i) => i).filter((i) => tr.t[i]! < -0.05);
    expect(antes.length).toBeGreaterThan(0);
    for (const i of antes) {
      // Mira al oriente y se mueve al poniente.
      expect(Math.abs(wrapAngle(tr.yaw[i]!))).toBeLessThan(1e-9);
      expect(tr.vx[i]!).toBeLessThan(0);
    }
    expect(a.cdc?.lado).toBe("B");
    expect(vs.get("veh-b")!.cdc?.lado).toBe("F");
    // El golpe empuja a B hacia atrás (al poniente de donde estaba detenida, en x = −3).
    expect(vs.get("veh-b")!.restPose[0]).toBeLessThan(-3);
  });

  // --- T3.3: el sentido de marcha va aparte de la maniobra ---------------------------------------

  type Json = Record<string, unknown>;
  /** La escena canónica, con la reversa dicha con `sentido_marcha` y la maniobra que se pida. */
  function conSentido(maniobra: string): Json {
    const spec = structuredClone(loadFixture("reversa")) as unknown as { vehiculos: Json[] };
    const a = spec.vehiculos.find((v) => v.id === "veh-a")!;
    a.maniobra = { valor: maniobra, fuente: "supuesto", confianza: 0.6 };
    a.sentido_marcha = { valor: "reversa", fuente: "usuario", confianza: 0.8 };
    return spec;
  }
  /** [x, y, rumbo, vx, vy] de las muestras de A anteriores al impacto. */
  function antes(spec: Json): number[][] {
    const tr = reconstruct(spec).vehiculos.find((v) => v.id === "veh-a")!.trajectory;
    return tr.t
      .map((_, i) => i)
      .filter((i) => tr.t[i]! < -0.05)
      .map((i) => [tr.x[i]!, tr.y[i]!, tr.yaw[i]!, tr.vx[i]!, tr.vy[i]!]);
  }

  it("sentido «reversa» con maniobra recta es la reversa recta", () => {
    expect(antes(conSentido("recto"))).toEqual(antes(loadFixture("reversa") as unknown as Json));
  });

  it("el resultado dice quién iba en reversa", () => {
    const vs = reconstructionToDict(reconstruct(conSentido("recto"))).vehiculos as Json[];
    expect(vs.find((v) => v.id === "veh-a")!.sentido_marcha).toBe("reversa");
    expect("sentido_marcha" in vs.find((v) => v.id === "veh-b")!).toBe(false);
    const alcance = reconstructionToDict(reconstruct(loadFixture("alcance"))).vehiculos as Json[];
    expect(alcance.every((v) => !("sentido_marcha" in v))).toBe(true);
  });

  it("la vuelta y el cambio de carril en reversa van hacia el lado del conductor", () => {
    // A mira al oriente y retrocede: su izquierda es el norte (+y).
    for (const [maniobra, lado, minimo] of [
      ["vuelta_izquierda", 1, 0.5],
      ["vuelta_derecha", -1, 0.5],
      ["cambio_carril_izquierda", 1, 0.2],
      ["cambio_carril_derecha", -1, 0.2],
    ] as const) {
      const m = antes(conSentido(maniobra));
      expect(m.length).toBeGreaterThan(0);
      const [x0, y0, yaw0] = m[0]!;
      const [x1, y1, yaw1] = m.at(-1)!;
      expect(x1!).toBeLessThan(x0! - 1);
      expect(lado * (y1! - y0!)).toBeGreaterThan(minimo);
      // Al retroceder con el volante a la izquierda, el frente gira en sentido horario.
      if (maniobra.startsWith("vuelta")) {
        expect(lado * wrapAngle(yaw1! - yaw0!)).toBeLessThan(-0.1);
      }
      // Siempre con la parte posterior por delante: la velocidad es contraria al frente.
      for (const [, , yaw, vx, vy] of m)
        expect(vx! * Math.cos(yaw!) + vy! * Math.sin(yaw!)).toBeLessThan(0);
    }
  });

  it("en una curva, la reversa sigue el carril", () => {
    const spec = structuredClone(loadFixture("frontal_curva")) as unknown as {
      lugar: Json;
      vehiculos: Json[];
    };
    const axis = roadAxis(spec.lugar);
    expect(axis.kind).toBe("arco");
    const a = spec.vehiculos.find((v) => v.id === "veh-a")!;
    const pose = a.posicion_inicial as { x: number; y: number; rumbo_deg: number };
    const [cx, cy] = axis.center;
    const radio = Math.hypot(pose.x - cx, pose.y - cy);
    // El mismo recorrido, pero con el frente al revés y en reversa.
    pose.rumbo_deg = (wrapAngle((pose.rumbo_deg * Math.PI) / 180 + Math.PI) * 180) / Math.PI;
    a.sentido_marcha = { valor: "reversa", fuente: "usuario", confianza: 0.8 };
    const m = antes(spec);
    expect(m.length).toBeGreaterThan(20);
    for (const [, , yaw, vx, vy] of m)
      expect(vx! * Math.cos(yaw!) + vy! * Math.sin(yaw!)).toBeLessThan(0);
    // Desde su posición inicial va sobre el arco del carril.
    for (const [x, y] of m.slice(-20))
      expect(Math.abs(Math.hypot(x! - cx, y! - cy) - radio)).toBeLessThan(0.02);
  });
});
