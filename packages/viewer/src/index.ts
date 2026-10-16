/**
 * @croquis/viewer — visor 3D. Este punto de entrada solo expone módulos puros (sin React ni
 * renderer); el componente vive en `@croquis/viewer/react`.
 */
export * from "./quality";
export * from "./coords";
export * from "./sample";
export * from "./timeline";
export * from "./clock";
export * from "./backend-choice";
export * from "./cameras";
export * from "./environment";
export {
  buildRoadGeometry,
  meshArea,
  stripLineOffsets,
  type Mesh2D,
  type RoadGeometry,
  type RoadOptions,
} from "./road-geometry";
export {
  axlePositions,
  buildVehicle,
  PROFILES,
  profileFor,
  seatHeight,
  wheelNames,
  type PartRole,
  type VehicleDimensions,
} from "./vehicle-geometry";
export { applyPosture, buildMannequin, CG_HEIGHT_FACTOR, type Posture } from "./person-geometry";
export {
  buildSceneGraph,
  hash01,
  mesh2DToGeometry,
  type PersonNode,
  type SceneGraph,
  type SceneGraphOptions,
  type VehicleNode,
} from "./scene-graph";
export * from "./airbag";
export {
  applyVehicleDamage,
  CONTACT_DURATION_S,
  crushAt,
  damageInfluence,
  displacementField,
  measureCrushProfile,
  type DamageInput,
  type DamageSide,
  type VehicleDamage,
} from "./damage";
export { buildDamageRig, type DamageRig } from "./damage-rig";
export { computeGroundMarks, puddleRadius, visibleCount, type GroundMarks } from "./ground-marks";
export { bakeDebris, debrisPoseAt, mulberry32, type DebrisBake, type DebrisSpec } from "./debris";
export { attachDebris, planDebris, type DebrisAttachment, type DebrisPlan } from "./debris-scene";
export * from "./body-assets";
export * from "./person-pose";
export * from "./person-ragdoll";
export * from "./people-scene";
export * from "./rollover-scene";
export * from "./visibility-overlay";
export * from "./shadow-frame";
export {
  buildGhostLayer,
  compareHypotheses,
  GHOST_COLOR,
  GHOST_COLORS,
  MAX_HYPOTHESES,
  type GhostLayer,
  type VehicleDiff,
} from "./ghosts";
export * from "./precipitation";
export { buildPrecipitation, type PrecipitationAttachment } from "./precipitation-scene";
export {
  asphaltMaterial,
  patchThreshold,
  SURFACE_LOOK,
  type AsphaltMaterial,
  type SurfaceLook,
} from "./road-surface";
export * from "./night-lights";
