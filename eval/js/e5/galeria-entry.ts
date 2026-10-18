/**
 * Render de la galería de E5 (lo empaqueta `e5_galeria.ts` con esbuild y lo corre en Chromium). Arma
 * el vehículo como el visor (malla, materiales y pintura dañada) con el daño que predice Croquis
 * para el caso, lo encuadra desde la vista de la foto real y dibuja la franja con la leyenda.
 */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGPURenderer,
} from "three/webgpu";
import {
  applyVehicleDamage,
  buildVehicle,
  drawLegendBand,
  vehicleMaterials,
} from "@croquis/viewer";
import type { PartRole } from "@croquis/viewer";
import { damagedPaintMaterial } from "../../../packages/viewer/src/damage-material";
import { dimensions, predict, seedFor, type Caso } from "./reproducir";

/** Color neutro de la carrocería (las fotos son de autos de muchos colores). */
const PAINT = "#b8bcc2";

/**
 * Dirección desde el vehículo hacia la cámara (marco del visor: x adelante, −z izquierda) según la
 * leyenda de la foto («Post-Test Left Front 3/4 View…»).
 */
export function viewDirection(caption: string, lado: string): Vector3 {
  const w = new Set(caption.toLowerCase().match(/[a-z]+/g) ?? []);
  let x = 0;
  let z = 0;
  if (w.has("front") || w.has("frontal")) x += 1;
  if (w.has("rear") || w.has("back")) x -= 1;
  if (w.has("left") || w.has("driver")) z -= 1;
  if (w.has("right") || w.has("passenger")) z += 1;
  if (x === 0 && z === 0) {
    x = lado === "F" ? 1 : lado === "B" ? -1 : 0;
    z = lado === "L" ? -1 : lado === "R" ? 1 : 0;
  }
  // Altura de un fotógrafo a pie: unos 10° sobre el horizonte.
  return new Vector3(x, 0.18 * Math.hypot(x, z), z).normalize();
}

export interface RenderOptions {
  caso: Caso;
  vista: string;
  lineas: string[];
  width: number;
  height: number;
}

/** Imagen JPEG (data URL) del vehículo con el daño de Croquis, o el motivo si no se reproduce. */
export async function render(o: RenderOptions): Promise<string> {
  const pred = predict(o.caso);
  if (typeof pred === "string") throw new Error(`Caso no reproducible: ${pred}`);
  const d = dimensions(o.caso)!;
  const group = buildVehicle(o.caso.clase, d);
  const vm = vehicleMaterials(PAINT, false);
  group.traverse((m) => {
    if (m instanceof Mesh) {
      m.material = vm[m.userData.role as PartRole] ?? vm.plastico;
      m.castShadow = true;
    }
  });
  const dmg = applyVehicleDamage(group, o.caso.clase, d, {
    lado: o.caso.lado,
    perfil: pred.perfil,
    ancho: pred.ancho,
    centro: pred.centro,
    seed: seedFor(o.caso.id),
  });
  for (const md of dmg.meshes) {
    if (!md.mesh.userData.damaged) continue;
    if (md.mesh.morphTargetInfluences) md.mesh.morphTargetInfluences[0] = 1;
    if (md.mesh.userData.role === "pintura") {
      const paint = damagedPaintMaterial(PAINT);
      paint.influence.value = 1;
      md.mesh.material = paint.material;
    }
  }

  const scene = new Scene();
  scene.background = new Color("#d9dbde");
  const floor = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: "#a7a9ab", roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor, group);
  scene.add(new HemisphereLight("#ffffff", "#7d7f82", 1.6), new AmbientLight("#ffffff", 0.25));
  const sun = new DirectionalLight("#ffffff", 2.2);
  sun.position.set(6, 12, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 40 });
  scene.add(sun);

  // Encuadre: el vehículo completo desde la dirección de la foto, como un fotógrafo a pie.
  const box = new Box3().setFromObject(group);
  const center = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const camera = new PerspectiveCamera(35, o.width / o.height, 0.1, 200);
  const dir = viewDirection(o.vista, o.caso.lado);
  // Se centra la proyección de la caja y se acerca hasta que ocupe ~80 % del cuadro (el alto
  // cuenta un poco más por la franja de la leyenda).
  let dist = radius / Math.sin(((camera.fov / 2) * Math.PI) / 180);
  const target = center.clone();
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) =>
      new Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ),
  );
  const tanY = Math.tan(((camera.fov / 2) * Math.PI) / 180);
  const right = new Vector3();
  const up = new Vector3();
  for (let k = 0; k < 6; k++) {
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const ps = corners.map((c) => c.clone().project(camera));
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    target
      .addScaledVector(right, ((x0 + x1) / 2) * tanY * camera.aspect * dist)
      .addScaledVector(up, ((y0 + y1) / 2) * tanY * dist);
    dist *= Math.max((x1 - x0) / 2, ((y1 - y0) / 2) * 1.15) / 0.8;
  }
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.lookAt(target);

  const canvas = document.createElement("canvas");
  canvas.width = o.width;
  canvas.height = o.height;
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
  renderer.shadowMap.enabled = true;
  renderer.setSize(o.width, o.height, false);
  await renderer.init();
  await renderer.renderAsync(scene, camera);

  const out = document.createElement("canvas");
  out.width = o.width;
  out.height = o.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  drawLegendBand(ctx, o.width, o.height, o.lineas);
  void renderer.dispose();
  return out.toDataURL("image/jpeg", 0.85);
}
