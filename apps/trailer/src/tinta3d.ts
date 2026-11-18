/**
 * Los vehículos del tráiler con sus modelos 3D reales (los de la app: «Kiri '10» y «Shvan 92 Traveller»
 * de Daniel Zhabotinsky, CC-BY 4.0, `assets/ASSETS.md`), dibujados como tinta sobre el papel (René,
 * 2026-11-17): contorno de pluma, las aristas del modelo y sombreado a líneas que se cruzan donde la
 * luz no llega. Se dibujan con three.js en un lienzo aparte, con la misma cámara que la hoja
 * (`camara.ts`), y ese lienzo se pinta encima de la hoja en su capa.
 *
 * La geometría sale de `tools/trailer/modelos-tinta.mjs` (los mismos modelos, sin texturas).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Camara } from "./camara";

/** Un modelo de la app (`vehiculos.json`): x al frente, y arriba, z a la derecha; medidas en metros. */
export interface ModeloAuto {
  archivo: string;
  largo: number;
  ancho: number;
  alto: number;
  autor: string;
  nombre: string;
  licencia: string;
  url: string;
}

export interface AutoEnEscena {
  id: string;
  /** Qué modelo: la clave con que se cargó («sedan», «combi»). */
  clave: string;
  /** Pose en la hoja: metros, con el norte en +y; rumbo en radianes desde el este. */
  x: number;
  y: number;
  rumbo: number;
  /** Las medidas del vehículo del caso: el modelo se ajusta a ellas. */
  largo: number;
  ancho: number;
  opacidad?: number;
}

export interface Tinta {
  /** El color de la tinta y el del papel, en `#rrggbb` o `rgb()`. */
  tinta: string;
  papel: string;
  /** El grueso del contorno, en píxeles de un video de 1080 de lado menor. */
  pluma: number;
}

const VERTICE = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

/**
 * El sombreado a pluma: la cara que mira a la luz queda en blanco (el papel); conforme se aleja, primero
 * líneas en diagonal y, en lo más oscuro, cruzadas. Las líneas van en la pantalla, como en un dibujo.
 * Con `uFijo` (de 0 a 1) el tono no depende de la luz: los cristales y las llantas.
 */
const FRAGMENTO = /* glsl */ `
  uniform vec3 uTinta;
  uniform vec3 uPapel;
  uniform vec3 uLuz;
  uniform float uPaso;
  uniform float uOpacidad;
  uniform float uFijo;
  varying vec3 vNormal;
  float raya(float t, float grueso) {
    float f = abs(fract(t) - 0.5);
    return 1.0 - smoothstep(grueso, grueso + 0.07, f);
  }
  void main() {
    float luz = max(dot(normalize(vNormal), normalize(uLuz)), 0.0);
    float tono = uFijo >= 0.0 ? uFijo : 1.0 - luz;
    vec2 p = gl_FragCoord.xy / uPaso;
    float a = raya((p.x + p.y) * 0.7071, mix(0.05, 0.17, smoothstep(0.34, 0.85, tono))) * step(0.34, tono);
    float b = raya((p.x - p.y) * 0.7071, mix(0.04, 0.15, smoothstep(0.64, 1.0, tono))) * step(0.64, tono);
    float c = raya(p.y * 0.62, 0.08) * step(0.9, tono);
    float k = max(max(a, b), c);
    gl_FragColor = vec4(mix(uPapel, uTinta, k), uOpacidad);
    #include <colorspace_fragment>
  }
`;

/** El contorno: la cáscara de atrás, un poco inflada, en color tinta. */
const VERTICE_CONTORNO = /* glsl */ `
  uniform float uGrueso;
  void main() {
    vec3 p = position + normalize(normal) * uGrueso;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;
const FRAGMENTO_CONTORNO = /* glsl */ `
  uniform vec3 uTinta;
  uniform float uOpacidad;
  void main() {
    gl_FragColor = vec4(uTinta, uOpacidad);
    #include <colorspace_fragment>
  }
`;

interface Plantilla {
  grupo: THREE.Group;
  modelo: ModeloAuto;
}

/** El dibujante en tinta: carga los modelos una vez y dibuja la escena de cada cuadro. */
export class Dibujante {
  private renderer: THREE.WebGLRenderer;
  private escena = new THREE.Scene();
  private plantillas = new Map<string, Plantilla>();
  private instancias = new Map<string, THREE.Group>();
  private comunes = {
    uTinta: { value: new THREE.Color("#15181B") },
    uPapel: { value: new THREE.Color("#EFEBE1") },
    // La luz llega de arriba y un poco del noroeste: el techo queda limpio y los costados con línea.
    uLuz: { value: new THREE.Vector3(-0.42, 0.5, 1).normalize() },
    uPaso: { value: 6 },
    uOpacidad: { value: 1 },
  };
  private contorno: THREE.ShaderMaterial;
  private aristas: THREE.LineBasicMaterial;
  private rellenos: Record<"carroceria" | "vidrio" | "llanta", THREE.ShaderMaterial>;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.createElement("canvas"),
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(1);
    const relleno = (fijo: number) =>
      new THREE.ShaderMaterial({
        vertexShader: VERTICE,
        fragmentShader: FRAGMENTO,
        transparent: true,
        // Los mismos objetos de uniformes en todos: se cambian una vez por cuadro.
        uniforms: { ...this.comunes, uFijo: { value: fijo } },
      });
    this.rellenos = { carroceria: relleno(-1), vidrio: relleno(0.52), llanta: relleno(0.95) };
    this.contorno = new THREE.ShaderMaterial({
      vertexShader: VERTICE_CONTORNO,
      fragmentShader: FRAGMENTO_CONTORNO,
      side: THREE.BackSide,
      transparent: true,
      uniforms: {
        uTinta: this.comunes.uTinta,
        uOpacidad: this.comunes.uOpacidad,
        uGrueso: { value: 0.035 },
      },
    });
    this.aristas = new THREE.LineBasicMaterial({ color: "#15181B", transparent: true });
  }

  /** Carga los modelos (por su dirección en el render) y los prepara para la tinta. */
  async cargar(modelos: Record<string, { url: string; modelo: ModeloAuto }>): Promise<void> {
    const cargador = new GLTFLoader();
    await Promise.all(
      Object.entries(modelos).map(async ([clave, { url, modelo }]) => {
        const gltf = await cargador.loadAsync(url);
        const grupo = new THREE.Group();
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const malla = o as THREE.Mesh;
          if (!malla.isMesh) return;
          const nombre = `${malla.name} ${malla.parent?.name ?? ""}`.toLowerCase();
          const parte = /glass/.test(nombre)
            ? "vidrio"
            : /wheel|tire|tyre/.test(nombre)
              ? "llanta"
              : "carroceria";
          const geo = malla.geometry.clone();
          geo.applyMatrix4(malla.matrixWorld);
          if (!geo.attributes.normal) geo.computeVertexNormals();
          grupo.add(new THREE.Mesh(geo, this.rellenos[parte]));
          if (parte !== "vidrio") {
            const casco = new THREE.Mesh(geo, this.contorno);
            casco.renderOrder = -1;
            grupo.add(casco);
          }
          // Las aristas marcadas del modelo, como líneas de pluma.
          grupo.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 34), this.aristas));
        });
        this.plantillas.set(clave, { grupo, modelo });
      }),
    );
  }

  /** Dibuja los autos con la cámara de la hoja y lo pinta sobre `ctx`. */
  dibujar(
    ctx: CanvasRenderingContext2D,
    camara: Camara,
    pantalla: { ancho: number; alto: number },
    autos: readonly AutoEnEscena[],
    tinta: Tinta,
  ): void {
    const { ancho, alto } = pantalla;
    const lienzo = this.renderer.domElement;
    if (lienzo.width !== ancho || lienzo.height !== alto) this.renderer.setSize(ancho, alto, false);
    const u = Math.min(ancho, alto) / 1080;

    // La cámara: la misma de la hoja (mundo con z arriba).
    const F = camara.focal * Math.min(ancho, alto);
    const fov = (2 * Math.atan(alto / 2 / F) * 180) / Math.PI;
    const cam = new THREE.PerspectiveCamera(fov, ancho / alto, 0.05, 5000);
    const gx = Math.cos(camara.giro);
    const gy = Math.sin(camara.giro);
    const cp = Math.cos(camara.inclinacion);
    const sp = Math.sin(camara.inclinacion);
    cam.position.set(
      camara.x - gx * cp * camara.dist,
      camara.y - gy * cp * camara.dist,
      sp * camara.dist,
    );
    cam.up.set(gx * sp, gy * sp, cp);
    cam.lookAt(camara.x, camara.y, 0);
    cam.updateMatrixWorld(true);

    // Los colores y el grueso de la pluma de este cuadro.
    this.comunes.uTinta.value.set(tinta.tinta);
    this.comunes.uPapel.value.set(tinta.papel);
    this.comunes.uPaso.value = 5.5 * u;
    this.aristas.color.set(tinta.tinta);
    // El contorno, en metros: lo que se ve como `pluma` px a la distancia de la cámara.
    this.contorno.uniforms.uGrueso!.value = (tinta.pluma * u * camara.dist) / F;

    // Las instancias: una por auto, con su pose y sus medidas.
    for (const [id, g] of this.instancias) {
      if (!autos.some((a) => a.id === id)) {
        this.escena.remove(g);
        this.instancias.delete(id);
      }
    }
    for (const a of autos) {
      const p = this.plantillas.get(a.clave);
      if (!p) continue;
      let g = this.instancias.get(a.id);
      if (!g) {
        g = p.grupo.clone();
        this.instancias.set(a.id, g);
        this.escena.add(g);
      }
      // Del marco del modelo (x al frente, y arriba, z a la derecha) a la hoja (x este, y norte, z arriba).
      const marco = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
      const sx = a.largo / p.modelo.largo;
      const sz = a.ancho / p.modelo.ancho;
      const escala = new THREE.Matrix4().makeScale(sx, Math.sqrt(sx * sz), sz);
      const giro = new THREE.Matrix4().makeRotationZ(a.rumbo);
      const lugar = new THREE.Matrix4().makeTranslation(a.x, a.y, 0);
      g.matrixAutoUpdate = false;
      g.matrix.copy(lugar).multiply(giro).multiply(marco).multiply(escala);
      g.matrixWorldNeedsUpdate = true;
      g.userData.opacidad = a.opacidad ?? 1;
    }

    // Un auto a la vez, para que cada uno lleve su opacidad.
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.autoClear = false;
    for (const g of this.instancias.values()) {
      const o = g.userData.opacidad as number;
      if (o <= 0) continue;
      for (const otro of this.instancias.values()) otro.visible = otro === g;
      this.comunes.uOpacidad.value = o;
      this.aristas.opacity = o * 0.9;
      this.renderer.clearDepth();
      this.renderer.render(this.escena, cam);
    }
    for (const g of this.instancias.values()) g.visible = true;
    this.renderer.autoClear = true;
    ctx.drawImage(lienzo, 0, 0, ancho, alto);
  }
}
