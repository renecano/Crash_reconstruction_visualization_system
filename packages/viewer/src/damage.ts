/**
 * Deformación plástica desde el perfil de aplastamiento del solver (PLAN §7.3.1, ADR 0007).
 *
 * El solver entrega, por vehículo, el perfil CRASH3 de 6 puntos (C1–C6) sobre el ancho dañado,
 * su centro a lo largo de la cara y la zona CDC. Aquí ese perfil se convierte en un campo de
 * desplazamiento por vértice en el marco del vehículo:
 *
 *   d(p) = n_in · c(u) · m(y) · w(δ)  +  arrugas
 *
 * con u la coordenada a lo largo de la cara (C1 en el extremo izquierdo en frente y atrás, en el
 * delantero en los costados, como en CRASH3), c(u) el perfil interpolado (con caída suave de
 * 15 cm fuera del ancho dañado), m(y) la máscara vertical de la zona CDC, δ la profundidad del
 * vértice detrás de la cara y w(δ) = 1 − smoothstep(0, 1.6·c + 0.3, δ): la cara se mueve
 * exactamente c(u) y el material detrás se comprime sin plegarse (la pendiente de w nunca deja
 * que un punto rebase al de atrás). Las arrugas son ruido con semilla (±3 % de c) suavizado con
 * dos pasadas laplacianas sobre la malla soldada. El campo se calcula en CPU una vez (es
 * determinista, se puede probar y se exporta a glTF) y se hornea como morph target que la GPU
 * mezcla durante la fase de contacto.
 *
 * Marco: x adelante, y arriba, z = −izquierda.
 */
import { BufferAttribute, type BufferGeometry, type Group, Mesh, Vector3 } from "three";
import { profileFor, type VehicleDimensions } from "./vehicle-geometry";

export type DamageSide = "F" | "B" | "L" | "R";

export interface DamageInput {
  lado: DamageSide;
  /** Perfil C1–C6 (m). */
  perfil: readonly number[];
  /** Ancho dañado (m). */
  ancho: number;
  /** Centro del ancho dañado a lo largo de la cara (m; + izquierda en F/B, + adelante en L/R). */
  centro: number;
  zonaVertical?: string;
  /** Semilla del ruido de las arrugas. */
  seed: number;
  /** Color del otro vehículo (transferencia de pintura), si lo hay. */
  otherColor?: string;
}

/** Duración de la fase de contacto animada (s); PLAN §7.3 habla de ~100–150 ms. */
export const CONTACT_DURATION_S = 0.12;
export const TAPER_M = 0.15;
const WRINKLE = 0.03;

export interface FaceFrame {
  /** Eje hacia afuera de la cara (unitario, marco del vehículo). */
  outward: Vector3;
  /** Eje a lo largo de la cara (u positivo). */
  along: Vector3;
  /** Coordenada de la cara sobre `outward`. */
  face: number;
}

export function faceFrame(lado: DamageSide, d: VehicleDimensions): FaceFrame {
  switch (lado) {
    case "F":
      return { outward: new Vector3(1, 0, 0), along: new Vector3(0, 0, -1), face: d.length / 2 };
    case "B":
      return { outward: new Vector3(-1, 0, 0), along: new Vector3(0, 0, -1), face: d.length / 2 };
    case "L":
      return { outward: new Vector3(0, 0, -1), along: new Vector3(1, 0, 0), face: d.width / 2 };
    case "R":
      return { outward: new Vector3(0, 0, 1), along: new Vector3(1, 0, 0), face: d.width / 2 };
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Aplastamiento c(u) del perfil a lo largo de la cara, con caída suave fuera del ancho. */
export function crushAt(
  input: Pick<DamageInput, "perfil" | "ancho" | "centro">,
  u: number,
): number {
  const p = input.perfil;
  if (p.length !== 6 || input.ancho <= 0) return 0;
  // C1 está en el extremo izquierdo (frente y atrás) o delantero (costados): u máximo.
  const s = 0.5 - (u - input.centro) / input.ancho;
  if (s >= 0 && s <= 1) {
    const x = s * 5;
    const i = Math.min(4, Math.floor(x));
    const f = x - i;
    return (p[i] ?? 0) + ((p[i + 1] ?? 0) - (p[i] ?? 0)) * f;
  }
  const edge = s < 0 ? (p[0] ?? 0) : (p[5] ?? 0);
  const out = (s < 0 ? -s : s - 1) * input.ancho;
  return edge * (1 - smoothstep(0, TAPER_M, out));
}

/** Rango vertical [y0, y1] de la zona CDC (SAE J224) en este vehículo. */
function clearanceAndBelt(clase: string, d: VehicleDimensions): [number, number] {
  const p = profileFor(clase);
  const clr = p.kind === "car" ? Math.min(p.clearance, 0.3 * d.height) : 0.2;
  const belt = p.kind === "car" ? Math.max(clr + 0.25, p.belt * d.height) : 0.7 * d.height;
  return [clr, belt];
}

/**
 * Banda donde se mide el perfil: la estructura (de la altura libre a la cintura) salvo en las
 * zonas de cofre o ventanas, que se miden en su propio rango. Así coincide con lo que mide
 * CRASH3 (aplastamiento de la estructura) y no con el habitáculo, que queda detrás de la cara.
 */
export function measurementBand(
  zona: string | undefined,
  clase: string,
  d: VehicleDimensions,
): [number, number] {
  const range = verticalRange(zona, clase, d);
  if (zona === "W" || zona === "H") return range;
  const [clr, belt] = clearanceAndBelt(clase, d);
  const lo = Math.max(range[0], clr + 0.05);
  const hi = Math.min(range[1], belt - 0.05);
  return hi > lo ? [lo, hi] : range;
}

export function verticalRange(
  zona: string | undefined,
  clase: string,
  d: VehicleDimensions,
): [number, number] {
  const [clr, belt] = clearanceAndBelt(clase, d);
  switch (zona) {
    case "A":
      return [0, d.height];
    case "G":
      return [0, belt];
    case "H":
      return [belt - 0.15, belt + 0.25];
    case "L":
      return [clr, clr + 0.45];
    case "M":
      return [clr + 0.35, belt];
    case "W":
      return [belt, d.height];
    default:
      return [clr, d.height]; // E: todo salvo los bajos
  }
}

function verticalMask(range: [number, number], y: number): number {
  const edge = 0.1;
  return (
    smoothstep(range[0] - edge, range[0] + edge, y) *
    (1 - smoothstep(range[1] - edge, range[1] + edge, y))
  );
}

// Ruido de valor 3D determinista (hash + interpolación suave).
function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
        v += w * hash3(ix + dx, iy + dy, iz + dz, seed);
      }
    }
  }
  return 2 * v - 1;
}

export interface DisplacementField {
  frame: FaceFrame;
  range: [number, number];
  /** Banda vertical donde se mide el perfil. */
  band: [number, number];
  /** Desplazamiento principal (sin arrugas) y peso en [0, 1] para un punto. */
  at(p: Vector3): { disp: Vector3; weight: number; crush: number };
}

export function displacementField(
  input: DamageInput,
  clase: string,
  d: VehicleDimensions,
): DisplacementField {
  const frame = faceFrame(input.lado, d);
  const range = verticalRange(input.zonaVertical, clase, d);
  const inward = frame.outward.clone().negate();
  return {
    frame,
    range,
    band: measurementBand(input.zonaVertical, clase, d),
    at(p) {
      const u = p.dot(frame.along);
      const c = crushAt(input, u);
      if (c <= 0) return { disp: new Vector3(), weight: 0, crush: 0 };
      const depth = Math.max(0, frame.face - p.dot(frame.outward));
      const w = 1 - smoothstep(0, 1.6 * c + 0.3, depth);
      const m = verticalMask(range, p.y);
      const k = c * m * w;
      return { disp: inward.clone().multiplyScalar(k), weight: m * w, crush: c };
    },
  };
}

/** Vértices soldados por posición (las mallas fusionadas no son indexadas). */
function weld(
  pos: BufferAttribute,
  index: BufferAttribute | null,
): { ids: Int32Array; count: number; tris: number[] } {
  const map = new Map<string, number>();
  const ids = new Int32Array(pos.count);
  let count = 0;
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = count++;
      map.set(key, id);
    }
    ids[i] = id;
  }
  const tris: number[] = [];
  const n = index ? index.count : pos.count;
  for (let i = 0; i < n; i++) tris.push(ids[index ? index.getX(i) : i] ?? 0);
  return { ids, count, tris };
}

export interface MeshDamage {
  mesh: Mesh;
  maxDisplacement: number;
}

/**
 * Hornea la deformación como morph target relativo (posiciones y normales) y agrega los
 * atributos `dano` (0–1) y `transferencia` (0–1) para el material. Devuelve el desplazamiento
 * máximo. No toca la geometría base: con influencia 0 el vehículo queda intacto.
 */
export function bakeMeshDamage(
  mesh: Mesh,
  field: DisplacementField,
  input: DamageInput,
): MeshDamage {
  const geo = mesh.geometry;
  mesh.updateMatrix();
  const pos = geo.getAttribute("position") as BufferAttribute;
  const nor = geo.getAttribute("normal") as BufferAttribute | undefined;
  const index = geo.getIndex();
  const toVehicle = mesh.matrix;
  const toLocal = mesh.matrix.clone().invert();
  const { ids, count, tris } = weld(pos, index);
  // Desplazamiento principal y arrugas por vértice soldado (en el marco del vehículo).
  const main: Vector3[] = Array.from({ length: count }, () => new Vector3());
  const noise = new Float32Array(count * 3);
  const weight = new Float32Array(count);
  const seen = new Uint8Array(count);
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const id = ids[i] ?? 0;
    if (seen[id]) continue;
    seen[id] = 1;
    p.fromBufferAttribute(pos, i).applyMatrix4(toVehicle);
    const r = field.at(p);
    main[id] = r.disp;
    weight[id] = r.weight;
    if (r.weight > 0) {
      const a = WRINKLE * r.crush * r.weight;
      noise[3 * id] = a * valueNoise(p.x * 7, p.y * 7, p.z * 7, input.seed);
      noise[3 * id + 1] = a * valueNoise(p.x * 7 + 31, p.y * 7, p.z * 7, input.seed);
      noise[3 * id + 2] = a * valueNoise(p.x * 7, p.y * 7 + 17, p.z * 7, input.seed);
    }
  }
  // Suavizado laplaciano de las arrugas (2 pasadas, λ = 0.5).
  const adj: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const a = tris[t] ?? 0;
    const b = tris[t + 1] ?? 0;
    const c = tris[t + 2] ?? 0;
    adj[a]?.push(b, c);
    adj[b]?.push(a, c);
    adj[c]?.push(a, b);
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(noise);
    for (let v = 0; v < count; v++) {
      const nb = adj[v] ?? [];
      if (nb.length === 0 || weight[v] === 0) continue;
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (const j of nb) sum += noise[3 * j + k] ?? 0;
        next[3 * v + k] = 0.5 * (noise[3 * v + k] ?? 0) + 0.5 * (sum / nb.length);
      }
    }
    noise.set(next);
  }
  // Morph target relativo en el marco de la malla.
  const delta = new Float32Array(pos.count * 3);
  const dano = new Float32Array(pos.count);
  const transfer = new Float32Array(pos.count);
  const linear = toLocal.clone().setPosition(0, 0, 0);
  let maxDisp = 0;
  const dv = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const id = ids[i] ?? 0;
    dv.copy(main[id] ?? new Vector3());
    dv.x += noise[3 * id] ?? 0;
    dv.y += noise[3 * id + 1] ?? 0;
    dv.z += noise[3 * id + 2] ?? 0;
    const mag = dv.length();
    maxDisp = Math.max(maxDisp, mag);
    dv.applyMatrix4(linear);
    delta[3 * i] = dv.x;
    delta[3 * i + 1] = dv.y;
    delta[3 * i + 2] = dv.z;
    dano[i] = Math.min(1, mag / 0.25);
    if (input.otherColor && mag > 0.005) {
      p.fromBufferAttribute(pos, i).applyMatrix4(toVehicle);
      const n = 0.5 + 0.5 * valueNoise(p.x * 12, p.y * 12, p.z * 12, input.seed + 7);
      transfer[i] = Math.min(1, (weight[id] ?? 0) * 1.4) * (n > 0.45 ? 1 : 0.25);
    }
  }
  geo.morphAttributes.position = [new BufferAttribute(delta, 3)];
  geo.morphTargetsRelative = true;
  if (nor) {
    // Normales del estado deformado: facetadas donde hay daño, las originales donde no.
    const ndelta = new Float32Array(pos.count * 3);
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const n = new Vector3();
    const triCount = (index ? index.count : pos.count) / 3;
    for (let t = 0; t < triCount; t++) {
      const ia = index ? index.getX(3 * t) : 3 * t;
      const ib = index ? index.getX(3 * t + 1) : 3 * t + 1;
      const ic = index ? index.getX(3 * t + 2) : 3 * t + 2;
      a.fromBufferAttribute(pos, ia).add(
        new Vector3(delta[3 * ia], delta[3 * ia + 1], delta[3 * ia + 2]),
      );
      b.fromBufferAttribute(pos, ib).add(
        new Vector3(delta[3 * ib], delta[3 * ib + 1], delta[3 * ib + 2]),
      );
      c.fromBufferAttribute(pos, ic).add(
        new Vector3(delta[3 * ic], delta[3 * ic + 1], delta[3 * ic + 2]),
      );
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      for (const vi of [ia, ib, ic]) {
        const k = Math.min(1, (dano[vi] ?? 0) * 6);
        if (k === 0) continue;
        const ox = nor.getX(vi);
        const oy = nor.getY(vi);
        const oz = nor.getZ(vi);
        const bx = ox + (n.x - ox) * k;
        const by = oy + (n.y - oy) * k;
        const bz = oz + (n.z - oz) * k;
        const l = Math.hypot(bx, by, bz) || 1;
        ndelta[3 * vi] = bx / l - ox;
        ndelta[3 * vi + 1] = by / l - oy;
        ndelta[3 * vi + 2] = bz / l - oz;
      }
    }
    geo.morphAttributes.normal = [new BufferAttribute(ndelta, 3)];
  }
  geo.setAttribute("dano", new BufferAttribute(dano, 1));
  geo.setAttribute("transferencia", new BufferAttribute(transfer, 1));
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences = [0];
  mesh.userData.damaged = maxDisp > 0;
  return { mesh, maxDisplacement: maxDisp };
}

export interface WheelDamage {
  obj: Group;
  /** Corrimiento hacia adentro (marco del vehículo) con influencia 1. */
  shift: Vector3;
  /** Giro de la llanta alrededor del eje vertical (rad) con influencia 1. */
  toe: number;
}

export interface VehicleDamage {
  meshes: MeshDamage[];
  wheels: WheelDamage[];
  maxCrush: number;
  field: DisplacementField;
}

/** Aplica la deformación a todas las mallas visibles del vehículo (salvo llantas). */
export function applyVehicleDamage(
  group: Group,
  clase: string,
  d: VehicleDimensions,
  input: DamageInput,
): VehicleDamage {
  const field = displacementField(input, clase, d);
  const meshes: MeshDamage[] = [];
  const wheels: WheelDamage[] = [];
  for (const child of group.children) {
    if (child instanceof Mesh && child.visible)
      meshes.push(bakeMeshDamage(child as Mesh, field, input));
  }
  // Llantas: si el aplastamiento alcanza la llanta, se recorre hacia adentro y se tuerce.
  group.traverse((o) => {
    if (!o.name.startsWith("wheel_") || typeof o.userData.radius !== "number" || !("isGroup" in o))
      return;
    const wheel = o as Group;
    const r = wheel.userData.radius as number;
    const center = wheel.position.clone();
    const u = center.dot(field.frame.along);
    const c = crushAt(input, u);
    const reach = field.frame.face - center.dot(field.frame.outward) - r;
    const excess = Math.min(0.5, Math.max(0, c - reach));
    if (excess > 0) {
      wheels.push({
        obj: wheel,
        shift: field.frame.outward.clone().multiplyScalar(-excess),
        toe:
          (input.lado === "F" || input.lado === "B" ? 1 : -1) *
          Math.min(0.35, excess * 1.2) *
          Math.sign(u || 1),
      });
    }
  });
  return { meshes, wheels, maxCrush: Math.max(...input.perfil), field };
}

/** Influencia de la deformación en el instante t (0 antes del impacto, 1 al terminar el contacto). */
export function damageInfluence(t: number): number {
  return smoothstep(0, CONTACT_DURATION_S, t);
}

/**
 * Mide el perfil de aplastamiento sobre la malla deformada (influencia 1) en las 6 estaciones del
 * solver. Toma los vértices de la superficie exterior (los más externos de su vecindad, dentro de
 * la banda vertical central de la zona) e interpola linealmente su desplazamiento hacia adentro
 * entre los vecinos a cada lado de la estación: mide la superficie, no un solo vértice.
 */
export function measureCrushProfile(
  group: Group,
  field: DisplacementField,
  input: DamageInput,
): number[] {
  const [y0, y1] = field.band;
  const mid = (y0 + y1) / 2;
  const band = Math.max(0.05, Math.min(0.15, (y1 - y0) / 2));
  const pts: { u: number; before: number; disp: number }[] = [];
  const p = new Vector3();
  const dlt = new Vector3();
  for (const child of group.children) {
    if (!(child instanceof Mesh) || !child.visible) continue;
    const geo = child.geometry as BufferGeometry;
    const pos = geo.getAttribute("position") as BufferAttribute;
    const morph = geo.morphAttributes.position?.[0] as BufferAttribute | undefined;
    child.updateMatrix();
    const linear = child.matrix.clone().setPosition(0, 0, 0);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(child.matrix);
      if (Math.abs(p.y - mid) > band) continue;
      const before = p.dot(field.frame.outward);
      const d = morph ? dlt.fromBufferAttribute(morph, i).applyMatrix4(linear) : dlt.set(0, 0, 0);
      pts.push({ u: p.dot(field.frame.along), before, disp: -d.dot(field.frame.outward) });
    }
  }
  // Superficie exterior: vértices a menos de 1 cm del más externo en ±10 cm a lo largo de la cara
  // (máximo por cubetas de 2 cm, lineal en el número de vértices).
  const BIN = 0.02;
  const bins = new Map<number, number>();
  for (const q of pts) {
    const b = Math.floor(q.u / BIN);
    bins.set(b, Math.max(bins.get(b) ?? -Infinity, q.before));
  }
  const outer = pts.filter((q) => {
    const b = Math.floor(q.u / BIN);
    let localMax = -Infinity;
    for (let k = b - 5; k <= b + 5; k++) localMax = Math.max(localMax, bins.get(k) ?? -Infinity);
    return q.before >= localMax - 0.01;
  });
  const out: number[] = [];
  for (let k = 0; k < 6; k++) {
    const u = input.centro + (0.5 - k / 5) * input.ancho;
    let lo: { u: number; disp: number } | undefined;
    let hi: { u: number; disp: number } | undefined;
    for (const q of outer) {
      if (q.u <= u && (!lo || q.u > lo.u || (q.u === lo.u && q.disp > lo.disp))) lo = q;
      if (q.u >= u && (!hi || q.u < hi.u || (q.u === hi.u && q.disp > hi.disp))) hi = q;
    }
    if (lo && hi && hi.u !== lo.u) {
      out.push(lo.disp + ((hi.disp - lo.disp) * (u - lo.u)) / (hi.u - lo.u));
    } else if (lo && hi) {
      out.push(Math.max(lo.disp, hi.disp));
    } else {
      // En el borde de la cara solo hay vértices de un lado: se extrapola con los dos más
      // cercanos (exacto para un perfil lineal por tramos).
      const side = outer
        .filter((q) => (lo ? q.u <= u : q.u >= u))
        .sort((a, b) => Math.abs(a.u - u) - Math.abs(b.u - u));
      const a = side[0];
      const b = side.find((q) => a && Math.abs(q.u - a.u) > 0.01);
      if (!a) out.push(Number.NaN);
      else if (!b) out.push(a.disp);
      else out.push(Math.max(0, a.disp + ((b.disp - a.disp) * (u - a.u)) / (b.u - a.u)));
    }
  }
  return out;
}
