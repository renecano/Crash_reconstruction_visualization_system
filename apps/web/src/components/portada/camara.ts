/**
 * La cámara y el tiempo de la portada (PLAN §11.3), como funciones puras de la posición del scroll.
 *
 * Técnica de «mundo por scroll» (skill `scroll-world`): el scroll es el tiempo del viaje; la cámara
 * recorre una curva continua (Catmull-Rom) que pasa por una pose por capítulo, y `linger` la frena
 * a mitad de cada capítulo, cuando el texto llega a su pico. `p` va de 0 a N (N capítulos): la parte
 * entera es el capítulo y la fraccionaria, el avance dentro de él.
 *
 * Las poses están en el marco de la escena de Toluca (x al este, y al norte, metros; el impacto es
 * casi el origen). El tiempo de la escena (0 = impacto) y el revelado del croquis al 3D también
 * dependen de `p`; todo es determinista, así que el viaje funciona igual hacia atrás.
 */
import { toThree, type CameraPose, type Vec3 } from "@croquis/viewer";

export const CAPITULOS = [
  "apertura",
  "problema",
  "c",
  "r",
  "o",
  "q",
  "u",
  "i",
  "s",
  "pruebas",
  "noes",
  "cierre",
] as const;
export type Capitulo = (typeof CAPITULOS)[number];
export const N = CAPITULOS.length;
const IDX = Object.fromEntries(CAPITULOS.map((c, i) => [c, i])) as Record<Capitulo, number>;

/** Pose de cada capítulo: posición y punto que mira, (x, y, altura) en metros de la escena. */
const POSES: { pos: [number, number, number]; mira: [number, number, number] }[] = [
  { pos: [-42, -1.5, 1.7], mira: [0, 2.2, 1.1] }, // apertura: a la altura de la calle, detrás de A
  { pos: [-26, -34, 38], mira: [0, 2, 0] }, // el problema: arriba y lejos (velo fuerte)
  { pos: [24, -30, 26], mira: [0, 4, 0] }, // C (velo fuerte)
  { pos: [30, 10, 28], mira: [0, 4, 0] }, // R (velo fuerte)
  // Desde aquí la cámara mira la acción y `centroPantalla` la pone del lado contrario al texto.
  { pos: [-22, 24, 15], mira: [0, 3, 0] }, // O
  { pos: [-26, -12, 17], mira: [0, 4, 0] }, // Q
  // U: cenital, sobre el centro del croquis pintado (de dónde salió cada auto a dónde quedó).
  { pos: [-11.5, 18, 72], mira: [-11.6, 18, 0] },
  { pos: [-12, -8, 3.4], mira: [0, 2.5, 0.4] }, // I: a la altura de la calle, junto al impacto
  { pos: [-16, 9, 4.5], mira: [1, 1.5, 0.7] }, // S: a un lado del cruce, sin postes enfrente
  { pos: [-30, 22, 24], mira: [0, 2, 0] }, // las pruebas (velo fuerte)
  { pos: [-36, -20, 30], mira: [0, 2, 0] }, // lo que no es (velo fuerte)
  { pos: [-46, -1.5, 3.2], mira: [0, 2.2, 1.1] }, // cierre
];

/**
 * Dónde queda en la pantalla el punto que mira la cámara, por capítulo (fracciones del ancho y
 * del alto). En escritorio el texto va a la izquierda y la acción a la derecha; en el celular el
 * texto va abajo y la acción arriba. La apertura, las pruebas y el cierre van al centro.
 */
const CENTRO_ANCHO = [0.5, 0.5, 0.62, 0.62, 0.66, 0.66, 0.72, 0.64, 0.66, 0.5, 0.62, 0.5];
const CENTRO_ALTO = [0.5, 0.4, 0.32, 0.3, 0.34, 0.34, 0.36, 0.36, 0.34, 0.5, 0.34, 0.5];

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (x: number) => {
  const c = clamp(x);
  return c * c * (3 - 2 * c);
};
/** La cámara se asienta a mitad del capítulo: f(0)=0, f(0.5)=0.5, f(1)=1 (las costuras no se tocan). */
export function linger(x: number, L = 0.4): number {
  const c = x - 0.5;
  return (1 - L) * x + L * (4 * c * c * c + 0.5);
}

type P3 = [number, number, number];
/** Catmull-Rom centrípeto simplificado (uniforme) entre p1 y p2. */
function catmull(p0: P3, p1: P3, p2: P3, p3: P3, t: number): P3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [
    f(p0[0], p1[0], p2[0], p3[0]),
    f(p0[1], p1[1], p2[1], p3[1]),
    f(p0[2], p1[2], p2[2], p3[2]),
  ];
}

function sobreCurva(puntos: readonly P3[], u: number): P3 {
  // u en [0, N-1]: entre la pose floor(u) y la siguiente.
  const i = Math.min(puntos.length - 2, Math.max(0, Math.floor(u)));
  const t = clamp(u - i);
  const g = (k: number) => puntos[Math.min(puntos.length - 1, Math.max(0, k))]!;
  return catmull(g(i - 1), g(i), g(i + 1), g(i + 2), t);
}

/**
 * Posición continua en la curva: cada capítulo se asienta en su pose a la mitad (linger) y viaja a
 * la siguiente en la segunda mitad y la primera del que sigue.
 */
function u(p: number): number {
  const c = clamp(p, 0, N - 1e-6);
  const i = Math.floor(c);
  const l = c - i;
  // De la mitad de un capítulo a la mitad del siguiente se recorre un tramo de la curva.
  const centrado = i + linger(l) - 0.5;
  return clamp(centrado, 0, N - 1);
}

/** Pose de la cámara para la posición de scroll p (0…N) y el aspecto de la pantalla. */
export function poseCamara(p: number, aspecto: number): CameraPose {
  const pos = sobreCurva(
    POSES.map((x) => x.pos),
    u(p),
  );
  const mira = sobreCurva(
    POSES.map((x) => x.mira),
    u(p),
  );
  // En vertical se aleja para que la escena quepa (como en `scroll-world`).
  const k = aspecto < 1 ? 1 + (1 - aspecto) * 0.8 : 1;
  const d: P3 = [pos[0] - mira[0], pos[1] - mira[1], pos[2] - mira[2]];
  const lejos: P3 = [mira[0] + d[0] * k, mira[1] + d[1] * k, mira[2] + d[2] * k];
  // Cerca de la vista cenital, «arriba» en la pantalla es el norte (-z en three.js).
  const cenital = 1 - clamp(Math.abs(u(p) - IDX.u) * 1.6);
  const up: Vec3 = normalizar([0, 1 - cenital, -cenital]);
  return {
    position: toThree(lejos[0], lejos[1], lejos[2]),
    target: toThree(mira[0], mira[1], mira[2]),
    fov: aspecto < 1 ? 58 : 40,
    up,
  };
}

function normalizar(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** Instante antes del impacto en que se cuenta la historia y ventana que recorre «Impacta». */
export const T_ANTES = -1.2;
export const T_DESPUES = 2.4;

/** Tiempo de la escena (s; 0 = impacto) para la posición p. En «Impacta» lo maneja el scroll. */
export function tiempoEscena(p: number): number {
  const i = IDX.i;
  if (p < i) return T_ANTES;
  if (p >= i + 1) return T_DESPUES;
  // Primero termina de levantarse la escena (0–0.25); luego corre el tiempo hasta el reposo.
  const l = clamp((p - i - 0.25) / 0.6);
  return T_ANTES + (T_DESPUES - T_ANTES) * l;
}

/**
 * Revelado del croquis al 3D (0 = solo la pintura, 1 = la escena). Al acercarse a «Ubica» la
 * escena se desvanece en la pintura; entre «Ubica» e «Impacta» las líneas se levantan.
 */
export function revelado(p: number): number {
  const q = IDX.u;
  if (p < q - 0.4) return 1;
  if (p < q) return 1 - smooth((p - (q - 0.4)) / 0.4);
  if (p < q + 0.55) return 0;
  return smooth((p - (q + 0.55)) / 0.7);
}

/** Opacidad del texto de un capítulo: llega a 1 a la mitad y se va antes de la costura. */
export function opacidadTexto(p: number, k: number): number {
  const l = p - k;
  if (k === 0) return l > 1 ? 0 : 1 - smooth((l - 0.55) / 0.4);
  // El cierre llega pronto: después de él sube el pie de página.
  if (k === N - 1) return l < 0 ? 0 : smooth(l / 0.25);
  if (l < 0 || l > 1) return 0;
  return smooth(1 - Math.abs(l - 0.5) / 0.45);
}

/** Velo oscuro detrás del texto (0–1): más fuerte donde el texto pesa más que la escena. */
export function velo(p: number): number {
  const fuerte = new Set<Capitulo>(["problema", "c", "r", "pruebas", "noes"]);
  const i = Math.min(N - 1, Math.max(0, Math.floor(p)));
  return fuerte.has(CAPITULOS[i]!) ? 0.78 : 0.45;
}

export function indiceDe(c: Capitulo): number {
  return IDX[c];
}

/** El punto que mira la cámara, en fracciones de la pantalla, a lo largo del viaje. */
export function centroPantalla(p: number, aspecto: number): readonly [number, number] {
  const tabla = aspecto < 1 ? CENTRO_ALTO : CENTRO_ANCHO;
  const x = u(p);
  const i = Math.min(N - 2, Math.floor(x));
  const f = clamp(x - i);
  const v = tabla[i]! + (tabla[i + 1]! - tabla[i]!) * smooth(f);
  return aspecto < 1 ? [0.5, v] : [v, 0.5];
}

/** Las marcas del choque (punto de impacto) aparecen con el croquis: antes no hay evidencia. */
export function conMarcas(p: number): boolean {
  return p >= IDX.u - 0.4;
}
