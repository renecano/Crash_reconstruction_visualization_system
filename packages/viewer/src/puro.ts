/**
 * Las funciones de cálculo del visor que no dibujan nada: la vía, su decoración, el entorno
 * procedural, el ambiente y las luminarias. Las usa el escenario del visor Unity (ADR 0112) para que
 * el 3D de Unity coincida con el de aquí y con el croquis 2D. Solo reexporta: no agrega lógica, así
 * que el visor sigue congelado.
 */
export {
  buildMapRoadGeometry,
  buildRoadGeometry,
  CURB_HEIGHT,
  dashPatternFor,
  markingsFor,
  type Mesh2D,
  type RoadGeometry,
} from "./road-geometry";
export {
  BARRIER_POST_HEIGHT_M,
  BARRIER_POST_SPACING_M,
  BARRIER_RAIL_HEIGHT_M,
  BARRIER_RAIL_THICKNESS_M,
  postsAlong,
  roadDecorFor,
  type RoadDecor,
} from "./road-decor";
export {
  corridorsOf,
  distanceToRoad,
  FACADE_PALETTE,
  FACADE_PALETTE_MX,
  planEnvironment,
  terrainHeightAt,
  type Building,
  type EnvironmentPlan,
  type HillLayer,
  type Tree,
} from "./environment-decor";
export { environmentFor, type EnvironmentSettings } from "./environment";
export { actionBounds } from "./cameras";
export { headlightsOn, proceduralPoles } from "./night-lights";
export { QUALITY_PROFILES } from "./quality";
export { computeGroundMarks } from "./ground-marks";
export { brakingAt } from "./brake-lights";
export { lampAt, phaseChanges, type SignalPhase } from "./traffic-signals";
