/**
 * Vehículos genéricos procedurales por clase, sin marcas ni logotipos (CLAUDE.md, regla 5).
 *
 * Se generan en código a partir de un perfil por clase y de las dimensiones reales del vehículo
 * del contrato (largo, ancho, alto, distancia entre ejes, voladizos), así que siempre coinciden
 * con lo que usa el solver. Las llantas tienen radio absoluto por clase: escalar el vehículo no
 * las deforma (PLAN §7.2). Las piezas van nombradas (`bumper_front`, `hood`, `door_fl`,
 * `windshield`, `wheel_rr`, …) y llevan `userData.role` para que la capa React asigne materiales
 * y F4 deforme por pieza. ADR 0006 explica por qué procedural y no assets descargados.
 *
 * Marco local: origen en el centro de la planta (punto que sigue el solver) a nivel del piso,
 * +x al frente, +y arriba, −z a la izquierda (consistente con `coords.ts`).
 */
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  TorusGeometry,
} from "three";

export type PartRole =
  "pintura" | "vidrio" | "llanta" | "rin" | "faro" | "calavera" | "plastico" | "cromo" | "carga";

export interface VehicleDimensions {
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  frontOverhang?: number;
}

type BodyStyle = "sedan" | "hatchback" | "suv" | "pickup" | "van" | "bus" | "truck" | "tractor";

interface CarProfile {
  kind: "car";
  style: BodyStyle;
  wheelRadius: number;
  clearance: number;
  /** Altura de la línea de cintura como fracción del alto. */
  belt: number;
  /** Fracción del largo que ocupa el cofre y la cajuela (a partir de cada extremo). */
  hood: number;
  trunk: number;
  /** Inclinación del parabrisas y del medallón como fracción del largo. */
  windshieldRun: number;
  rearRun: number;
  /** Ancho del habitáculo respecto al ancho total. */
  tumblehome: number;
  /** Fracción del voladizo total que queda adelante. */
  frontShare: number;
}

interface TwoWheelProfile {
  kind: "two_wheel";
  style: "moto" | "bici" | "scooter";
  wheelRadius: number;
  tireWidth: number;
}

type Profile = CarProfile | TwoWheelProfile;

const car = (p: Omit<CarProfile, "kind">): CarProfile => ({ kind: "car", ...p });

/** Perfiles visuales por clase (valores de diseño, no mediciones). */
export const PROFILES: Record<string, Profile> = {
  sedan_compacto: car({
    style: "sedan",
    wheelRadius: 0.31,
    clearance: 0.16,
    belt: 0.58,
    hood: 0.27,
    trunk: 0.17,
    windshieldRun: 0.13,
    rearRun: 0.12,
    tumblehome: 0.84,
    frontShare: 0.56,
  }),
  sedan_mediano: car({
    style: "sedan",
    wheelRadius: 0.32,
    clearance: 0.15,
    belt: 0.58,
    hood: 0.28,
    trunk: 0.18,
    windshieldRun: 0.14,
    rearRun: 0.13,
    tumblehome: 0.84,
    frontShare: 0.56,
  }),
  hatchback: car({
    style: "hatchback",
    wheelRadius: 0.3,
    clearance: 0.16,
    belt: 0.56,
    hood: 0.25,
    trunk: 0.04,
    windshieldRun: 0.14,
    rearRun: 0.07,
    tumblehome: 0.85,
    frontShare: 0.58,
  }),
  suv_compacta: car({
    style: "suv",
    wheelRadius: 0.35,
    clearance: 0.2,
    belt: 0.56,
    hood: 0.24,
    trunk: 0.03,
    windshieldRun: 0.12,
    rearRun: 0.05,
    tumblehome: 0.87,
    frontShare: 0.55,
  }),
  suv_grande: car({
    style: "suv",
    wheelRadius: 0.39,
    clearance: 0.22,
    belt: 0.56,
    hood: 0.23,
    trunk: 0.03,
    windshieldRun: 0.11,
    rearRun: 0.04,
    tumblehome: 0.88,
    frontShare: 0.5,
  }),
  pickup: car({
    style: "pickup",
    wheelRadius: 0.38,
    clearance: 0.23,
    belt: 0.55,
    hood: 0.24,
    trunk: 0.36,
    windshieldRun: 0.1,
    rearRun: 0.03,
    tumblehome: 0.88,
    frontShare: 0.45,
  }),
  van: car({
    style: "van",
    wheelRadius: 0.34,
    clearance: 0.17,
    belt: 0.47,
    hood: 0.1,
    trunk: 0.0,
    windshieldRun: 0.07,
    rearRun: 0.01,
    tumblehome: 0.94,
    frontShare: 0.45,
  }),
  microbus_combi: car({
    style: "van",
    wheelRadius: 0.35,
    clearance: 0.18,
    belt: 0.47,
    hood: 0.08,
    trunk: 0.0,
    windshieldRun: 0.06,
    rearRun: 0.01,
    tumblehome: 0.94,
    frontShare: 0.45,
  }),
  autobus: car({
    style: "bus",
    wheelRadius: 0.5,
    clearance: 0.28,
    belt: 0.42,
    hood: 0.0,
    trunk: 0.0,
    windshieldRun: 0.02,
    rearRun: 0.0,
    tumblehome: 0.97,
    frontShare: 0.48,
  }),
  camion_unitario: car({
    style: "truck",
    wheelRadius: 0.47,
    clearance: 0.3,
    belt: 0.5,
    hood: 0.12,
    trunk: 0.0,
    windshieldRun: 0.03,
    rearRun: 0.0,
    tumblehome: 0.95,
    frontShare: 0.35,
  }),
  tractocamion: car({
    style: "tractor",
    wheelRadius: 0.52,
    clearance: 0.32,
    belt: 0.5,
    hood: 0.18,
    trunk: 0.0,
    windshieldRun: 0.03,
    rearRun: 0.0,
    tumblehome: 0.95,
    frontShare: 0.55,
  }),
  motocicleta: { kind: "two_wheel", style: "moto", wheelRadius: 0.31, tireWidth: 0.12 },
  bicicleta: { kind: "two_wheel", style: "bici", wheelRadius: 0.34, tireWidth: 0.035 },
  scooter: { kind: "two_wheel", style: "scooter", wheelRadius: 0.11, tireWidth: 0.06 },
};

const DEFAULT_PROFILE = PROFILES.sedan_compacto as CarProfile;

export function profileFor(clase: string): Profile {
  return PROFILES[clase] ?? DEFAULT_PROFILE;
}

function part(name: string, geometry: BufferGeometry, role: PartRole): Mesh {
  const m = new Mesh(geometry);
  m.name = name;
  m.userData.role = role;
  m.castShadow = true;
  m.receiveShadow = role === "pintura";
  return m;
}

/** Caja con centro (x, y) en la vista lateral y centro lateral z (−z izquierda). */
function box(
  name: string,
  role: PartRole,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z = 0,
): Mesh {
  const m = part(name, new BoxGeometry(sx, sy, sz), role);
  m.position.set(x, y, z);
  return m;
}

/** Prisma a partir de un perfil lateral (x adelante, y arriba), centrado en z, de ancho w. */
function extruded(
  name: string,
  role: PartRole,
  pts: [number, number][],
  w: number,
  bevel: number,
): Mesh {
  const shape = new Shape();
  const first = pts[0] ?? [0, 0];
  shape.moveTo(first[0], first[1]);
  for (const [x, y] of pts.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const depth = Math.max(0.01, w - 2 * bevel);
  const g = new ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  return part(name, g, role);
}

function wheel(name: string, r: number, width: number, x: number, z: number): Group {
  const g = new Group();
  g.name = name;
  g.position.set(x, r, z);
  const tire = part(`${name}_tire`, new CylinderGeometry(r, r, width, 20), "llanta");
  tire.rotation.x = Math.PI / 2;
  const rim = part(
    `${name}_rim`,
    new CylinderGeometry(r * 0.62, r * 0.62, width * 1.02, 12),
    "rin",
  );
  rim.rotation.x = Math.PI / 2;
  g.add(tire, rim);
  g.userData.radius = r;
  return g;
}

/** Resuelve voladizos: delantero declarado o por perfil; el resto queda atrás. */
export function axlePositions(
  d: VehicleDimensions,
  frontShare: number,
): { front: number; rear: number } {
  const wb = Math.min(d.wheelbase, 0.92 * d.length);
  const overhang = Math.max(0, d.length - wb);
  const fo =
    d.frontOverhang !== undefined ? Math.min(d.frontOverhang, overhang) : overhang * frontShare;
  const front = d.length / 2 - fo;
  return { front, rear: front - wb };
}

function buildCar(p: CarProfile, d: VehicleDimensions): Group {
  const g = new Group();
  const { length: L, width: W, height: H } = d;
  const r = Math.min(p.wheelRadius, 0.42 * H);
  const tireW = Math.min(0.28, 0.13 * W);
  const { front: xf, rear: xr } = axlePositions(d, p.frontShare);
  const xF = L / 2;
  const xR = -L / 2;
  const clr = Math.min(p.clearance, 0.3 * H);
  const belt = Math.max(clr + 0.25, p.belt * H);
  const bevel = Math.min(0.05, 0.03 * W);

  // Carrocería baja: de la altura libre a la cintura, con nariz y cola inclinadas.
  const nose = Math.min(0.12 * L, 0.35);
  const tail = Math.min(0.06 * L, 0.2);
  const lower: [number, number][] = [
    [xR, clr + 0.1],
    [xR + 0.08, clr],
    [xF - 0.08, clr],
    [xF, clr + 0.12],
    [xF, belt - 0.12],
    [xF - nose, belt],
    [xR + tail, belt],
    [xR, belt - 0.06],
  ];
  g.add(extruded("body", "pintura", lower, W, bevel));

  // Habitáculo (vidrio) y techo.
  const roofY = H - 0.04;
  const cabinW = W * p.tumblehome;
  let wsBase: number;
  let rwBase: number;
  if (p.style === "pickup") {
    wsBase = xF - p.hood * L;
    rwBase = xR + p.trunk * L + 0.05;
  } else if (p.style === "bus") {
    wsBase = xF - 0.05;
    rwBase = xR + 0.05;
  } else if (p.style === "truck" || p.style === "tractor") {
    wsBase = xF - p.hood * L;
    rwBase = wsBase - Math.min(2.0, 0.3 * L);
  } else {
    wsBase = xF - p.hood * L;
    rwBase = xR + p.trunk * L;
  }
  const wsTop = wsBase - p.windshieldRun * L;
  const rwTop = rwBase + p.rearRun * L;
  // La caja de carga del camión da su altura total; la cabina es más baja.
  const cabinTop = p.style === "truck" ? Math.min(roofY, belt + 1.25) : roofY;
  const cabin: [number, number][] = [
    [rwBase, belt - 0.01],
    [wsBase, belt - 0.01],
    [wsTop, cabinTop],
    [rwTop, cabinTop],
  ];
  g.add(extruded("greenhouse", "vidrio", cabin, cabinW, 0.02));
  const roofLen = Math.max(0.2, wsTop - rwTop);
  g.add(
    box(
      "roof",
      "pintura",
      roofLen + 0.06,
      0.05,
      cabinW - 0.04,
      (wsTop + rwTop) / 2,
      cabinTop + 0.02,
    ),
  );
  // Parabrisas como pieza propia (para la grieta de F4), sobre la cara inclinada del habitáculo.
  const wsLen = Math.hypot(wsBase - wsTop, cabinTop - belt);
  const ws = box(
    "windshield",
    "vidrio",
    0.02,
    wsLen,
    cabinW * 0.92,
    (wsBase + wsTop) / 2 + 0.01,
    (belt + cabinTop) / 2,
  );
  ws.rotation.z = Math.atan2(wsBase - wsTop, cabinTop - belt);
  g.add(ws);
  if (p.style === "truck") {
    // Caja de carga detrás de la cabina.
    const boxStart = xR;
    const boxEnd = rwBase - 0.15;
    g.add(
      box(
        "cargo_box",
        "carga",
        boxEnd - boxStart,
        H - clr - 0.2,
        W,
        (boxStart + boxEnd) / 2,
        (H + clr + 0.2) / 2,
      ),
    );
  }
  if (p.style === "pickup") {
    const bedLen = rwBase - xR - 0.1;
    const wall = 0.06;
    for (const side of [-1, 1]) {
      g.add(
        box(
          side < 0 ? "bed_wall_l" : "bed_wall_r",
          "pintura",
          bedLen,
          0.45,
          wall,
          xR + bedLen / 2 + 0.02,
          belt + 0.2,
          side * (W / 2 - wall),
        ),
      );
    }
    g.add(box("tailgate", "pintura", wall, 0.45, W - 0.1, xR + 0.04, belt + 0.2));
  }
  if (p.style === "bus") {
    g.add(box("roof", "pintura", L - 0.1, 0.08, W - 0.06, 0, roofY));
  }

  // Cofre (pieza separada para F4) y defensas.
  if (p.hood > 0.05 && p.style !== "bus") {
    const hoodLen = Math.max(0.3, wsBase - (xF - nose) + 0.02);
    g.add(
      box("hood", "pintura", hoodLen, 0.03, W * 0.86, xF - nose - hoodLen / 2 + 0.02, belt - 0.005),
    );
  }
  const bumperH = Math.min(0.22, 0.3 * (belt - clr));
  g.add(
    box("bumper_front", "plastico", 0.16, bumperH, W * 0.98, xF - 0.04, clr + 0.08 + bumperH / 2),
  );
  g.add(
    box("bumper_rear", "plastico", 0.14, bumperH, W * 0.98, xR + 0.04, clr + 0.08 + bumperH / 2),
  );

  // Faros, calaveras y espejos (genéricos).
  const lightY = clr + 0.12 + bumperH + 0.08;
  for (const side of [-1, 1]) {
    const zl = side * (W / 2 - 0.22);
    const sfx = side < 0 ? "l" : "r";
    g.add(box(`headlight_${sfx}`, "faro", 0.05, 0.12, 0.3, xF + 0.005, lightY, zl));
    g.add(box(`taillight_${sfx}`, "calavera", 0.05, 0.12, 0.26, xR - 0.005, lightY + 0.05, zl));
    g.add(
      box(
        `mirror_${sfx}`,
        "plastico",
        0.1,
        0.1,
        0.16,
        wsBase - 0.1,
        belt + 0.12,
        side * (cabinW / 2 + 0.1),
      ),
    );
    // Puertas como paneles finos para F4 (abolladuras y transferencia de pintura por puerta).
    const doorH = belt - clr - 0.12;
    const doorZ = side * (W / 2 + 0.002);
    const frontDoorLen = Math.min(1.1, 0.25 * L);
    g.add(
      box(
        `door_f${sfx}`,
        "pintura",
        frontDoorLen,
        doorH,
        0.01,
        wsBase - frontDoorLen / 2 - 0.05,
        clr + 0.08 + doorH / 2,
        doorZ,
      ),
    );
    if (p.style !== "pickup" && p.style !== "truck" && p.style !== "tractor" && L > 3.9) {
      g.add(
        box(
          `door_r${sfx}`,
          "pintura",
          frontDoorLen * 0.9,
          doorH,
          0.01,
          wsBase - frontDoorLen * 1.5 - 0.1,
          clr + 0.08 + doorH / 2,
          doorZ,
        ),
      );
    }
  }

  // Llantas con radio absoluto (no se escalan con la carrocería).
  const zw = W / 2 - tireW / 2 - 0.02;
  g.add(wheel("wheel_fl", r, tireW, xf, -zw));
  g.add(wheel("wheel_fr", r, tireW, xf, zw));
  g.add(wheel("wheel_rl", r, tireW, xr, -zw));
  g.add(wheel("wheel_rr", r, tireW, xr, zw));
  if (p.style === "bus" || p.style === "tractor") {
    // Eje trasero doble de los vehículos pesados: el segundo eje va delante del primero.
    g.add(wheel("wheel_rl2", r, tireW, xr + 2.2 * r, -zw));
    g.add(wheel("wheel_rr2", r, tireW, xr + 2.2 * r, zw));
  }
  return g;
}

function buildTwoWheel(p: TwoWheelProfile, d: VehicleDimensions): Group {
  const g = new Group();
  const L = d.length;
  const wb = Math.min(d.wheelbase, L - 2 * p.wheelRadius + 0.1);
  const r = p.wheelRadius;
  const xf = wb / 2;
  const xr = -wb / 2;
  const mkWheel = (name: string, x: number): Group => {
    const w = new Group();
    w.name = name;
    w.position.set(x, r, 0);
    const tire = part(
      `${name}_tire`,
      new TorusGeometry(r - p.tireWidth / 2, p.tireWidth / 2, 8, 24),
      "llanta",
    );
    const hub = part(
      `${name}_rim`,
      new CylinderGeometry(r * 0.25, r * 0.25, p.tireWidth, 8),
      "rin",
    );
    hub.rotation.x = Math.PI / 2;
    w.add(tire, hub);
    w.userData.radius = r;
    return w;
  };
  g.add(mkWheel("wheel_f", xf), mkWheel("wheel_r", xr));
  if (p.style === "moto") {
    const h = d.height;
    g.add(box("frame", "pintura", wb * 0.7, 0.18, 0.16, 0, r + 0.2));
    g.add(box("tank", "pintura", 0.45, 0.22, 0.3, xf * 0.25, r + 0.42));
    g.add(box("seat", "plastico", 0.55, 0.1, 0.28, xr * 0.3, r + 0.42));
    g.add(box("fork", "cromo", 0.06, 0.6, 0.12, xf - 0.08, r + 0.3));
    g.add(box("handlebar", "cromo", 0.05, 0.05, 0.75, xf - 0.15, Math.min(h, r + 0.75)));
    g.add(box("headlight_c", "faro", 0.06, 0.14, 0.14, xf + 0.02, r + 0.55));
    g.add(box("taillight_c", "calavera", 0.04, 0.06, 0.12, xr - 0.15, r + 0.45));
  } else if (p.style === "bici") {
    g.add(box("frame", "pintura", wb * 0.75, 0.04, 0.04, 0, r + 0.25));
    const down = box("frame_down", "pintura", 0.04, 0.55, 0.04, xf * 0.35, r + 0.05);
    down.rotation.z = -0.6;
    g.add(down);
    g.add(box("seat", "plastico", 0.22, 0.05, 0.1, xr * 0.35, r + 0.55));
    g.add(box("handlebar", "cromo", 0.04, 0.04, 0.55, xf - 0.08, r + 0.62));
  } else {
    g.add(box("deck", "plastico", wb * 0.95, 0.06, 0.16, 0, r + 0.05));
    g.add(
      box(
        "stem",
        "cromo",
        0.04,
        Math.max(0.6, d.height - r - 0.1),
        0.04,
        xf - 0.04,
        d.height / 2 + r / 2,
      ),
    );
    g.add(box("handlebar", "cromo", 0.04, 0.04, 0.45, xf - 0.04, d.height - 0.02));
  }
  return g;
}

/** Modelo completo de un vehículo con sus dimensiones reales. */
export function buildVehicle(clase: string, dims: VehicleDimensions): Group {
  const p = profileFor(clase);
  const g = p.kind === "car" ? buildCar(p, dims) : buildTwoWheel(p, dims);
  g.name = `vehiculo_${clase}`;
  g.userData.clase = clase;
  g.userData.dims = dims;
  return g;
}

/** Nombres de las llantas de un modelo (para hacerlas girar). */
export function wheelNames(g: Group): string[] {
  const out: string[] = [];
  g.traverse((o) => {
    if (o.name.startsWith("wheel_") && typeof o.userData.radius === "number") out.push(o.name);
  });
  return out;
}

/** Altura del asiento del conductor (para la cámara del conductor y los ocupantes visibles). */
export function seatHeight(clase: string, dims: VehicleDimensions): number {
  const p = profileFor(clase);
  if (p.kind === "two_wheel") return p.wheelRadius + (p.style === "scooter" ? 0.15 : 0.45);
  return Math.min(
    dims.height - 0.35,
    p.clearance +
      0.55 +
      (p.style === "bus" || p.style === "truck" || p.style === "tractor" ? 0.8 : 0),
  );
}
