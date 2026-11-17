/**
 * El lápiz del tráiler, modelado en código (René, 2026-11-17: «que parezca real»): cuerpo hexagonal
 * pintado, la punta afilada con la madera a la vista y el grafito, el casquillo de metal y la goma.
 * La frontera entre la pintura y la madera sale sola, en ondas, de cortar el prisma hexagonal con el
 * cono del sacapuntas, como en un lápiz de verdad. Lleva luz, reflejos y su sombra suave sobre el papel.
 *
 * Se dibuja con three.js en un lienzo aparte, con la misma cámara de la hoja (`camara.ts`), y ese
 * lienzo se pinta encima. Ningún modelo ni textura de terceros.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Camara } from "./camara";
import { azar } from "./texturas/azar";

/** Proporciones, con el largo del lápiz como unidad. */
const RADIO = 0.0245; // del centro a una arista del hexágono
const INRADIO = RADIO * Math.cos(Math.PI / 6);
const CONO = 0.092; // lo que mide la punta afilada
const MINA = RADIO * 0.3;
const CASQUILLO = [0.895, 0.952] as const;
const SEGMENTOS = 96;

const hexagono = (t: number) => {
  const sexto = Math.PI / 3;
  const a = ((t % sexto) + sexto) % sexto;
  return INRADIO / Math.cos(a - sexto / 2);
};

/**
 * Una superficie de revolución «a mano»: por cada altura z y cada ángulo, su radio y su color. Caras
 * sin compartir vértices, para que el hexágono quede facetado.
 */
function superficie(
  alturas: readonly number[],
  radio: (t: number, z: number) => number,
  color?: (t: number, z: number, columna: number) => readonly [number, number, number],
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const punto = (i: number, k: number) => {
    const t = (i / SEGMENTOS) * Math.PI * 2;
    const z = alturas[k]!;
    const r = radio(t, z);
    return [Math.cos(t) * r, Math.sin(t) * r, z, t, z, i] as const;
  };
  for (let k = 0; k < alturas.length - 1; k++)
    for (let i = 0; i < SEGMENTOS; i++) {
      const a = punto(i, k);
      const b = punto(i + 1, k);
      const c = punto(i + 1, k + 1);
      const d = punto(i, k + 1);
      for (const v of [a, b, c, a, c, d]) {
        pos.push(v[0], v[1], v[2]);
        if (color) {
          // El color, el del centro de la cara (así la frontera pintura-madera queda nítida).
          const rgb = color((a[3] + b[3]) / 2, (a[4] + d[4]) / 2, a[5]);
          col.push(rgb[0], rgb[1], rgb[2]);
        }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const rango = (a: number, b: number, n: number) =>
  Array.from({ length: n + 1 }, (_x, i) => a + ((b - a) * i) / n);

function construir(): THREE.Group {
  const grupo = new THREE.Group();
  const r = azar(1917);
  // La veta: cada columna de la madera, un poco más clara o más oscura, con alguna raya marcada.
  const veta = Array.from(
    { length: SEGMENTOS + 1 },
    () => 0.86 + r() * 0.16 - (r() < 0.12 ? 0.14 : 0),
  );
  const pintura = new THREE.Color("#FF5B2E");
  const madera = new THREE.Color("#D9B487");
  const grafito = new THREE.Color("#2B2C30");
  const cono = (z: number) => (z < CONO ? (RADIO * Math.max(z, 0.0008)) / CONO : Infinity);

  // El cuerpo, de la punta al casquillo: más alturas donde la pintura se encuentra con la madera.
  const alturas = [
    ...rango(0, CONO * 0.3, 8),
    ...rango(CONO * 0.3, CONO * 0.84, 10).slice(1),
    ...rango(CONO * 0.84, CONO * 1.02, 22).slice(1),
    ...rango(CONO * 1.02, CASQUILLO[0], 8).slice(1),
  ];
  const cuerpo = new THREE.Mesh(
    superficie(
      alturas,
      (t, z) => Math.min(hexagono(t), cono(z)),
      (t, z, columna) => {
        const c = cono(z);
        if (c <= MINA) return [grafito.r, grafito.g, grafito.b];
        if (c < hexagono(t)) {
          // Madera: la veta de su columna y un tono más oscuro hacia la punta, donde roza la mina.
          const v = veta[columna]! * (0.9 + 0.1 * Math.min(1, (c - MINA) / (INRADIO - MINA)));
          return [madera.r * v, madera.g * v, madera.b * v];
        }
        return [pintura.r, pintura.g, pintura.b];
      },
    ),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0,
      flatShading: true,
    }),
  );
  // El casquillo: metal con dos pares de ranuras.
  const ranura = (z: number) => {
    const u = (z - CASQUILLO[0]) / (CASQUILLO[1] - CASQUILLO[0]);
    return [0.16, 0.3, 0.7, 0.84].reduce((s, c) => s + Math.exp(-(((u - c) / 0.035) ** 2)), 0);
  };
  const casquillo = new THREE.Mesh(
    superficie(
      rango(CASQUILLO[0], CASQUILLO[1], 60),
      (_t, z) => RADIO * (1.035 - 0.05 * ranura(z)),
    ),
    new THREE.MeshStandardMaterial({ color: "#D5D6DA", roughness: 0.26, metalness: 1 }),
  );
  // La goma, con la orilla redondeada.
  const goma = new THREE.Mesh(
    superficie(
      rango(CASQUILLO[1], 1, 24),
      (_t, z) => RADIO * 0.97 * Math.sqrt(Math.max(0, 1 - Math.max(0, (z - 0.988) / 0.012) ** 2)),
    ),
    new THREE.MeshStandardMaterial({ color: "#D8837B", roughness: 0.95, metalness: 0 }),
  );
  for (const m of [cuerpo, casquillo, goma]) {
    m.castShadow = true;
    grupo.add(m);
  }
  return grupo;
}

export interface PoseDelLapiz {
  /** Dónde toca la punta la hoja (m). */
  x: number;
  y: number;
  /** El largo aparente: fracción del lado menor de la pantalla. */
  tamano: number;
  /** Cuánto se levanta de la hoja (radianes) y hacia dónde se inclina respecto a la cámara (radianes). */
  elevacion: number;
  azimut: number;
  /** El giro sobre su eje (radianes): deja ver otra cara del hexágono. */
  giro: number;
  opacidad: number;
}

/** El lápiz y su sombra: se construye una vez y se dibuja en cada cuadro. */
export class Lapiz {
  private renderer: THREE.WebGLRenderer;
  private escena = new THREE.Scene();
  private lapiz = construir();
  private luz = new THREE.DirectionalLight(0xffffff, 2.4);

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.createElement("canvas"),
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Los reflejos del casquillo y el brillo de la pintura: un cuarto con luces, generado en código.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.escena.environmentIntensity = 0.75;
    this.escena.add(this.lapiz);
    // La hoja: solo recibe la sombra.
    const hoja = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.ShadowMaterial({ opacity: 0.34 }),
    );
    hoja.receiveShadow = true;
    this.escena.add(hoja);
    this.luz.castShadow = true;
    this.luz.shadow.mapSize.set(2048, 2048);
    this.luz.shadow.radius = 9;
    this.luz.shadow.blurSamples = 24;
    this.luz.shadow.bias = -0.0006;
    const c = this.luz.shadow.camera;
    c.left = c.bottom = -1.5;
    c.right = c.top = 1.5;
    c.near = 0.1;
    c.far = 8;
    this.escena.add(this.luz, this.luz.target);
  }

  /**
   * Dibuja el lápiz sobre `ctx` con la cámara de la hoja. Todo se lleva a la escala del lápiz (su largo
   * es 1 y su punta está en el origen), así la luz y la sombra son las mismas a cualquier distancia.
   */
  dibujar(
    ctx: CanvasRenderingContext2D,
    camara: Camara,
    pantalla: { ancho: number; alto: number },
    pose: PoseDelLapiz,
  ): void {
    if (pose.opacidad <= 0) return;
    const { ancho, alto } = pantalla;
    const lienzo = this.renderer.domElement;
    if (lienzo.width !== ancho || lienzo.height !== alto) this.renderer.setSize(ancho, alto, false);

    const gx = Math.cos(camara.giro);
    const gy = Math.sin(camara.giro);
    const cp = Math.cos(camara.inclinacion);
    const sp = Math.sin(camara.inclinacion);
    const ojo = new THREE.Vector3(
      camara.x - gx * cp * camara.dist,
      camara.y - gy * cp * camara.dist,
      sp * camara.dist,
    );
    const punta = new THREE.Vector3(pose.x, pose.y, 0);
    // El largo del lápiz en metros de la hoja: el que se ve del tamaño pedido a esa distancia.
    const largo = (pose.tamano * ojo.distanceTo(punta)) / camara.focal;

    const F = camara.focal * Math.min(ancho, alto);
    const cam = new THREE.PerspectiveCamera(
      (2 * Math.atan(alto / 2 / F) * 180) / Math.PI,
      ancho / alto,
      0.01,
      400,
    );
    cam.position.copy(ojo.clone().sub(punta).divideScalar(largo));
    cam.up.set(gx * sp, gy * sp, cp);
    cam.lookAt(new THREE.Vector3(camara.x, camara.y, 0).sub(punta).divideScalar(largo));
    cam.updateMatrixWorld(true);

    // Hacia dónde se recuesta: a la derecha de la pantalla y hacia quien mira, como en una mano diestra.
    const derecha = new THREE.Vector3(gy, -gx, 0);
    const haciaAca = new THREE.Vector3(-gx, -gy, 0);
    const enLaHoja = derecha
      .clone()
      .multiplyScalar(Math.cos(pose.azimut))
      .add(haciaAca.clone().multiplyScalar(Math.sin(pose.azimut)));
    const eje = enLaHoja
      .multiplyScalar(Math.cos(pose.elevacion))
      .add(new THREE.Vector3(0, 0, Math.sin(pose.elevacion)));
    this.lapiz.quaternion
      .setFromUnitVectors(new THREE.Vector3(0, 0, 1), eje.normalize())
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pose.giro));

    // La luz, de arriba a la izquierda de la pantalla: la sombra cae hacia abajo a la derecha.
    this.luz.position
      .copy(derecha.clone().multiplyScalar(-1.1))
      .add(haciaAca.clone().multiplyScalar(-0.9))
      .add(new THREE.Vector3(0, 0, 2.6));
    this.luz.target.position.set(0, 0, 0);
    this.luz.target.updateMatrixWorld();

    this.renderer.render(this.escena, cam);
    ctx.save();
    ctx.globalAlpha = pose.opacidad;
    ctx.drawImage(lienzo, 0, 0, ancho, alto);
    ctx.restore();
  }
}
