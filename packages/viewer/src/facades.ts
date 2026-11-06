/**
 * Fachadas a la mexicana (T1.3b, ADR 0099): edificios instanciados (un cubo unitario escalado) con
 * fachada procedural sobre texturas PBR CC0 (aplanado pintado que se tiñe con la paleta, o tabique),
 * ventanas con herrería, zócalo y pretil; en la planta baja que da a la calle, cortina metálica,
 * toldo y letrero sin texto; en la azotea, tinacos, antena y varillas. De noche, una parte de las
 * ventanas encendidas con fuerza (se leen de lejos) y la fachada sólida.
 *
 * Las texturas llegan después de armar el grafo (como las del suelo): los nodos de textura nacen con
 * un pixel neutro y `setFacadeTextures` los cambia por las reales.
 */
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Matrix4,
  Quaternion,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  abs,
  color,
  float,
  fract,
  hash,
  instanceIndex,
  instancedBufferAttribute,
  max,
  mix,
  normalLocal,
  positionGeometry,
  select,
  sign,
  smoothstep,
  step,
  texture,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { toThree } from "./coords";
import { FACADE_PALETTE_MX, type EnvironmentPlan } from "./environment-decor";

export const FLOOR_M = 3.2;
/** Mosaico de las texturas de fachada en metros (aplanado, tabique, lámina). */
export const FACADE_TILE_M = { yeso: 2.0, tabique: 2.0, lamina: 2.7 } as const;

export interface FacadeTextures {
  yeso: Texture;
  tabique: Texture;
  lamina: Texture;
}

export interface BuildingsBuild {
  group: Group;
  /** Pone las texturas reales (llegan después de armar el grafo). */
  setFacadeTextures(t: FacadeTextures): void;
}

function neutral(): DataTexture {
  const t = new DataTexture(new Uint8Array([200, 196, 188, 255]), 1, 1, RGBAFormat);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Semilla determinista por edificio para repartir tinacos y antenas en la azotea. */
function u01(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function buildBuildings(
  buildings: EnvironmentPlan["buildings"],
  heightAt: (x: number, y: number) => number,
  night: boolean,
  mats: { tinaco: Material; metal: Material; rebar: Material },
): BuildingsBuild | null {
  if (buildings.length === 0) return null;
  const n = buildings.length;
  const geo = new BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const dimsArr = new Float32Array(n * 3);
  const tint = new Float32Array(n * 3);
  // x: lado de la fachada (±1 en z local), y: tabique (1) o aplanado (0), z: cortina metálica,
  // w: ventanas encendidas de noche.
  const flags = new Float32Array(n * 4);
  buildings.forEach((b, i) => {
    dimsArr.set([b.w, b.h, b.d], 3 * i);
    const c = new Color(FACADE_PALETTE_MX[b.color % FACADE_PALETTE_MX.length]);
    tint.set([c.r, c.g, c.b], 3 * i);
    // ¿La calle queda hacia +z o −z local? El frente apunta de la fachada hacia la calle.
    const rel = Math.atan2(Math.sin(b.front - b.yaw), Math.cos(b.front - b.yaw));
    const frontSign = rel < 0 ? 1 : -1;
    flags.set(
      [frontSign, b.material === "tabique" ? 1 : 0, b.shutter ? 1 : 0, u01(i, 3) < 0.45 ? 1 : 0],
      4 * i,
    );
  });
  const dims = new InstancedBufferAttribute(dimsArr, 3);
  const tintAttr = new InstancedBufferAttribute(tint, 3);
  const flagsAttr = new InstancedBufferAttribute(flags, 4);
  geo.setAttribute("_dims", dims);
  geo.setAttribute("_tint", tintAttr);
  geo.setAttribute("_flags", flagsAttr);

  const yesoNode = texture(neutral());
  const tabiqueNode = texture(neutral());
  const laminaNode = texture(neutral());
  const m = new MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  // El glTF no lleva los nodos: la fachada viaja como dato y Blender la rearma (R11). Cada edificio
  // sale como su propio nodo con sus medidas, su color y sus banderas (`croquisPorInstancia`).
  m.userData.croquisFachada = { noche: night };
  const d = instancedBufferAttribute<"vec3">(dims, "vec3");
  const base = instancedBufferAttribute<"vec3">(tintAttr, "vec3");
  const f = instancedBufferAttribute<"vec4">(flagsAttr, "vec4");
  // Coordenadas de fachada en metros: a lo largo de la cara y hacia arriba.
  const sideX = abs(normalLocal.x).greaterThan(0.5);
  const along = select(sideX, positionGeometry.z.mul(d.z), positionGeometry.x.mul(d.x));
  const up = positionGeometry.y.mul(d.y);
  const isWall = abs(normalLocal.y).lessThan(0.5);
  const isFront = abs(normalLocal.z).greaterThan(0.5).and(sign(normalLocal.z).equal(f.x));
  const wallK = select(isWall, float(1), float(0));
  // Material de la pared: aplanado teñido o tabique.
  const fuv = vec2(along.div(FACADE_TILE_M.yeso), up.div(FACADE_TILE_M.yeso));
  // La textura de aplanado promedia 0.55: se compensa para que el tinte mande.
  const yeso = mix(base, yesoNode.sample(fuv).rgb.mul(base).mul(2.1), 0.7);
  const tabique = tabiqueNode.sample(fuv).rgb.mul(1.25);
  const pared = mix(yeso, tabique, f.y);
  // Ventanas de 1.4 m cada 3 m, entre 1.0 y 2.2 m de cada nivel, salvo el último medio metro.
  const wx = fract(along.div(3).add(0.5));
  const wy = fract(up.div(FLOOR_M));
  const inWin = step(0.33, wx)
    .mul(step(wx, 0.67))
    .mul(step(0.36, wy))
    .mul(step(wy, 0.7))
    .mul(step(up, d.y.sub(0.6)))
    .mul(wallK);
  // Herrería: barrotes verticales cada 0.35 m y un travesaño, oscuros, sobre el vidrio.
  const lx = wx.sub(0.33).div(0.34);
  const ly = wy.sub(0.36).div(0.34);
  const bars = max(step(0.88, fract(lx.mul(4))), step(0.9, fract(ly.mul(2))));
  const glass = mix(color("#283240"), color("#1a1a1a"), bars);
  // Planta baja a la calle con cortina metálica: huecos de 3.2 m cada 8 m hasta 2.6 m de alto.
  const sx = fract(along.div(8));
  const slot = step(0.12, sx)
    .mul(step(sx, 0.52))
    .mul(step(up, 2.6))
    .mul(select(isFront, float(1), float(0)))
    .mul(f.z);
  const lamina = laminaNode
    .sample(vec2(along.div(FACADE_TILE_M.lamina), up.div(FACADE_TILE_M.lamina)))
    .rgb.mul(0.8);
  const win = inWin.mul(float(1).sub(slot));
  // Relieve pintado (T1.3c): zócalo más oscuro en el primer metro, cornisa clara en los últimos
  // 25 cm con su sombra debajo, y marcos claros de 12 cm alrededor de las ventanas.
  const zocalo = smoothstep(float(1.2), float(0.8), up).mul(wallK);
  const cornisa = smoothstep(d.y.sub(0.3), d.y.sub(0.2), up).mul(wallK);
  const sombraCornisa = smoothstep(d.y.sub(0.3), d.y.sub(0.45), up)
    .mul(smoothstep(d.y.sub(0.7), d.y.sub(0.5), up))
    .mul(wallK);
  const inFrame = step(0.29, wx)
    .mul(step(wx, 0.71))
    .mul(step(0.32, wy))
    .mul(step(wy, 0.74))
    .mul(step(up, d.y.sub(0.6)))
    .mul(wallK);
  const frame = inFrame.mul(float(1).sub(inWin)).mul(float(1).sub(slot));
  let facade = mix(pared, pared.mul(0.74), zocalo);
  facade = mix(facade, facade.mul(0.82), sombraCornisa);
  facade = mix(facade, facade.mul(0.35).add(0.6), cornisa);
  facade = mix(facade, facade.mul(0.3).add(0.62), frame);
  facade = mix(facade, lamina, slot);
  m.colorNode = mix(facade, glass, win);
  m.roughnessNode = mix(float(0.92), float(0.35), win);
  if (night) {
    // Ventanas encendidas en casi la mitad de los edificios, con fuerza para leerse de lejos; las
    // demás, oscuras. La fachada queda sólida: nada translúcido.
    const litWin = win.mul(f.w).mul(float(1).sub(bars));
    m.emissiveNode = vec3(1.0, 0.82, 0.5).mul(litWin).mul(2.2);
  }
  const mesh = new InstancedMesh(geo, m, n);
  mesh.name = "edificios";
  mesh.userData.croquisPorInstancia = buildings.map((_, i) => ({
    croquis_dims: Array.from(dimsArr.subarray(3 * i, 3 * i + 3)),
    croquis_tinte: Array.from(tint.subarray(3 * i, 3 * i + 3)),
    croquis_banderas: Array.from(flags.subarray(4 * i, 4 * i + 4)),
  }));
  const m4 = new Matrix4();
  const q = new Quaternion();
  const upAxis = new Vector3(0, 1, 0);
  buildings.forEach((b, i) => {
    const [x, y, z] = toThree(b.x, b.y, heightAt(b.x, b.y) - 0.05);
    q.setFromAxisAngle(upAxis, b.yaw);
    m4.compose(new Vector3(x, y, z), q, new Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  const group = new Group();
  group.name = "edificios_grupo";
  group.add(mesh);
  group.add(...props(buildings, heightAt, night, mats));
  return {
    group,
    setFacadeTextures(t) {
      yesoNode.value = t.yeso;
      tabiqueNode.value = t.tabique;
      laminaNode.value = t.lamina;
      m.needsUpdate = true;
    },
  };
}

/** Tinacos, antenas, varillas, toldos y letreros, instanciados por tipo. */
function props(
  buildings: EnvironmentPlan["buildings"],
  heightAt: (x: number, y: number) => number,
  night: boolean,
  mats: { tinaco: Material; metal: Material; rebar: Material },
): Group[] {
  const tinacos: Matrix4[] = [];
  const antenas: Matrix4[] = [];
  const varillas: Matrix4[] = [];
  // Relieve real (T1.3c): una cornisa que sobresale a lo largo del frente y, en los edificios de
  // dos niveles o más, un saliente (losa de balcón) en el primer nivel.
  const cornisas: Matrix4[] = [];
  const salientes: Matrix4[] = [];
  const toldos: { m: Matrix4; c: Color }[] = [];
  const letreros: { m: Matrix4; c: Color }[] = [];
  const q = new Quaternion();
  const upAxis = new Vector3(0, 1, 0);
  buildings.forEach((b, i) => {
    const base = heightAt(b.x, b.y) - 0.05;
    const top = base + b.h;
    const ux = Math.cos(b.yaw);
    const uy = Math.sin(b.yaw);
    // Hacia la calle, en el plano del solver.
    const fx = Math.cos(b.front);
    const fy = Math.sin(b.front);
    q.setFromAxisAngle(upAxis, b.yaw);
    const at = (lx: number, lf: number, h: number, sx = 1, sy = 1, sz = 1, rot = q) => {
      const x = b.x + ux * lx + fx * lf;
      const y = b.y + uy * lx + fy * lf;
      const [tx, ty, tz] = toThree(x, y, h);
      return new Matrix4().compose(new Vector3(tx, ty, tz), rot, new Vector3(sx, sy, sz));
    };
    for (let k = 0; k < b.tinacos; k++) {
      tinacos.push(at((u01(i, 10 + k) - 0.5) * (b.w - 2), (u01(i, 20 + k) - 0.5) * (b.d - 2), top));
    }
    if (b.antenna)
      antenas.push(at((u01(i, 31) - 0.5) * (b.w - 1.5), (u01(i, 32) - 0.5) * (b.d - 1.5), top));
    if (b.rebar) varillas.push(at(0, 0, top, b.w - 0.3, 1, b.d - 0.3));
    cornisas.push(at(0, b.d / 2 + 0.09, top - 0.1, b.w + 0.24, 0.18, 0.22));
    if (b.floors >= 2 && u01(i, 41) < 0.7)
      salientes.push(
        at(
          (u01(i, 42) - 0.5) * b.w * 0.4,
          b.d / 2 + 0.18,
          base + FLOOR_M + 0.02,
          b.w * 0.42,
          0.14,
          0.4,
        ),
      );
    const c = new Color(FACADE_PALETTE_MX[(b.color + 5) % FACADE_PALETTE_MX.length]);
    if (b.awning) {
      const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.35);
      const rot = q.clone().multiply(tilt);
      toldos.push({ m: at(-b.w * 0.2, b.d / 2 + 0.6, base + 2.75, 3.2, 1, 1.2, rot), c });
    }
    if (b.sign) letreros.push({ m: at(b.w * 0.22, b.d / 2 + 0.05, base + 3.15), c });
  });
  const out: Group[] = [];
  const make = (
    name: string,
    geo: BoxGeometry | CylinderGeometry | ReturnType<typeof mergeGeometries>,
    mat: Material,
    list: Matrix4[],
  ) => {
    if (list.length === 0) return;
    const im = new InstancedMesh(geo, mat, list.length);
    im.name = name;
    list.forEach((m, k) => im.setMatrixAt(k, m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.computeBoundingSphere();
    const g = new Group();
    g.add(im);
    out.push(g);
  };
  // Tinaco: cilindro negro con tapa cónica.
  const tinacoGeo = mergeGeometries(
    [
      new CylinderGeometry(0.55, 0.55, 1.05, 12).translate(0, 0.525, 0),
      new ConeGeometry(0.55, 0.25, 12).translate(0, 1.17, 0),
    ],
    false,
  );
  make("tinacos", tinacoGeo, mats.tinaco, tinacos);
  // Antena: mástil y dos travesaños.
  const antenaGeo = mergeGeometries(
    [
      new BoxGeometry(0.04, 3.4, 0.04).translate(0, 1.7, 0),
      new BoxGeometry(1.4, 0.03, 0.03).translate(0, 3.1, 0),
      new BoxGeometry(1.0, 0.03, 0.03).translate(0, 2.6, 0),
    ],
    false,
  );
  make("antenas", antenaGeo, mats.metal, antenas);
  // Varillas: cuatro barras en las esquinas de la azotea (escaladas por instancia al lote).
  const varillaGeo = mergeGeometries(
    [-0.5, 0.5].flatMap((x) =>
      [-0.5, 0.5].map((z) => new BoxGeometry(0.025, 1.3, 0.025).translate(x, 0.65, z)),
    ),
    false,
  );
  make("varillas", varillaGeo, mats.rebar, varillas);
  const concreto = new MeshStandardNodeMaterial({ color: "#d8d1c2", roughness: 0.9, metalness: 0 });
  const losa = new BoxGeometry(1, 1, 1);
  make("cornisas", losa, concreto, cornisas);
  make("salientes", losa, concreto, salientes);
  // Toldos y letreros con color por instancia.
  const colored = (
    name: string,
    geo: BoxGeometry,
    list: { m: Matrix4; c: Color }[],
    band: boolean,
  ) => {
    if (list.length === 0) return;
    const col = new Float32Array(list.length * 3);
    list.forEach((e, k) => col.set([e.c.r, e.c.g, e.c.b], 3 * k));
    const attr = new InstancedBufferAttribute(col, 3);
    const g2 = geo.clone();
    g2.setAttribute("_col", attr);
    const mat = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
    // Para Blender (R11): el tipo en el material y el color de cada uno en su nodo.
    mat.userData.croquisRotulo = { tipo: band ? "letrero" : "toldo", noche: night };
    const c = instancedBufferAttribute<"vec3">(attr, "vec3");
    if (band) {
      // Letrero: fondo de color con una franja blanca (sin texto ni marca).
      const franja = step(0.32, uv().y).mul(step(uv().y, 0.68));
      mat.colorNode = mix(c, vec3(0.96, 0.96, 0.94), franja);
      if (night)
        mat.emissiveNode = mix(c, vec3(0.96, 0.96, 0.94), franja).mul(
          hash(instanceIndex.add(11)).step(0.5).mul(0.9),
        );
    } else {
      // Toldo: rayas del color y blanco.
      const raya = step(0.5, fract(uv().x.mul(6)));
      mat.colorNode = mix(c, vec3(0.95, 0.95, 0.93), raya);
    }
    const im = new InstancedMesh(g2, mat, list.length);
    im.name = name;
    im.userData.croquisPorInstancia = list.map((e) => ({ croquis_color: [e.c.r, e.c.g, e.c.b] }));
    list.forEach((e, k) => im.setMatrixAt(k, e.m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.computeBoundingSphere();
    const g = new Group();
    g.add(im);
    out.push(g);
  };
  colored("toldos", new BoxGeometry(1, 0.06, 1).translate(0, 0, 0.5), toldos, false);
  colored("letreros", new BoxGeometry(2.4, 0.6, 0.06).translate(0, 0.3, 0), letreros, true);
  return out;
}
