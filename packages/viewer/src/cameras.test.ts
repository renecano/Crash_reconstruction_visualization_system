import { FIXTURE_NAMES, loadResultado } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import {
  actionBounds,
  cinematicCamera,
  driverCamera,
  freeCameraStart,
  overheadCamera,
} from "./cameras";
import { fromThree } from "./coords";
import { sampleVehicle } from "./sample";

describe("cámaras", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: cenital encuadra el impacto desde arriba y la libre lo mira desde el suroeste`, async () => {
      const r = await loadResultado(name);
      const b = actionBounds(r);
      if (r.punto_impacto) {
        expect(b.cx).toBeCloseTo(r.punto_impacto.x, 9);
        expect(b.cy).toBeCloseTo(r.punto_impacto.y, 9);
      }
      const top = overheadCamera(r);
      const pos = fromThree(top.position);
      const tgt = fromThree(top.target);
      expect(pos.x).toBeCloseTo(tgt.x, 9);
      expect(pos.y).toBeCloseTo(tgt.y, 9);
      expect(pos.height).toBeGreaterThanOrEqual(25);
      const free = fromThree(freeCameraStart(r).position);
      expect(free.x).toBeLessThan(b.cx);
      expect(free.y).toBeLessThan(b.cy);
      expect(free.height).toBeGreaterThan(5);
    });
  }

  it("la cámara del conductor va dentro de su vehículo y mira hacia su rumbo", async () => {
    const r = await loadResultado("lateral_interseccion");
    const v = r.vehiculos[0];
    expect(v).toBeDefined();
    if (!v) return;
    const t = -1;
    const cam = driverCamera(v, t, 1.2);
    const p = sampleVehicle(v.trayectoria, t);
    const pos = fromThree(cam.position);
    expect(Math.hypot(pos.x - p.x, pos.y - p.y)).toBeLessThan(v.dimensiones.largo_m / 2);
    expect(pos.height).toBe(1.2);
    const tgt = fromThree(cam.target);
    const ang = Math.atan2(tgt.y - pos.y, tgt.x - pos.x);
    expect(Math.abs(Math.atan2(Math.sin(ang - p.yaw), Math.cos(ang - p.yaw)))).toBeLessThan(1e-9);
  });

  it("la cinematográfica es determinista y gira con el tiempo", async () => {
    const r = await loadResultado("glorieta");
    const a = cinematicCamera(r, 0);
    expect(cinematicCamera(r, 0)).toEqual(a);
    const b = cinematicCamera(r, 2);
    expect(b.position).not.toEqual(a.position);
    const pa = fromThree(a.position);
    const ta = fromThree(a.target);
    expect(Math.hypot(pa.x - ta.x, pa.y - ta.y, pa.height - ta.height)).toBeGreaterThan(15);
  });
});
