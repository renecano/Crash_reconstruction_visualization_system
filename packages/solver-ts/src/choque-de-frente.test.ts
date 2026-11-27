import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { reconstruct } from "./reconstruct";

/**
 * Choques de frente casi en la misma línea (René, 2026-11-25; aud-18 de la revisión de la cadena): el
 * contacto con un vehículo en movimiento todavía en su posición inicial ya no se elige si hay otro.
 * Las mismas pruebas que `solver/tests/test_choque_de_frente.py`.
 */
type Json = Record<string, unknown>;
const FIXTURE = resolve(__dirname, "../../scene-schema/fixtures/frente/choque-de-frente.json");
const spec = (): Json => JSON.parse(readFileSync(FIXTURE, "utf8")) as Json;

function alImpacto(s: Json, vid: string): [number, number] {
  const r = reconstruct(s, { dt: 0.05 });
  const tr = r.vehiculos.find((v) => v.id === vid)!.trajectory;
  let k = 0;
  tr.t.forEach((t, i) => {
    if (t <= 1e-9) k = i;
  });
  const pos0 = (s.vehiculos as Json[]).find((v) => v.id === vid)!.posicion_inicial as Json;
  return [
    Math.hypot(tr.vx[k]!, tr.vy[k]!) * 3.6,
    Math.hypot(tr.x[k]! - Number(pos0.x), tr.y[k]! - Number(pos0.y)),
  ];
}

function alineado(s0: Json): Json {
  const s = structuredClone(s0);
  const vs = s.vehiculos as Json[];
  const a = vs.find((v) => v.id === "veh-a")!;
  const b = vs.find((v) => v.id === "veh-b")!;
  const pa = a.posicion_inicial as Json;
  const pb = b.posicion_inicial as Json;
  const rumbo = Number(pa.rumbo_deg);
  const h = (rumbo * Math.PI) / 180;
  Object.assign(pb, { x: 14 * Math.cos(h), y: 14 * Math.sin(h), rumbo_deg: rumbo + 180 });
  Object.assign(pa, { x: -12 * Math.cos(h), y: -12 * Math.sin(h) });
  return s;
}

describe("choques de frente casi en la misma línea", () => {
  it("desfasado: el que frena frena antes del choque", () => {
    const [v, recorrido] = alImpacto(spec(), "veh-b");
    expect(recorrido).toBeGreaterThan(5);
    expect(v).toBeLessThan(55);
  });

  it("alineado: el que frena frena y el otro no", () => {
    const s = alineado(spec());
    const [vb, rb] = alImpacto(s, "veh-b");
    const [va, ra] = alImpacto(s, "veh-a");
    expect(rb).toBeGreaterThan(5);
    expect(ra).toBeGreaterThan(5);
    expect(vb).toBeLessThan(55);
    expect(Math.abs(va - 40)).toBeLessThan(0.5);
  });

  it("sin frenado: llegan a su velocidad y avanzan", () => {
    const s = spec();
    for (const v of s.vehiculos as Json[]) delete v.frenado;
    const [vb, rb] = alImpacto(s, "veh-b");
    expect(rb).toBeGreaterThan(5);
    expect(Math.abs(vb - 60)).toBeLessThan(0.5);
  });
});
