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
