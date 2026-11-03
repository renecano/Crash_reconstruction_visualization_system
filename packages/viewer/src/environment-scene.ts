/**
 * Mallas del entorno procedural (T1.3, ADR 0096) a partir de `environment-decor.ts`: el suelo con
 * relieve y parcelas, los edificios instanciados con fachadas procedurales, los postes de luz y
 * las cercas, y el horizonte (cerros y perfil urbano). Todo instanciado o en una sola malla:
 * cuesta pocas llamadas de dibujo aunque haya cientos de piezas.
 */
import {
  BoxGeometry,
  CircleGeometry,
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
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { toThree } from "./coords";
import { FACADE_PALETTE, SKYLINE_RADIUS_M, type EnvironmentPlan } from "./environment-decor";

/** Suelo de 800 × 800 m con relieve: una malla en coordenadas del mundo (x, altura, z). */
export interface TerrainOptions {
  /** Lado del hueco central (m): las celdas dentro no se dibujan (las cubre el parche fino). */
  hole?: number;
  /** Orilla seca (0–1) por vértice: junto a la vía (T1.3b). */
  dryAt?: (x: number, y: number) => number;
  /** Centro del terreno (m). */
  center?: { x: number; y: number };
}

export function buildTerrain(
  heightAt: (x: number, y: number) => number,
  parcels: EnvironmentPlan["parcels"],
  material: Material,
  size = 800,
  segments = 96,
  opts: TerrainOptions = {},
): Mesh {
  const n = segments + 1;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const dry = new Float32Array(n * n);
  const idx: number[] = [];
  const cx0 = opts.center?.x ?? 0;
  const cy0 = opts.center?.y ?? 0;
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
      const x = cx0 - size / 2 + (i / segments) * size;
      const y = cy0 - size / 2 + (j / segments) * size;
      const k = j * n + i;
      dry[k] = opts.dryAt ? opts.dryAt(x, y) : 0;
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
  const cell = size / segments;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      if (opts.hole) {
        // Centro de la celda dentro del hueco: no se dibuja.
        const mx = cx0 - size / 2 + (i + 0.5) * cell;
        const my = cy0 - size / 2 + (j + 0.5) * cell;
        if (Math.abs(mx - cx0) < opts.hole / 2 && Math.abs(my - cy0) < opts.hole / 2) continue;
      }
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
  g.setAttribute("_dry", new BufferAttribute(dry, 1));
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

/** Altura del poste de luz eléctrica y del travesaño (m); separación máxima para tender cables. */
export const POWER_POLE_H = 9;
export const POWER_ARM_H = 8.4;
export const POWER_WIRE_SPAN_MAX_M = 70;

/**
 * Postes de luz eléctrica de concreto (poste cónico, travesaño y tres aisladores) instanciados y
 * los cables entre postes seguidos, con su comba, en una sola malla (T1.3b).
 */
export function buildPowerPoles(
  poles: EnvironmentPlan["poles"],
  heightAt: (x: number, y: number) => number,
  material: Material,
  wireMaterial: Material = material,
): Group | null {
  if (poles.length === 0) return null;
  const g = new Group();
  g.name = "postes_luz";
  const post = new CylinderGeometry(0.11, 0.17, POWER_POLE_H, 8);
  post.translate(0, POWER_POLE_H / 2, 0);
  const arm = new BoxGeometry(2.2, 0.14, 0.14);
  arm.translate(0, POWER_ARM_H, 0);
  const insul = new CylinderGeometry(0.06, 0.07, 0.18, 6);
  const insulators = mergeGeometries(
    [-0.9, 0, 0.9].map((x) => insul.clone().translate(x, POWER_ARM_H + 0.16, 0)),
    false,
  );
  const posts = new InstancedMesh(post, material, poles.length);
  const arms = new InstancedMesh(arm, material, poles.length);
  const aisl = new InstancedMesh(insulators, material, poles.length);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const upAxis = new Vector3(0, 1, 0);
  const tops: { x: number; y: number; z: number; yaw: number }[] = [];
  poles.forEach((p, i) => {
    const [x, y, z] = toThree(p.x, p.y, heightAt(p.x, p.y));
    q.setFromAxisAngle(upAxis, p.yaw + Math.PI / 2);
    m4.compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1));
    posts.setMatrixAt(i, m4);
    arms.setMatrixAt(i, m4);
    aisl.setMatrixAt(i, m4);
    tops.push({ x, y: y + POWER_ARM_H + 0.25, z, yaw: p.yaw });
  });
  for (const im of [posts, arms, aisl]) {
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  // Cables: tres por vano (uno por aislador), en cuatro tramos con comba de 1.5 % del vano.
  const wires: BufferGeometry[] = [];
  for (let i = 0; i + 1 < tops.length; i++) {
    const a = tops[i]!;
    const b = tops[i + 1]!;
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    if (span > POWER_WIRE_SPAN_MAX_M || span < 5) continue;
    // El travesaño va perpendicular al poste: los aisladores se reparten en esa dirección.
    const px = -Math.sin(a.yaw);
    const pz = -Math.cos(a.yaw);
    for (const off of [-0.9, 0, 0.9]) {
      const segs = 4;
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs;
        const t1 = (s + 1) / segs;
        const sag = (t: number) => -0.015 * span * 4 * t * (1 - t);
        const p0 = new Vector3(
          a.x + (b.x - a.x) * t0 + px * off,
          a.y + (b.y - a.y) * t0 + sag(t0),
          a.z + (b.z - a.z) * t0 + pz * off,
        );
        const p1 = new Vector3(
          a.x + (b.x - a.x) * t1 + px * off,
          a.y + (b.y - a.y) * t1 + sag(t1),
          a.z + (b.z - a.z) * t1 + pz * off,
        );
        const len = p0.distanceTo(p1);
        const seg = new BoxGeometry(len, 0.03, 0.03);
        const mid = p0.clone().add(p1).multiplyScalar(0.5);
        const dir = p1.clone().sub(p0).normalize();
        const rot = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), dir);
        seg.applyMatrix4(new Matrix4().compose(mid, rot, new Vector3(1, 1, 1)));
        wires.push(seg);
      }
    }
  }
  if (wires.length > 0) {
    const cables = new Mesh(mergeGeometries(wires, false), wireMaterial);
    cables.name = "cables";
    for (const w of wires) w.dispose();
    g.add(cables);
  }
  return g;
}

/** Señales de tránsito genéricas (T1.3b): poste y placa por tipo, sin texto ni número real. */
export function buildSigns(
  signs: EnvironmentPlan["signs"],
  heightAt: (x: number, y: number) => number,
  mats: { post: Material; red: Material; white: Material; blue: Material },
): Group | null {
  if (signs.length === 0) return null;
  const g = new Group();
  g.name = "senales";
  const post = new CylinderGeometry(0.035, 0.035, 2.4, 8);
  post.translate(0, 1.2, 0);
  const plate = (geo: BufferGeometry, y: number) => geo.translate(0, y, 0);
  const kinds = {
    alto: { geos: [{ geo: plate(new CircleGeometry(0.38, 8), 2.5), mat: mats.red }] },
    ceda: {
      geos: [
        { geo: plate(new CircleGeometry(0.42, 3).rotateZ(-Math.PI / 2), 2.5), mat: mats.red },
        {
          geo: plate(new CircleGeometry(0.3, 3).rotateZ(-Math.PI / 2).translate(0, 0, 0.01), 2.5),
          mat: mats.white,
        },
      ],
    },
    velocidad: {
      geos: [
        { geo: plate(new CircleGeometry(0.38, 24), 2.5), mat: mats.red },
        { geo: plate(new CircleGeometry(0.3, 24).translate(0, 0, 0.01), 2.5), mat: mats.white },
      ],
    },
    informativa: { geos: [{ geo: plate(new BoxGeometry(0.7, 0.5, 0.02), 2.5), mat: mats.blue }] },
  } as const;
  const m4 = new Matrix4();
  const q = new Quaternion();
  const upAxis = new Vector3(0, 1, 0);
  for (const kind of Object.keys(kinds) as (keyof typeof kinds)[]) {
    const list = signs.filter((s) => s.kind === kind);
    if (list.length === 0) continue;
    const meshes = [
      new InstancedMesh(post, mats.post, list.length),
      ...kinds[kind].geos.map((p) => new InstancedMesh(p.geo, p.mat, list.length)),
    ];
    list.forEach((s, i) => {
      const [x, y, z] = toThree(s.x, s.y, heightAt(s.x, s.y));
      // La placa mira a la calle (hacia donde venía el tránsito): perpendicular a la vía.
      q.setFromAxisAngle(upAxis, s.yaw);
      m4.compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1));
      for (const im of meshes) im.setMatrixAt(i, m4);
    });
    for (const im of meshes) {
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.computeBoundingSphere();
      im.name = `senal_${kind}`;
      g.add(im);
    }
  }
  return g;
}

/** Cercas rurales (T1.3b): postes de 12 cm cada 4 m y dos alambres de 2.5 cm por tramo. */
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
    const n = Math.max(1, Math.floor(len / 4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      positions.push({ x: f.a.x + (f.b.x - f.a.x) * t, y: f.a.y + (f.b.y - f.a.y) * t });
    }
    const wire = new BoxGeometry(len, 0.025, 0.025);
    for (const h of [0.55, 1.1]) {
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
  // Cada capa es una banda: anillo completo o arco. Las lejanas, más claras (perspectiva aérea),
  // por color de vértice sobre el material de silueta.
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const farthest = Math.max(...plan.hills.map((h) => h.radius), 1);
  for (const capa of plan.hills) {
    const n = capa.heights.length;
    const closed = capa.to - capa.from >= Math.PI * 2 - 1e-6;
    const base = pos.length / 3;
    const tint = 0.35 * (capa.radius / farthest);
    for (let i = 0; i < n; i++) {
      const a = capa.from + ((capa.to - capa.from) * i) / (closed ? n : n - 1);
      const x = center.x + Math.cos(a) * capa.radius;
      const y = center.y + Math.sin(a) * capa.radius;
      const [bx, by, bz] = toThree(x, y, -3);
      const [tx, ty, tz] = toThree(x, y, capa.heights[i] ?? 0);
      pos.push(bx, by, bz, tx, ty, tz);
      col.push(1 + tint, 1 + tint, 1 + tint * 1.2, 1 + tint, 1 + tint, 1 + tint * 1.2);
      const j = closed ? (i + 1) % n : i + 1;
      if (j >= n) continue;
      const a0 = base + 2 * i;
      const a1 = base + 2 * j;
      // Caras hacia adentro (la cámara está dentro del anillo).
      idx.push(a0, a0 + 1, a1, a0 + 1, a1 + 1, a1);
    }
  }
  if (pos.length > 0) {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const hills = new Mesh(geo, hillMaterial);
    hills.name = "cerros";
    hills.frustumCulled = false;
    g.add(hills);
  }
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
