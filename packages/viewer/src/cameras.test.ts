import { FIXTURE_NAMES, loadResultado } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import {
  actionBounds,
  blendPose,
  CINEMATIC,
  cinematicCamera,
  easeInOut,
  fovFromFocalMm,
  type CameraPose,
  damageCamera,
  exportCameras,
  mostDamaged,
  driverCamera,
  driverEyeHeight,
  driverEyeOffset,
  DRIVER_LOOK_M,
  DRIVER_PITCH_DEG,
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

  it("el ojo del conductor por clase sube del sedán a la van y nunca pasa del techo", () => {
    const sedan = driverEyeHeight("sedan_compacto", 1.49);
    const suv = driverEyeHeight("suv_compacta", 1.64);
    const pickup = driverEyeHeight("pickup", 1.85);
    const van = driverEyeHeight("van", 2.28);
    const bus = driverEyeHeight("autobus", 3.15);
    expect(sedan).toBeLessThan(suv);
    expect(suv).toBeLessThan(pickup);
    expect(pickup).toBeLessThan(van);
    expect(van).toBeLessThan(bus);
    // Un vehículo bajito: el ojo queda 0.22 m bajo el techo, no en el valor de la clase.
    expect(driverEyeHeight("sedan_compacto", 1.2)).toBeCloseTo(0.98, 9);
    expect(driverEyeHeight(undefined, 1.5)).toBe(driverEyeHeight("sedan_compacto", 1.5));
  });

  it("la mirada baja DRIVER_PITCH_DEG y el ojo queda dentro del vehículo, a la izquierda", async () => {
    const r = await loadResultado("lateral_interseccion");
    for (const v of r.vehiculos) {
      const cam = driverCamera(v, -1, 1.3);
      const pos = fromThree(cam.position);
      const tgt = fromThree(cam.target);
      const drop = pos.height - tgt.height;
      expect(drop).toBeCloseTo(DRIVER_LOOK_M * Math.tan((DRIVER_PITCH_DEG * Math.PI) / 180), 9);
      const [fwd, left] = driverEyeOffset(
        v.clase,
        v.dimensiones.largo_m,
        v.dimensiones.ancho_m,
        v.dimensiones.distancia_entre_ejes_m,
      );
      expect(Math.abs(fwd)).toBeLessThan(v.dimensiones.largo_m / 2);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThan(v.dimensiones.ancho_m / 2);
    }
    // La pickup lleva el ojo adelante del centro de masa (la cabina va adelante de la caja).
    expect(driverEyeOffset("pickup", 5.26, 1.85, 3.15)[0]).toBeGreaterThan(0.3);
    expect(driverEyeOffset("sedan_compacto", 4.4, 1.7, 2.5)[0]).toBeGreaterThan(0);
  });

  it("la cinematográfica es determinista y gira con el tiempo", async () => {
    const r = await loadResultado("glorieta");
    const a = cinematicCamera(r, 0);
    expect(cinematicCamera(r, 0)).toEqual(a);
    const b = cinematicCamera(r, 2);
    expect(b.position).not.toEqual(a.position);
    const pa = fromThree(a.position);
    const ta = fromThree(a.target);
    expect(Math.hypot(pa.x - ta.x, pa.y - ta.y, pa.height - ta.height)).toBeGreaterThan(11);
  });

  for (const name of ["alcance", "carambola", "lateral_interseccion"] as const) {
    it(`${name}: la cinematográfica va a nivel de calle (3–6 m, 35–50 mm) y ve el horizonte`, async () => {
      const r = await loadResultado(name);
      const a = cinematicCamera(r, 0);
      const p = fromThree(a.position);
      const tg = fromThree(a.target);
      expect(p.height).toBeGreaterThanOrEqual(CINEMATIC.heightMin);
      expect(p.height).toBeLessThanOrEqual(CINEMATIC.heightMax);
      expect(a.fov).toBeGreaterThanOrEqual(fovFromFocalMm(CINEMATIC.focalMax) - 1e-9);
      expect(a.fov).toBeLessThanOrEqual(fovFromFocalMm(CINEMATIC.focalMin) + 1e-9);
      // Inclinación hacia abajo menor que la mitad del campo de visión: el horizonte queda en
      // pantalla (y el cielo encima).
      const d = Math.hypot(p.x - tg.x, p.y - tg.y);
      const pitch = (Math.atan2(p.height - tg.height, d) * 180) / Math.PI;
      expect(pitch).toBeGreaterThan(0);
      expect(pitch).toBeLessThan(a.fov / 2);
      // Órbita lenta alrededor de su objetivo: en 2 s gira menos de 8° (0.06 rad/s).
      const b = cinematicCamera(r, 2);
      const pb = fromThree(b.position);
      const tb = fromThree(b.target);
      const ang = (q: { x: number; y: number }, c: { x: number; y: number }) =>
        Math.atan2(q.y - c.y, q.x - c.x);
      const giro = Math.abs(ang(pb, tb) - ang(p, tg));
      expect(Math.min(giro, 2 * Math.PI - giro)).toBeLessThan((8 * Math.PI) / 180);
      expect(Math.min(giro, 2 * Math.PI - giro)).toBeGreaterThan((5 * Math.PI) / 180);
    });
  }

  it("una lente de 35 mm abre más que una de 50 mm y la mezcla de poses va de una a otra", () => {
    expect(fovFromFocalMm(35)).toBeCloseTo(37.85, 1);
    expect(fovFromFocalMm(50)).toBeCloseTo(26.99, 1);
    const a: CameraPose = { position: [0, 0, 0], target: [1, 0, 0], fov: 30, up: [0, 1, 0] };
    const b: CameraPose = { position: [10, 2, 0], target: [1, 4, 0], fov: 40, up: [0, 1, 0] };
    expect(blendPose(a, b, 0)).toEqual({ ...a, up: b.up });
    expect(blendPose(a, b, 1)).toEqual(b);
    const m = blendPose(a, b, 0.5);
    expect(m.position[0]).toBeCloseTo(5, 9);
    expect(m.fov).toBeCloseTo(35, 9);
    expect(easeInOut(0.25)).toBeLessThan(0.25);
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
