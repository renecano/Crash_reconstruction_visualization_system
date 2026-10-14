/**
 * Impacto contra objetos fijos (port de `croquis_solver.fixed_object`): barrera plana rígida,
 * objeto estrecho (poste o árbol) y objetos que ceden.
 */
import { crushEnergy, profileForEnergy, type Stiffness, TRIANGULAR_SHAPES } from "./crash3";
import type { Body2D } from "./models";
import { isClose, radians } from "./pymath";

export const SPREAD_ANGLE_DEG = 45.0;
/** Árboles y postes de madera con diámetro mayor se tratan como rígidos. */
export const RIGID_DIAMETER_M = 0.25;
/** Fracción de energía que absorbe un objeto que cede (supuesto; rango 0.1–0.5). */
export const YIELDING_FRACTION = 0.3;

export interface FixedObjectResult {
  deltaV: number;
  vAfter: number;
  energyAbsorbedVehicle: number;
  energyAbsorbedObject: number;
  damageWidth: number;
  profile: number[];
  maxCrush: number;
  rigid: boolean;
}

/** Impacto frontal pleno contra barrera plana rígida. */
export function rigidBarrier(
  body: Body2D,
  vImpact: number,
  k: Stiffness,
  opts: { restitution?: number; damageWidth?: number | null } = {},
): FixedObjectResult {
  const restitution = opts.restitution ?? 0.1;
  if (vImpact < 0) throw new Error("La velocidad de impacto no puede ser negativa");
  const w = opts.damageWidth ?? body.width;
  const energy = 0.5 * body.mass * vImpact ** 2 * (1.0 - restitution ** 2);
  const profile = profileForEnergy(energy, w, k, TRIANGULAR_SHAPES.uniforme);
  return {
    deltaV: vImpact * (1.0 + restitution),
    vAfter: vImpact * restitution,
    energyAbsorbedVehicle: energy,
    energyAbsorbedObject: 0.0,
    damageWidth: w,
    profile,
    maxCrush: Math.max(...profile),
    rigid: true,
  };
}

export function isRigid(material: string, diameterM: number): boolean {
  if (material === "concreto" || material === "metal" || material === "mamposteria") return true;
  return diameterM >= RIGID_DIAMETER_M;
}

export interface NarrowObjectOptions {
  diameterM: number;
  material?: string;
  restitution?: number;
  yieldingFraction?: number;
  spreadAngleDeg?: number;
  maxIter?: number;
}

/** Impacto contra poste o árbol; si el objeto cede, el vehículo conserva parte de la velocidad. */
export function narrowObject(
  body: Body2D,
  vImpact: number,
  k: Stiffness,
  opts: NarrowObjectOptions,
): FixedObjectResult {
  const {
    diameterM,
    material = "concreto",
    restitution = 0.05,
    yieldingFraction = YIELDING_FRACTION,
    spreadAngleDeg = SPREAD_ANGLE_DEG,
    maxIter = 60,
  } = opts;
  if (vImpact < 0 || diameterM <= 0) throw new Error("Velocidad no negativa y diámetro positivo");
  const rigid = isRigid(material, diameterM);
  const kinetic = 0.5 * body.mass * vImpact ** 2;
  let eVehicle: number;
  let eObject: number;
  let vAfter: number;
  let deltaV: number;
  if (rigid) {
    eVehicle = kinetic * (1.0 - restitution ** 2);
    eObject = 0.0;
    vAfter = vImpact * restitution;
    deltaV = vImpact * (1.0 + restitution);
  } else {
    eObject = yieldingFraction * kinetic;
    // El vehículo se deforma con la energía que no se lleva el objeto, con un límite.
    eVehicle = (1.0 - yieldingFraction) * kinetic * 0.5;
    const remaining = Math.max(kinetic - eObject - eVehicle, 0.0);
    vAfter = Math.sqrt((2.0 * remaining) / body.mass);
    deltaV = vImpact - vAfter;
  }
  const tanA = Math.tan(radians(spreadAngleDeg));
  let width = Math.min(body.width, Math.max(diameterM, 0.3 * body.width));
  let profile = profileForEnergy(eVehicle, width, k, TRIANGULAR_SHAPES.poste);
  for (let i = 0; i < maxIter; i++) {
    const newWidth = Math.min(body.width, diameterM + 2.0 * Math.max(...profile) * tanA);
    if (Math.abs(newWidth - width) < 1e-6) break;
    width = newWidth;
    profile = profileForEnergy(eVehicle, width, k, TRIANGULAR_SHAPES.poste);
  }
  // Por debajo del umbral de deformación permanente el perfil es cero (absorción elástica).
  const below = Math.max(...profile) === 0.0 && eVehicle <= crushEnergy(profile, width, k);
  if (!(below || isClose(crushEnergy(profile, width, k), eVehicle, 1e-6))) {
    throw new Error("El perfil no absorbe la energía del vehículo");
  }
  return {
    deltaV,
    vAfter,
    energyAbsorbedVehicle: eVehicle,
    energyAbsorbedObject: eObject,
    damageWidth: width,
    profile,
    maxCrush: Math.max(...profile),
    rigid,
  };
}
