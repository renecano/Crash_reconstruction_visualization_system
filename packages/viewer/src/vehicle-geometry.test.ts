import { VEHICLE_CLASSES } from "@croquis/scene-schema";
import { Box3, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  axlePositions,
  buildVehicle,
  PROFILES,
  SEPARATE_PARTS,
  seatHeight,
  wheelNames,
  type VehicleDimensions,
} from "./vehicle-geometry";

function typicalDims(clase: string): VehicleDimensions {
  const t = VEHICLE_CLASSES[clase]?.tipico;
  if (!t) throw new Error(clase);
  const length = t.largo_m ?? 4.4;
  return {
    length,
    width: t.ancho_m ?? 1.75,
    height: t.alto_m ?? 1.5,
    wheelbase: Math.min(t.distancia_entre_ejes_m ?? 0.6 * length, 0.92 * length),
  };
}

/** Caja de la carrocería sin espejos (sobresalen a propósito). */
function bodyBox(clase: string, d: VehicleDimensions): Box3 {
  const g = buildVehicle(clase, d);
  g.updateMatrixWorld(true);
  const box = new Box3();
  g.traverse((o) => {
    const skip = ["fusion_", "mirror", "handlebar"].some((p) => o.name.startsWith(p));
    if (o instanceof Mesh && !skip) {
      box.expandByObject(o);
    }
  });
  return box;
}

const CLASSES = Object.keys(PROFILES);

describe("vehículos procedurales", () => {
  it("hay un perfil para cada clase del contrato", () => {
    expect(new Set(CLASSES)).toEqual(new Set(Object.keys(VEHICLE_CLASSES)));
  });

  for (const clase of CLASSES) {
    it(`${clase}: la caja del modelo respeta las dimensiones reales`, () => {
      const d = typicalDims(clase);
      const size = bodyBox(clase, d).getSize(new Vector3());
      const twoWheel = PROFILES[clase]?.kind === "two_wheel";
      // Dos ruedas: el largo lo fijan las llantas y la distancia entre ejes.
      if (!twoWheel) {
        expect(size.x).toBeGreaterThan(0.97 * d.length);
        expect(size.x).toBeLessThan(1.03 * d.length);
        expect(size.z).toBeGreaterThan(0.95 * d.width);
        expect(size.z).toBeLessThan(1.04 * d.width);
        expect(size.y).toBeGreaterThan(0.9 * d.height);
        expect(size.y).toBeLessThan(1.04 * d.height);
      } else {
        expect(size.x).toBeLessThan(1.15 * d.length);
        expect(size.y).toBeLessThan(1.15 * d.height);
      }
    });
  }

  it("escalar el vehículo no deforma las llantas", () => {
    const d = typicalDims("sedan_mediano");
    const a = buildVehicle("sedan_mediano", d);
    const b = buildVehicle("sedan_mediano", {
      ...d,
      length: d.length * 1.2,
      wheelbase: d.wheelbase * 1.2,
    });
    const r = (g: typeof a): number => g.getObjectByName("wheel_fl")?.userData.radius as number;
    expect(r(a)).toBe(r(b));
    expect(r(a)).toBeCloseTo(0.32, 9);
  });

  it("las llantas quedan en los ejes y respetan la distancia entre ejes", () => {
    const d = typicalDims("pickup");
    const g = buildVehicle("pickup", d);
    const xf = g.getObjectByName("wheel_fl")?.position.x ?? NaN;
    const xr = g.getObjectByName("wheel_rl")?.position.x ?? NaN;
    expect(xf - xr).toBeCloseTo(d.wheelbase, 9);
    const { front } = axlePositions(d, 0.45);
    expect(xf).toBeCloseTo(front, 9);
    // Voladizo delantero declarado en el contrato manda.
    expect(axlePositions({ ...d, frontOverhang: 0.9 }, 0.45).front).toBeCloseTo(
      d.length / 2 - 0.9,
      9,
    );
  });

  it("las piezas van nombradas como pide PLAN §7.2", () => {
    const g = buildVehicle("sedan_compacto", typicalDims("sedan_compacto"));
    for (const name of [
      "body",
      "greenhouse",
      "roof",
      "windshield",
      "hood",
      "bumper_front",
      "bumper_rear",
      "headlight_l",
      "headlight_r",
      "taillight_l",
      "taillight_r",
      "mirror_l",
      "mirror_r",
      "door_fl",
      "door_fr",
      "door_rl",
      "door_rr",
    ]) {
      expect(g.getObjectByName(name), name).toBeDefined();
    }
    expect(wheelNames(g).sort()).toEqual(["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]);
    const roles = new Set<string>();
    g.traverse((o) => {
      if (o instanceof Mesh) roles.add(o.userData.role as string);
    });
    // Llanta y rin van en una sola malla por rueda (rol "rueda", atributo `_parte`).
    expect(roles).toEqual(new Set(["pintura", "vidrio", "plastico", "faro", "calavera", "rueda"]));
    const wheel = g.getObjectByName("wheel_fl_rueda") as Mesh;
    const parte = wheel.geometry.getAttribute("_parte");
    const values = new Set(Array.from(parte.array as Float32Array));
    expect(values).toEqual(new Set([0, 1]));
  });

  it("motos y bicis tienen dos llantas y asiento a altura plausible", () => {
    for (const clase of ["motocicleta", "bicicleta", "scooter"]) {
      const d = typicalDims(clase);
      const g = buildVehicle(clase, d);
      expect(wheelNames(g).sort()).toEqual(["wheel_f", "wheel_r"]);
      const seat = seatHeight(clase, d);
      expect(seat).toBeGreaterThan(0.2);
      expect(seat).toBeLessThan(1.0);
    }
    expect(seatHeight("autobus", typicalDims("autobus"))).toBeGreaterThan(1.0);
  });
});

describe("fusión de piezas", () => {
  it("dibuja cada vehículo con una malla por material más las llantas y conserva las piezas", () => {
    const g = buildVehicle("sedan_mediano", typicalDims("sedan_mediano"));
    const visible: string[] = [];
    g.traverseVisible((o) => {
      if (o instanceof Mesh) visible.push(o.name);
    });
    const fused = visible.filter((n) => n.startsWith("fusion_"));
    expect(fused.length).toBeLessThanOrEqual(7);
    expect(
      visible
        .filter((n) => !n.startsWith("fusion_"))
        .every((n) => n.startsWith("wheel_") || SEPARATE_PARTS.has(n)),
    ).toBe(true);
    expect(visible).toContain("windshield");
    expect(visible).toContain("bumper_front");
    const hood = g.getObjectByName("hood");
    expect(hood?.parent?.name).toBe("piezas");
    expect(hood?.parent?.visible).toBe(false);
    const paint = g.getObjectByName("fusion_pintura");
    expect(paint?.userData.parts).toContain("hood");
    const plain = buildVehicle("sedan_mediano", typicalDims("sedan_mediano"), { fuse: false });
    expect(plain.getObjectByName("piezas")).toBeUndefined();
  });
});
