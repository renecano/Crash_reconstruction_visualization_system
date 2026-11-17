/**
 * La hoja milimétrica del tráiler, dibujada en un lienzo con la cámara de `camara.ts`: la cuadrícula
 * en perspectiva (con las líneas finas solo donde se distinguen), la paleta que va de papel a noche y
 * la onda del impacto, que dobla la cuadrícula. Todo en código: ninguna imagen.
 */
import type { Proyector, PuntoEnPantalla } from "./camara";

export interface Paleta {
  fondo: string;
  /** La línea de la cuadrícula. */
  linea: string;
  /** El trazo (lápiz o tinta) y el texto. */
  tinta: string;
  /** La señal: una sola. */
  senal: string;
  /** Un vehículo. */
  vehiculo: string;
}

type Rgb = readonly [number, number, number];
const PAPEL = {
  fondo: [239, 235, 225],
  linea: [150, 140, 120],
  tinta: [21, 24, 27],
  vehiculo: [21, 24, 27],
} satisfies Record<string, Rgb>;
const NOCHE = {
  fondo: [10, 17, 32],
  linea: [143, 161, 191],
  tinta: [232, 238, 248],
  vehiculo: [232, 238, 248],
} satisfies Record<string, Rgb>;

export const SENAL = "#FF5B2E";

const rgb = (c: Rgb) => `rgb(${c.map((v) => Math.round(v)).join(",")})`;
const entreColores = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** La paleta entre papel (0) y noche (1). */
export function paleta(noche: number): Paleta {
  const t = Math.min(1, Math.max(0, noche));
  return {
    fondo: rgb(entreColores(PAPEL.fondo, NOCHE.fondo, t)),
    linea: rgb(entreColores(PAPEL.linea, NOCHE.linea, t)),
    tinta: rgb(entreColores(PAPEL.tinta, NOCHE.tinta, t)),
    senal: SENAL,
    vehiculo: rgb(entreColores(PAPEL.vehiculo, NOCHE.vehiculo, t)),
  };
}

/** La onda del impacto: un frente que crece desde un punto y empuja lo que toca. */
export interface Onda {
  x: number;
  y: number;
  /** El radio del frente (m). */
  radio: number;
  /** Cuánto empuja en el frente (m). */
  fuerza: number;
  /** El grosor del frente (m). */
  grosor: number;
}

/** A dónde mueve la onda un punto de la hoja. */
export function conOnda(o: Onda | null, x: number, y: number): [number, number] {
  if (!o || o.fuerza === 0) return [x, y];
  const dx = x - o.x;
  const dy = y - o.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return [x, y];
  // Empuja hacia afuera en el frente y jala un poco hacia adentro cerca del centro.
  const s =
    o.fuerza * Math.exp(-(((d - o.radio) / o.grosor) ** 2)) -
    o.fuerza * 0.45 * Math.exp(-((d / (o.grosor * 1.1)) ** 2));
  return [x + (dx / d) * s, y + (dy / d) * s];
}

/**
 * Dibuja la cuadrícula alrededor de (cx, cy): líneas cada `paso` metros hasta `alcance`, más marcadas
 * cada 5 y cada 10. Las finas se apagan donde ya no se distinguen (menos de `minPx` entre líneas), para
 * que el horizonte no se vuelva una mancha. Con onda, cada línea se dibuja por tramos y se dobla.
 */
export function dibujarCuadricula(
  ctx: CanvasRenderingContext2D,
  p: Proyector,
  o: {
    cx: number;
    cy: number;
    alcance: number;
    paso: number;
    color: string;
    /** Opacidad de la línea más marcada. */
    opacidad: number;
    /** El grosor de la línea más marcada, en px. */
    grosor: number;
    onda?: Onda | null;
    /** A partir de qué distancia (m) la cuadrícula se desvanece hacia el horizonte. */
    niebla?: number;
  },
): void {
  const { cx, cy, alcance, paso, onda = null } = o;
  const x0 = Math.floor((cx - alcance) / paso) * paso;
  const y0 = Math.floor((cy - alcance) / paso) * paso;
  const n = Math.ceil((alcance * 2) / paso);
  const niebla = o.niebla ?? alcance;
  ctx.save();
  ctx.strokeStyle = o.color;
  ctx.lineCap = "butt";

  const tramo = (ax: number, ay: number, bx: number, by: number, peso: number) => {
    const [wax, way] = conOnda(onda, ax, ay);
    const [wbx, wby] = conOnda(onda, bx, by);
    const s = p.segmento([wax, way], [wbx, wby]);
    if (!s) return;
    const prof = (s[0].prof + s[1].prof) / 2;
    // Las líneas finas solo donde se distinguen.
    const px = p.pxPorMetro(prof) * paso * (peso === 1 ? 1 : peso === 2 ? 5 : 10);
    const nitidez = Math.min(1, Math.max(0, (px - 5) / 9));
    const lejos = Math.min(1, Math.max(0, 1 - (prof - niebla * 0.35) / (niebla * 0.65)));
    const a = o.opacidad * (peso === 1 ? 0.3 : peso === 2 ? 0.6 : 1) * nitidez * lejos;
    if (a < 0.012) return;
    ctx.globalAlpha = a;
    ctx.lineWidth = o.grosor * (peso === 1 ? 0.45 : peso === 2 ? 0.7 : 1);
    ctx.beginPath();
    ctx.moveTo(s[0].x, s[0].y);
    ctx.lineTo(s[1].x, s[1].y);
    ctx.stroke();
  };

  // Cada línea, por tramos: la perspectiva cambia su opacidad a lo largo, y la onda la dobla.
  const trozo = Math.max(paso, alcance / 28);
  for (let i = 0; i <= n; i++) {
    const v = Math.round((x0 + i * paso) / paso);
    const peso = v % 10 === 0 ? 3 : v % 5 === 0 ? 2 : 1;
    const x = x0 + i * paso;
    for (let y = y0; y < y0 + n * paso; y += trozo)
      tramo(x, y, x, Math.min(y + trozo, y0 + n * paso), peso);
  }
  for (let j = 0; j <= n; j++) {
    const v = Math.round((y0 + j * paso) / paso);
    const peso = v % 10 === 0 ? 3 : v % 5 === 0 ? 2 : 1;
    const y = y0 + j * paso;
    for (let x = x0; x < x0 + n * paso; x += trozo)
      tramo(x, y, Math.min(x + trozo, x0 + n * paso), y, peso);
  }
  ctx.restore();
}

/** Una polilínea del mundo en la pantalla, hasta la fracción `hasta` de su largo (0 a 1). */
export function trazarPolilinea(
  ctx: CanvasRenderingContext2D,
  p: Proyector,
  puntos: readonly (readonly [number, number])[],
  hasta = 1,
  onda: Onda | null = null,
): void {
  if (puntos.length < 2 || hasta <= 0) return;
  const largos: number[] = [0];
  for (let i = 1; i < puntos.length; i++)
    largos.push(
      largos[i - 1]! +
        Math.hypot(puntos[i]![0] - puntos[i - 1]![0], puntos[i]![1] - puntos[i - 1]![1]),
    );
  const tope = largos[largos.length - 1]! * Math.min(1, hasta);
  ctx.beginPath();
  let abierto = false;
  for (let i = 1; i < puntos.length; i++) {
    if (largos[i - 1]! >= tope) break;
    let [bx, by] = puntos[i]!;
    const [ax, ay] = puntos[i - 1]!;
    if (largos[i]! > tope) {
      const t = (tope - largos[i - 1]!) / (largos[i]! - largos[i - 1]!);
      bx = ax + (bx - ax) * t;
      by = ay + (by - ay) * t;
    }
    const [wax, way] = conOnda(onda, ax, ay);
    const [wbx, wby] = conOnda(onda, bx, by);
    const s = p.segmento([wax, way], [wbx, wby]);
    if (!s) {
      abierto = false;
      continue;
    }
    if (!abierto) ctx.moveTo(s[0].x, s[0].y);
    ctx.lineTo(s[1].x, s[1].y);
    abierto = true;
  }
  ctx.stroke();
}

/** El punto a la fracción `t` del largo de una polilínea y su rumbo (radianes). */
export function puntoEnPolilinea(
  puntos: readonly (readonly [number, number])[],
  t: number,
): { x: number; y: number; rumbo: number } {
  const largos: number[] = [0];
  for (let i = 1; i < puntos.length; i++)
    largos.push(
      largos[i - 1]! +
        Math.hypot(puntos[i]![0] - puntos[i - 1]![0], puntos[i]![1] - puntos[i - 1]![1]),
    );
  const tope = largos[largos.length - 1]! * Math.min(1, Math.max(0, t));
  for (let i = 1; i < puntos.length; i++) {
    if (largos[i]! >= tope || i === puntos.length - 1) {
      const [ax, ay] = puntos[i - 1]!;
      const [bx, by] = puntos[i]!;
      const d = largos[i]! - largos[i - 1]!;
      const u = d > 0 ? Math.min(1, (tope - largos[i - 1]!) / d) : 0;
      return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u, rumbo: Math.atan2(by - ay, bx - ax) };
    }
  }
  return { x: puntos[0]![0], y: puntos[0]![1], rumbo: 0 };
}

/** Un rectángulo del mundo (un vehículo visto desde arriba) como polígono en pantalla. */
export function rectanguloEnPantalla(
  p: Proyector,
  x: number,
  y: number,
  rumbo: number,
  largo: number,
  ancho: number,
  onda: Onda | null = null,
): { x: number; y: number }[] | null {
  const c = Math.cos(rumbo);
  const s = Math.sin(rumbo);
  const out: { x: number; y: number }[] = [];
  for (const [l, a] of [
    [0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
    [-0.5, 0.5],
  ] as const) {
    const [wx, wy] = conOnda(
      onda,
      x + c * l * largo - s * a * ancho,
      y + s * l * largo + c * a * ancho,
    );
    const q = p.punto(wx, wy);
    if (!q) return null;
    out.push({ x: q.x, y: q.y });
  }
  return out;
}

/** Ruido suave de una dimensión, entre 0 y 1, con semilla (para la presión del lápiz). */
export function ruidoSuave(x: number, semilla: number): number {
  const dado = (n: number) => {
    const v = Math.sin(n * 127.1 + semilla * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return dado(i) * (1 - u) + dado(i + 1) * u;
}

/**
 * Un trazo de lápiz: la línea no es pareja, cambia de grueso y de tono con la presión de la mano, y el
 * grafito deja granos y pequeños huecos sobre el papel. `hasta` es la fracción dibujada (0 a 1).
 */
export function trazoDeGrafito(
  ctx: CanvasRenderingContext2D,
  p: Proyector,
  puntos: readonly (readonly [number, number])[],
  o: {
    /** El grueso medio, en px. */
    grueso: number;
    opacidad: number;
    semilla: number;
    hasta?: number;
    onda?: Onda | null;
    /** Cada cuántos metros cambia el trazo (más chico, más fino el grano). */
    paso?: number;
  },
): void {
  if (puntos.length < 2) return;
  const paso = o.paso ?? 0.3;
  const onda = o.onda ?? null;
  const largos: number[] = [0];
  for (let i = 1; i < puntos.length; i++)
    largos.push(
      largos[i - 1]! +
        Math.hypot(puntos[i]![0] - puntos[i - 1]![0], puntos[i]![1] - puntos[i - 1]![1]),
    );
  const total = largos[largos.length - 1]!;
  const tope = total * Math.min(1, Math.max(0, o.hasta ?? 1));
  const en = (d: number): [number, number] => {
    let i = 1;
    while (i < puntos.length - 1 && largos[i]! < d) i++;
    const u = (d - largos[i - 1]!) / Math.max(1e-9, largos[i]! - largos[i - 1]!);
    return [
      puntos[i - 1]![0] + (puntos[i]![0] - puntos[i - 1]![0]) * u,
      puntos[i - 1]![1] + (puntos[i]![1] - puntos[i - 1]![1]) * u,
    ];
  };
  ctx.save();
  // Sin remates redondos: con ellos, cada unión de dos tramos translúcidos dejaba un punto oscuro.
  ctx.lineCap = "butt";
  const tramo = (a: PuntoEnPantalla, b: PuntoEnPantalla, corrida: number) => {
    // La corrida va perpendicular al trazo, en la pantalla.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const n = Math.hypot(dx, dy) || 1;
    const ox = (-dy / n) * corrida;
    const oy = (dx / n) * corrida;
    ctx.beginPath();
    ctx.moveTo(a.x + ox, a.y + oy);
    ctx.lineTo(b.x + ox, b.y + oy);
    ctx.stroke();
  };
  for (let d = 0; d < tope; d += paso) {
    const d2 = Math.min(tope, d + paso * 1.04);
    const [ax, ay] = conOnda(onda, ...en(d));
    const [bx, by] = conOnda(onda, ...en(d2));
    const s = p.segmento([ax, ay], [bx, by]);
    if (!s) continue;
    // La presión: sube y baja despacio a lo largo del trazo, con un temblor fino encima.
    const presion =
      0.62 * ruidoSuave(d * 0.21, o.semilla) + 0.38 * ruidoSuave(d * 1.7, o.semilla + 5);
    // Un hueco de vez en cuando: el grafito no agarra parejo en el papel.
    if (ruidoSuave(d * 1.3, o.semilla + 11) > 0.965) continue;
    const grueso = o.grueso * (0.6 + 0.8 * presion);
    // El centro del trazo, y dos orillas que a ratos faltan: el borde queda irregular, como grafito.
    ctx.globalAlpha = o.opacidad * (0.52 + 0.48 * presion);
    ctx.lineWidth = grueso * 0.62;
    tramo(s[0], s[1], 0);
    for (const lado of [-1, 1]) {
      const grano = ruidoSuave(d * 2.9 + lado * 40, o.semilla + 23);
      if (grano < 0.3) continue;
      ctx.globalAlpha = o.opacidad * (0.22 + 0.5 * grano * presion);
      ctx.lineWidth = grueso * 0.3;
      tramo(s[0], s[1], lado * grueso * 0.36);
    }
  }
  ctx.restore();
}
