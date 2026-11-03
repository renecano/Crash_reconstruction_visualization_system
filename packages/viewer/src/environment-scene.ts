/**
 * Mallas del entorno procedural (T1.3, ADR 0096) a partir de `environment-decor.ts`: el suelo con
 * relieve y parcelas, los edificios instanciados con fachadas procedurales, los postes de luz y
 * las cercas, y el horizonte (cerros y perfil urbano). Todo instanciado o en una sola malla:
 * cuesta pocas llamadas de dibujo aunque haya cientos de piezas.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type Material,
} from "three";
import {
  abs,
  color,
  float,
  fract,
  hash,
  instanceIndex,
  instancedBufferAttribute,
  mix,
  normalLocal,
  positionGeometry,
  select,
  smoothstep,
  step,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { toThree } from "./coords";
import {
  FACADE_PALETTE,
  HILLS_RADIUS_M,
  SKYLINE_RADIUS_M,
  type EnvironmentPlan,
} from "./environment-decor";

/** Suelo de 800 × 800 m con relieve: una malla en coordenadas del mundo (x, altura, z). */
export function buildTerrain(
  heightAt: (x: number, y: number) => number,
  parcels: EnvironmentPlan["parcels"],
  material: Material,
  size = 800,
  segments = 96,
): Mesh {
  const n = segments + 1;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const idx: number[] = [];
  const inParcel = (x: number, y: number): number | null => {
    for (const p of parcels) {
      // Cuadrilátero convexo: el punto está dentro si queda del mismo lado de los cuatro lados.
      let inside = true;
      for (let i = 0; i < 4 && inside; i++) {
        const a = p.corners[i]!;
        const b = p.corners[(i + 1) % 4]!;
        if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) inside = false;
      }
      if (inside) return p.tone;
    }
    return null;
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -size / 2 + (i / segments) * size;
      const y = -size / 2 + (j / segments) * size;
      const k = j * n + i;
      const [tx, ty, tz] = toThree(x, y, heightAt(x, y));
      pos[3 * k] = tx;
      pos[3 * k + 1] = ty;
      pos[3 * k + 2] = tz;
      // Parcelas: tonos entre el pasto (verde) y el barbecho (ocre), por vértice.
      const tone = inParcel(x, y);
      const t = tone === null ? 0 : tone;
      col[3 * k] = 1 + 0.35 * t;
      col[3 * k + 1] = 1 + 0.12 * t;
      col[3 * k + 2] = 1 - 0.2 * t;
    }
  }
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // Antihorario visto desde arriba (y de three hacia arriba) para que la normal apunte arriba.
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new Mesh(g, material);
  mesh.name = "suelo";
  return mesh;
}

const FLOOR_M = 3.2;

/** Edificios instanciados (un cubo unitario escalado) con su fachada procedural. */
export function buildBuildings(
  buildings: EnvironmentPlan["buildings"],
  heightAt: (x: number, y: number) => number,
  night: boolean,
): InstancedMesh | null {
  if (buildings.length === 0) return null;
  const geo = new BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const dimsArr = new Float32Array(buildings.length * 3);
  const tint = new Float32Array(buildings.length * 3);
  buildings.forEach((b, i) => {
    dimsArr.set([b.w, b.h, b.d], 3 * i);
    const c = new Color(FACADE_PALETTE[b.color % FACADE_PALETTE.length]);
    tint.set([c.r, c.g, c.b], 3 * i);
  });
  const dims = new InstancedBufferAttribute(dimsArr, 3);
  const tintAttr = new InstancedBufferAttribute(tint, 3);
  geo.setAttribute("_dims", dims);
  geo.setAttribute("_tint", tintAttr);
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const d = instancedBufferAttribute<"vec3">(dims, "vec3");
  const base = instancedBufferAttribute<"vec3">(tintAttr, "vec3");
  // Coordenadas de fachada en metros: a lo largo de la cara y hacia arriba.
  const sideX = abs(normalLocal.x).greaterThan(0.5);
  const along = select(sideX, positionGeometry.z.mul(d.z), positionGeometry.x.mul(d.x));
  const up = positionGeometry.y.mul(d.y);
  const isWall = abs(normalLocal.y).lessThan(0.5);
  // Ventanas de 1.4 m cada 3 m, entre 1.0 y 2.2 m de cada nivel, salvo el último medio metro.
  const wx = fract(along.div(3).add(0.5));
  const wy = fract(up.div(FLOOR_M));
  const win = step(0.33, wx)
    .mul(step(wx, 0.67))
    .mul(step(0.36, wy))
    .mul(step(wy, 0.7))
    .mul(step(up, d.y.sub(0.6)))
    .mul(select(isWall, float(1), float(0)));
  // Zócalo un poco más oscuro en el primer metro.
  const zocalo = smoothstep(float(1.2), float(0.8), up).mul(select(isWall, float(1), float(0)));
  const facade = mix(base, base.mul(0.75), zocalo);
  const glass = color("#283240");
  m.colorNode = mix(facade, glass, win);
  if (night) {
    // Un tercio de los edificios con luz: ventanas cálidas por instancia (hash de la instancia).
    const lit = step(0.66, hash(instanceIndex.add(7)));
    m.emissiveNode = vec3(1.0, 0.85, 0.55).mul(win).mul(lit).mul(0.9);
  }
  const mesh = new InstancedMesh(geo, m, buildings.length);
  mesh.name = "edificios";
  const m4 = new Matrix4();
  const q = new Quaternion();
  const upAxis = new Vector3(0, 1, 0);
  buildings.forEach((b, i) => {
    const [x, y, z] = toThree(b.x, b.y, heightAt(b.x, b.y) - 0.05);
    // `yaw` es matemático (desde +x hacia +y); en three el giro sobre Y invierte el sentido.
    q.setFromAxisAngle(upAxis, b.yaw);
    m4.compose(new Vector3(x, y, z), q, new Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Postes de luz eléctrica (poste y travesaño) instanciados. */
export function buildPowerPoles(
  poles: EnvironmentPlan["poles"],
  heightAt: (x: number, y: number) => number,
  material: Material,
): Group | null {
  if (poles.length === 0) return null;
  const g = new Group();
  g.name = "postes_luz";
  const post = new CylinderGeometry(0.13, 0.16, 9, 8);
  post.translate(0, 4.5, 0);
  const arm = new BoxGeometry(1.8, 0.12, 0.12);
  arm.translate(0, 8.4, 0);
  const posts = new InstancedMesh(post, material, poles.length);
  const arms = new InstancedMesh(arm, material, poles.length);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const upAxis = new Vector3(0, 1, 0);
  poles.forEach((p, i) => {
    const [x, y, z] = toThree(p.x, p.y, heightAt(p.x, p.y));
    q.setFromAxisAngle(upAxis, p.yaw + Math.PI / 2);
    m4.compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1));
    posts.setMatrixAt(i, m4);
    arms.setMatrixAt(i, m4);
  });
  for (const im of [posts, arms]) {
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

/** Cercas rurales: postes cada 3 m y dos alambres (cajas finas) por tramo. */
export function buildFences(
  fences: EnvironmentPlan["fences"],
  heightAt: (x: number, y: number) => number,
  material: Material,
): Group | null {
  if (fences.length === 0) return null;
  const g = new Group();
  g.name = "cercas";
  const positions: { x: number; y: number }[] = [];
  for (const f of fences) {
    const len = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
    const n = Math.max(1, Math.floor(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      positions.push({ x: f.a.x + (f.b.x - f.a.x) * t, y: f.a.y + (f.b.y - f.a.y) * t });
    }
    // Un solo travesaño de 5 cm: los alambres finos se veían como rayas sueltas de lejos.
    const wire = new BoxGeometry(len, 0.05, 0.05);
    for (const h of [1.05]) {
      const mesh = new Mesh(wire, material);
      const [x, y, z] = toThree((f.a.x + f.b.x) / 2, (f.a.y + f.b.y) / 2, 0);
      mesh.position.set(x, y + h + heightAt((f.a.x + f.b.x) / 2, (f.a.y + f.b.y) / 2), z);
      mesh.rotation.y = Math.atan2(f.b.y - f.a.y, f.b.x - f.a.x);
      g.add(mesh);
    }
  }
  const post = new CylinderGeometry(0.06, 0.07, 1.3, 6);
  post.translate(0, 0.65, 0);
  const posts = new InstancedMesh(post, material, positions.length);
  const m4 = new Matrix4();
  positions.forEach((p, i) => {
    const [x, y, z] = toThree(p.x, p.y, heightAt(p.x, p.y));
    m4.makeTranslation(x, y, z);
    posts.setMatrixAt(i, m4);
  });
  posts.instanceMatrix.needsUpdate = true;
  posts.computeBoundingSphere();
  g.add(posts);
  return g;
}

/**
 * Horizonte: un anillo de cerros (banda vertical con la altura de cada segmento) a
 * `HILLS_RADIUS_M` y, en ciudad, bloques lejanos a `SKYLINE_RADIUS_M`. La niebla los funde con el
 * cielo; no proyectan ni reciben sombra.
 */
export function buildHorizon(
  plan: Pick<EnvironmentPlan, "hills" | "skyline" | "zone">,
  center: { x: number; y: number },
  hillMaterial: Material,
  blockMaterial: Material,
): Group {
  const g = new Group();
  g.name = "horizonte";
  const n = plan.hills.length;
  const pos = new Float32Array(n * 2 * 3);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = center.x + Math.cos(a) * HILLS_RADIUS_M;
    const y = center.y + Math.sin(a) * HILLS_RADIUS_M;
    const [bx, by, bz] = toThree(x, y, -2);
    const [tx, ty, tz] = toThree(x, y, plan.hills[i] ?? 0);
    pos.set([bx, by, bz, tx, ty, tz], 6 * i);
    const j = (i + 1) % n;
    // Caras hacia adentro (la cámara está dentro del anillo).
    idx.push(2 * i, 2 * i + 1, 2 * j, 2 * i + 1, 2 * j + 1, 2 * j);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const hills = new Mesh(geo, hillMaterial);
  hills.name = "cerros";
  hills.frustumCulled = false;
  g.add(hills);
  if (plan.skyline.length > 0) {
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const blocks = new InstancedMesh(box, blockMaterial, plan.skyline.length);
    blocks.name = "perfil_urbano";
    const m4 = new Matrix4();
    const q = new Quaternion();
    const upAxis = new Vector3(0, 1, 0);
    plan.skyline.forEach((b, i) => {
      const x = center.x + Math.cos(b.angle) * SKYLINE_RADIUS_M;
      const y = center.y + Math.sin(b.angle) * SKYLINE_RADIUS_M;
      const [tx, ty, tz] = toThree(x, y, -1);
      q.setFromAxisAngle(upAxis, -b.angle);
      const w = b.span * SKYLINE_RADIUS_M;
      m4.compose(new Vector3(tx, ty, tz), q, new Vector3(Math.max(6, w), b.height, 10));
      blocks.setMatrixAt(i, m4);
    });
    blocks.instanceMatrix.needsUpdate = true;
    blocks.frustumCulled = false;
    g.add(blocks);
  }
  return g;
}
