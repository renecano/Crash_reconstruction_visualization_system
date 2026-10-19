/**
 * Dispositivos de tránsito en 3D (PLAN §7.1, F8c): semáforos cuyas lámparas siguen su fase en el
 * tiempo (`traffic-signals.ts`) y una placa propia para cada señal del contrato.
 *
 * Formas y tamaños del Manual de Señalización y Dispositivos para el Control del Tránsito
 * (SEDATU/SCT, 2023; Tablas III.3-1 y VII.2-1):
 * - restrictivas (límite de velocidad, no vuelta): cuadrado con círculo insertado; tablero de
 *   71 × 71 cm (calle primaria de un carril por sentido), círculo de 62 cm;
 * - SR-6 Alto: octágono de 30 cm por lado;
 * - SR-7 Ceda el paso: triángulo rojo con un vértice hacia abajo, 85 cm por lado.
 * "Un sentido" y "otro" no tienen descripción en esa tabla: flecha blanca sobre fondo negro y
 * placa gris (supuestos de forma).
 *
 * Los textos (ALTO, el número del límite) se dibujan en una textura de lienzo solo donde hay
 * `document` (navegador); en pruebas sin DOM la placa va sin texto.
 */
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Material,
} from "three";
import { lampAt, type Lamp, type SignalPhase, pedLampAt, type PedLamp } from "./traffic-signals";

export const RESTRICTIVE_BOARD_M = 0.71;
export const RESTRICTIVE_CIRCLE_M = 0.62;
export const STOP_SIDE_M = 0.3;
export const YIELD_SIDE_M = 0.85;
/** Lente del semáforo (m): 30 cm, la medida mayor de las lentes vehiculares. */
export const LENS_M = 0.3;

const LAMP_COLORS: Record<Lamp, string> = {
  rojo: "#ff2a1f",
  amarillo: "#ffb21a",
  verde: "#1fd36b",
};
const LAMPS: Lamp[] = ["rojo", "amarillo", "verde"];
/** Lente del semáforo peatonal (m): cuadrada, de 20 cm. */
export const PED_LENS_M = 0.2;
const PED_LAMPS: PedLamp[] = ["detenido", "camina"];
const PED_LAMP_COLORS: Record<PedLamp, string> = {
  detenido: "#ff3b1f",
  camina: "#2bd96e",
};

/**
 * Figura del semáforo peatonal en blanco sobre negro, para el mapa emisivo (solo en el navegador;
 * en pruebas sin DOM la lente se enciende completa). Detenida: de frente y con los brazos abajo.
 * Camina: de perfil, con un paso abierto.
 */
function figureTexture(kind: PedLamp): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(64, 22, 11, 0, 2 * Math.PI);
  ctx.fill();
  const line = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  };
  if (kind === "detenido") {
    line([
      [64, 40],
      [64, 80],
    ]);
    line([
      [50, 44],
      [44, 76],
    ]);
    line([
      [78, 44],
      [84, 76],
    ]);
    line([
      [58, 82],
      [56, 116],
    ]);
    line([
      [70, 82],
      [72, 116],
    ]);
  } else {
    line([
      [62, 40],
      [58, 78],
    ]);
    line([
      [60, 46],
      [42, 66],
    ]);
    line([
      [62, 46],
      [82, 62],
    ]);
    line([
      [58, 78],
      [40, 114],
    ]);
    line([
      [58, 78],
      [80, 114],
    ]);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export interface DeviceInput {
  tipo: string;
  /** Límite de velocidad en km/h, para el texto de la placa. */
  limiteKmh?: number;
  /** Fases del semáforo, cada una con el rumbo (rad, marco local del dispositivo) al que mira. */
  fases?: { phase: SignalPhase; yaw: number }[];
  /** Ancho del tope (m): el de la calzada. */
  anchoTopeM?: number;
}

export interface DeviceNode {
  group: Group;
  /** Enciende las lámparas que tocan en el instante t. */
  update(t: number): void;
  materials: Material[];
  /** Lámparas encendidas por cabeza en el último update (pruebas y panel). */
  lit(): (Lamp | PedLamp | null)[];
}

function mat(color: string, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0 });
  Object.assign(m, extra);
  return m;
}

function textTexture(lines: string[], fg: string, bg: string | null): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 256);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = lines.length > 1 ? 72 : 96;
  ctx.font = `bold ${size}px sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, 128, 128 + (i - (lines.length - 1) / 2) * size));
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function regularPolygon(sides: number, circumR: number, rotation: number): Shape {
  const s = new Shape();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (2 * Math.PI * i) / sides;
    const x = circumR * Math.cos(a);
    const y = circumR * Math.sin(a);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/** Placa plana mirando a +x local (hacia quien se acerca si el dispositivo mira a su flujo). */
function facePlate(mesh: Mesh, y: number): Mesh {
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(0.03, y, 0);
  return mesh;
}

export function buildDevice(d: DeviceInput, metal: Material): DeviceNode {
  const group = new Group();
  const materials: MeshStandardMaterial[] = [];
  const keep = <T extends MeshStandardMaterial>(m: T): T => {
    materials.push(m);
    return m;
  };
  // Cada cabeza: qué lámpara toca en t, sus materiales y su color encendido.
  const heads: {
    at: (t: number) => string | null;
    lamps: Map<string, { m: MeshStandardMaterial; color: string }>;
    lit: string | null;
  }[] = [];

  if (d.tipo === "tope") {
    const bump = new Mesh(
      new BoxGeometry(0.6, 0.08, d.anchoTopeM ?? 3.5),
      keep(mat("#e3b21c", { roughness: 0.6 })),
    );
    bump.name = "tope";
    bump.position.y = 0.04;
    group.add(bump);
  } else if (d.tipo === "semaforo") {
    const h = 3.2;
    const pole = new Mesh(new CylinderGeometry(0.07, 0.08, h, 10), metal);
    pole.position.y = h / 2;
    pole.castShadow = true;
    group.add(pole);
    const fases =
      d.fases && d.fases.length > 0 ? d.fases : [{ phase: { color: "apagado" as const }, yaw: 0 }];
    const housing = keep(mat("#1d1f22", { roughness: 0.7 }));
    for (const f of fases) {
      const head = new Group();
      head.name = "cabeza_semaforo";
      head.rotation.y = f.yaw;
      const box = new Mesh(new BoxGeometry(0.32, 1.05, 0.38), housing);
      box.position.set(0.16, 0, 0);
      head.add(box);
      const lamps = new Map<string, { m: MeshStandardMaterial; color: string }>();
      LAMPS.forEach((l, i) => {
        const m = keep(
          mat("#2a2b2d", { emissive: new Color(LAMP_COLORS[l]), emissiveIntensity: 0 }),
        );
        const lens = new Mesh(new CircleGeometry(LENS_M / 2, 24), m);
        lens.name = `lampara_${l}`;
        lens.rotation.y = Math.PI / 2;
        lens.position.set(0.325, 0.33 - i * 0.33, 0);
        head.add(lens);
        lamps.set(l, { m, color: LAMP_COLORS[l] });
      });
      head.position.y = h + 0.5;
      group.add(head);
      heads.push({ at: (t) => lampAt(f.phase, t), lamps, lit: null });
    }
  } else if (d.tipo === "semaforo_peatonal") {
    // Poste más bajo que el vehicular y una cabeza con dos lentes cuadradas: arriba la figura
    // detenida (roja) y abajo la que camina (verde), dibujadas en una textura de lienzo.
    const h = 2.5;
    const pole = new Mesh(new CylinderGeometry(0.05, 0.06, h, 10), metal);
    pole.position.y = h / 2;
    pole.castShadow = true;
    group.add(pole);
    const fases =
      d.fases && d.fases.length > 0 ? d.fases : [{ phase: { color: "apagado" as const }, yaw: 0 }];
    const housing = keep(mat("#1d1f22", { roughness: 0.7 }));
    for (const f of fases) {
      const head = new Group();
      head.name = "cabeza_semaforo_peatonal";
      head.rotation.y = f.yaw;
      const box = new Mesh(new BoxGeometry(0.25, 0.62, 0.32), housing);
      box.position.set(0.125, 0, 0);
      head.add(box);
      const lamps = new Map<string, { m: MeshStandardMaterial; color: string }>();
      PED_LAMPS.forEach((l, i) => {
        const figure = figureTexture(l);
        const m = keep(
          mat("#2a2b2d", {
            emissive: new Color(PED_LAMP_COLORS[l]),
            emissiveIntensity: 0,
            ...(figure ? { emissiveMap: figure } : {}),
          }),
        );
        const lens = new Mesh(new PlaneGeometry(PED_LENS_M, PED_LENS_M), m);
        lens.name = `lampara_peatonal_${l}`;
        lens.rotation.y = Math.PI / 2;
        lens.position.set(0.252, 0.15 - i * 0.3, 0);
        head.add(lens);
        lamps.set(l, { m, color: PED_LAMP_COLORS[l] });
      });
      head.position.y = h + 0.1;
      group.add(head);
      heads.push({ at: (t) => pedLampAt(f.phase, t), lamps, lit: null });
    }
  } else if (
    d.tipo === "alto" ||
    d.tipo === "ceda_el_paso" ||
    d.tipo === "limite_velocidad" ||
    d.tipo === "no_vuelta" ||
    d.tipo === "un_sentido" ||
    d.tipo === "otro"
  ) {
    const h = 2.4;
    const pole = new Mesh(new CylinderGeometry(0.04, 0.045, h, 8), metal);
    pole.position.y = h / 2;
    pole.castShadow = true;
    group.add(pole);
    const plateY = h - 0.15;
    const plate = new Group();
    plate.name = `placa_${d.tipo}`;
    if (d.tipo === "alto") {
      const r = STOP_SIDE_M / (2 * Math.sin(Math.PI / 8));
      const red = keep(mat("#b3261e", { side: DoubleSide }));
      const oct = new Mesh(new ShapeGeometry(regularPolygon(8, r, Math.PI / 8)), red);
      plate.add(facePlate(oct, plateY));
      const tex = textTexture(["ALTO"], "#ffffff", null);
      if (tex) {
        const label = new Mesh(
          new PlaneGeometry(r * 1.4, r * 1.4),
          keep(mat("#ffffff", { map: tex, transparent: true, side: DoubleSide })),
        );
        plate.add(facePlate(label, plateY));
        label.position.x += 0.002;
      }
    } else if (d.tipo === "ceda_el_paso") {
      const r = YIELD_SIDE_M / Math.sqrt(3);
      const red = keep(mat("#b3261e", { side: DoubleSide }));
      const white = keep(mat("#f2f2ee", { side: DoubleSide }));
      plate.add(
        facePlate(new Mesh(new ShapeGeometry(regularPolygon(3, r, -Math.PI / 2)), red), plateY),
      );
      const inner = facePlate(
        new Mesh(new ShapeGeometry(regularPolygon(3, r * 0.62, -Math.PI / 2)), white),
        plateY,
      );
      inner.position.x += 0.002;
      plate.add(inner);
    } else if (d.tipo === "limite_velocidad" || d.tipo === "no_vuelta") {
      const white = keep(mat("#f2f2ee", { side: DoubleSide }));
      const red = keep(mat("#b3261e", { side: DoubleSide }));
      const board = new Mesh(new PlaneGeometry(RESTRICTIVE_BOARD_M, RESTRICTIVE_BOARD_M), white);
      plate.add(facePlate(board, plateY));
      const ring = facePlate(
        new Mesh(
          new RingGeometry(RESTRICTIVE_CIRCLE_M / 2 - 0.06, RESTRICTIVE_CIRCLE_M / 2, 40),
          red,
        ),
        plateY,
      );
      ring.position.x += 0.002;
      plate.add(ring);
      if (d.tipo === "no_vuelta") {
        const bar = facePlate(
          new Mesh(new PlaneGeometry(RESTRICTIVE_CIRCLE_M - 0.06, 0.06), red),
          plateY,
        );
        bar.rotation.x = Math.PI / 4;
        bar.position.x += 0.004;
        plate.add(bar);
      } else {
        const tex = textTexture(
          [d.limiteKmh !== undefined ? String(Math.round(d.limiteKmh)) : "", "km/h"],
          "#111111",
          null,
        );
        if (tex) {
          const label = facePlate(
            new Mesh(
              new PlaneGeometry(RESTRICTIVE_CIRCLE_M - 0.14, RESTRICTIVE_CIRCLE_M - 0.14),
              keep(mat("#ffffff", { map: tex, transparent: true, side: DoubleSide })),
            ),
            plateY,
          );
          label.position.x += 0.004;
          plate.add(label);
        }
      }
    } else if (d.tipo === "un_sentido") {
      const black = keep(mat("#151515", { side: DoubleSide }));
      const white = keep(mat("#f2f2ee", { side: DoubleSide }));
      plate.add(facePlate(new Mesh(new PlaneGeometry(0.91, 0.3), black), plateY));
      const arrow = new Shape();
      arrow.moveTo(-0.38, -0.04);
      arrow.lineTo(0.2, -0.04);
      arrow.lineTo(0.2, -0.1);
      arrow.lineTo(0.38, 0);
      arrow.lineTo(0.2, 0.1);
      arrow.lineTo(0.2, 0.04);
      arrow.lineTo(-0.38, 0.04);
      arrow.closePath();
      const a = facePlate(new Mesh(new ShapeGeometry(arrow), white), plateY);
      a.position.x += 0.002;
      plate.add(a);
    } else {
      plate.add(
        facePlate(
          new Mesh(new PlaneGeometry(0.6, 0.6), keep(mat("#c8c8c8", { side: DoubleSide }))),
          plateY,
        ),
      );
    }
    group.add(plate);
  }

  return {
    group,
    materials,
    update(t: number) {
      for (const head of heads) {
        const on = head.at(t);
        if (on === head.lit) continue;
        head.lit = on;
        // Cambio de propiedades, no de material: sin compilar sombreadores a media reproducción.
        for (const [l, { m, color }] of head.lamps) {
          m.emissiveIntensity = l === on ? 3 : 0;
          m.color.set(l === on ? color : "#2a2b2d");
        }
      }
    },
    lit() {
      return heads.map((h) => h.lit as Lamp | PedLamp | null);
    },
  };
}
