import { FIXTURE_NAMES, loadResultado } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import {
  actionBounds,
  cinematicCamera,
  damageCamera,
  exportCameras,
  mostDamaged,
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
      expect(pos.height).toBeGreaterThanOrEqual(18);
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
    expect(Math.hypot(pa.x - ta.x, pa.y - ta.y, pa.height - ta.height)).toBeGreaterThan(13);
  });

  it("el acercamiento al daño mira la cara golpeada del vehículo más deformado", async () => {
    const r = await loadResultado("objeto_fijo_arbol");
    const v = mostDamaged(r);
    expect(v?.id).toBe("veh-a");
    if (!v) return;
    const cam = damageCamera(r, 1);
    const p = sampleVehicle(v.trayectoria, 1);
    const pos = fromThree(cam.position);
    const dx = pos.x - p.x;
    const dy = pos.y - p.y;
    // Golpe frontal contra un árbol: la cámara queda adelante, abierta a 60° de su rumbo.
    const rel = Math.atan2(dy, dx) - p.yaw;
    expect(Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel)))).toBeCloseTo((60 * Math.PI) / 180, 6);
    expect(Math.hypot(dx, dy)).toBeLessThan(15);
  });

  it("R11: las cámaras que se exportan son las del visor, con la cinematográfica primero", async () => {
    const r = await loadResultado("peaton_cruce");
    const cams = exportCameras(r, () => 1.3);
    expect(cams[0]!.clave).toBe("cinematica");
    expect(cams.map((c) => c.clave)).toEqual([
      "cinematica",
      "cenital",
      "dano",
      ...r.vehiculos.map((v) => `conductor_${v.id}`),
      "persona",
    ]);
    const t = (r.t_inicio + r.t_fin) / 2;
    expect(cams[0]!.pose(t)).toEqual(cinematicCamera(r, t));
    const v = r.vehiculos[0]!;
    expect(cams.find((c) => c.clave === `conductor_${v.id}`)!.pose(t)).toEqual(
      driverCamera(v, t, 1.3),
    );
  });
});
