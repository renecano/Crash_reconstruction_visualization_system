/**
 * El 2D de Reconstrucción como el croquis de un perito (ronda 4, propuesta 2 elegida por René,
 * 2026-11-18). Una sola función arma el SVG, y lo usan la pantalla y el dictamen: los dos son el
 * mismo dibujo.
 *
 * - **Girado** para que la vía principal (la del choque) quede horizontal; el norte gira con él.
 * - **Encuadra la zona del choque**; «Ver todo» encuadra los recorridos completos.
 * - **La vía** con sus bordes y carriles en negro, sobre papel blanco. Debajo, si se pide, el mapa o
 *   la foto satelital, tenues.
 * - **Cada vehículo** en tres posiciones: 1 antes del impacto (punteado), 2 en el impacto y 3 en
 *   reposo (gris), con su letra y su número (A1, A2, A3) en un círculo, separado con una línea guía
 *   para que ninguna etiqueta se enciman.
 * - **El recorrido** de cada uno, en negro o, con el interruptor, coloreado por su velocidad.
 * - **El punto de impacto**, el norte y la escala gráfica.
 *
 * Solo dibuja lo que calculó el solver: ningún número nuevo.
 */
import { sceneLayout } from "@croquis/croquis-2d";
import type { EscenaSpec } from "@croquis/scene-schema";
import { tImpacto, poseEn, type ResultadoMaqueta, type TrayectoriaResultado } from "./maqueta";

export interface ViaCroquis {
  puntos: { x: number; y: number }[];
  ancho: number;
  carriles?: number;
  unSentido?: boolean;
  tipo?: string;
}

export interface OpcionesCroquis {
  /** Proporción del lugar donde se dibuja (ancho / alto). */
  proporcion: number;
  /** Encuadrar los recorridos completos en vez de la zona del choque. */
  todo?: boolean;
  /** Colorear los recorridos por su velocidad. */
  color?: boolean;
  /** El mapa o la foto satelital, debajo y tenue, en coordenadas de la escena. */
  fondo?: {
    imagen: string;
    centroX: number;
    centroY: number;
    ladoM: number;
    opacidad: number;
  } | null;
}

/** Un vehículo en movimiento en el instante de la línea de tiempo, en las coordenadas del croquis. */
export interface VehiculoAhora {
  id: string;
  puntos: { x: number; y: number }[];
}

type P = { x: number; y: number };
const r1 = (x: number) => Math.round(x * 100) / 100;
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** La jerarquía de una vía para elegir la principal (la más importante cerca del choque). */
const RANGO: Record<string, number> = {
  motorway: 9,
  trunk: 8,
  primary: 7,
  secondary: 6,
  tertiary: 5,
  unclassified: 4,
  residential: 3,
  service: 1,
};

/** Distancia de `p` al segmento `a`–`b` y el ángulo del segmento (grados, desde el este). */
function aSegmento(p: P, a: P, b: P): { d: number; ang: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return {
    d: Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y),
    ang: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** La diferencia entre dos direcciones de vía (sin sentido), de 0° a 90°. */
const difVia = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 180) + 180) % 180);
  return Math.min(d, 180 - d);
};

/**
 * Hacia dónde avanzaban los vehículos al llegar al choque (grados desde el este): el recorrido del
 * último segundo antes del impacto del que más avanzó; null si nadie se movía.
 */
export function direccionDeLlegada(resultado: ResultadoMaqueta): number | null {
  const ti = tImpacto(resultado);
  let mejor: { m: number; ang: number } | null = null;
  for (const v of resultado.vehiculos) {
    const tr = v.trayectoria;
    if (!tr.t.length) continue;
    const a = poseEn(tr, Math.max(tr.t[0]!, ti - 1));
    const b = poseEn(tr, ti);
    const m = Math.hypot(b.x - a.x, b.y - a.y);
    if (m > 0.5 && (!mejor || m > mejor.m))
      mejor = { m, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  }
  return mejor?.ang ?? null;
}

/**
 * El giro del croquis (grados): el que deja horizontal la vía del choque (o, sin vías, el recorrido
 * del vehículo más rápido), entre −90° y 90° para que nada quede de cabeza.
 */
export function giroDelCroquis(resultado: ResultadoMaqueta, vias: readonly ViaCroquis[]): number {
  const c = resultado.punto_impacto ?? { x: 0, y: 0 };
  // La vía del choque es la que recorren los vehículos al llegar: en un cruce, la de su dirección,
  // no la de más jerarquía (René, 2026-11-25: en la carambola de Tollocan el croquis ponía
  // horizontal a Paseo Tollocan y la calle del choque quedaba vertical). Entre las que contienen el
  // impacto, primero las que van como la llegada (a menos de 30°); luego la de más jerarquía. Si
  // ninguna lo contiene, la más cercana a menos de 30 m.
  const llegada = direccionDeLlegada(resultado);
  let mejor: {
    dentro: boolean;
    alineada: boolean;
    rango: number;
    d: number;
    ang: number;
  } | null = null;
  for (const v of vias) {
    const rango = RANGO[v.tipo ?? ""] ?? 2;
    for (let i = 0; i + 1 < v.puntos.length; i++) {
      const s = aSegmento(c, v.puntos[i]!, v.puntos[i + 1]!);
      if (s.d > Math.max(30, v.ancho * 2)) continue;
      const dentro = s.d <= v.ancho / 2 + 1.5;
      const alineada = llegada !== null && difVia(s.ang, llegada) <= 30;
      const gana =
        !mejor ||
        (dentro && !mejor.dentro) ||
        (dentro === mejor.dentro &&
          (dentro
            ? (alineada && !mejor.alineada) ||
              (alineada === mejor.alineada &&
                (rango > mejor.rango || (rango === mejor.rango && s.d < mejor.d)))
            : s.d < mejor.d));
      if (gana) mejor = { dentro, alineada, rango, d: s.d, ang: s.ang };
    }
  }
  let ang = mejor?.ang;
  if (ang === undefined) {
    const tr = [...resultado.vehiculos].sort(
      (a, b) => recorrido(b.trayectoria) - recorrido(a.trayectoria),
    )[0]?.trayectoria;
    const n = tr?.t.length ?? 0;
    ang =
      tr && n > 1
        ? (Math.atan2(tr.y[n - 1]! - tr.y[0]!, tr.x[n - 1]! - tr.x[0]!) * 180) / Math.PI
        : 0;
  }
  // El ángulo de la vía, a la horizontal: se gira al revés, y nunca más de 90° (sin texto de cabeza).
  let giro = ang;
  while (giro > 90) giro -= 180;
  while (giro <= -90) giro += 180;
  return r1(giro);
}

const recorrido = (tr: TrayectoriaResultado) =>
  tr.t.length > 1 ? Math.hypot(tr.x.at(-1)! - tr.x[0]!, tr.y.at(-1)! - tr.y[0]!) : 0;

/** Las tres posiciones del croquis: 1 antes del impacto, 2 en el impacto, 3 en reposo. */
export function posicionesDelCroquis(tr: TrayectoriaResultado, ti: number) {
  const n = tr.t.length;
  return [
    poseEn(tr, Math.max(tr.t[0]!, ti - 1.5)),
    poseEn(tr, ti),
    { x: tr.x[n - 1]!, y: tr.y[n - 1]!, rumbo: tr.rumbo[n - 1]! },
  ] as const;
}

/** Una escala gráfica redonda: 1, 2, 5, 10, 20, 50… m, cerca de un quinto del ancho. */
export function escalaRedonda(anchoM: number): number {
  const objetivo = anchoM / 5;
  const p = 10 ** Math.floor(Math.log10(objetivo));
  return [1, 2, 5, 10]
    .map((k) => k * p)
    .reduce((a, b) => (Math.abs(b - objetivo) < Math.abs(a - objetivo) ? b : a));
}

/** Desplaza una polilínea a su izquierda `d` m (para las líneas de carril). */
function desplazar(puntos: readonly P[], d: number): P[] {
  return puntos.map((p, i) => {
    const a = puntos[Math.max(0, i - 1)]!;
    const b = puntos[Math.min(puntos.length - 1, i + 1)]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: p.x - ((b.y - a.y) / l) * d, y: p.y + ((b.x - a.x) / l) * d };
  });
}

/** Si los segmentos ab y cd se cruzan (sin contar que compartan un extremo). */
function seCruzan(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Si `p` cae dentro del polígono. */
export function dentroDe(p: P, poli: readonly P[]): boolean {
  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const a = poli[i]!;
    const b = poli[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      dentro = !dentro;
  }
  return dentro;
}

/** Si el segmento ab pasa por el polígono (cruza un lado o cae dentro). */
function cruzaPoligono(a: P, b: P, poli: readonly P[]): boolean {
  for (let i = 0; i < poli.length; i++)
    if (seCruzan(a, b, poli[i]!, poli[(i + 1) % poli.length]!)) return true;
  return dentroDe({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, poli);
}

/**
 * Dónde poner cada etiqueta (René, 2026-11-28): sin encimarse con otra ni con lo ocupado, y que su línea
 * no cruce la de otra etiqueta ni pase por un vehículo ajeno (`estorbos` con otro `dueno`). Prueba
 * alrededor del objeto, de cerca a lejos; si ninguna posición cumple todo, la que menos falla.
 */
export function colocarEtiquetas(
  objetos: readonly { id: string; x: number; y: number; r?: number; dueno?: string }[],
  r: number,
  ocupados: readonly { x: number; y: number; r: number }[] = [],
  estorbos: readonly { dueno: string; puntos: readonly P[] }[] = [],
): Record<string, { x: number; y: number }> {
  const puestos: { x: number; y: number; r: number }[] = [...ocupados];
  const guias: { a: P; b: P }[] = [];
  const out: Record<string, { x: number; y: number }> = {};
  for (const o of objetos) {
    // Cada etiqueta con su tamaño: «Impacto» es más ancha que «A1».
    const ro = o.r ?? r;
    const desde = { x: o.x, y: o.y };
    let mejor: { c: P; malo: number } | null = null;
    busca: for (const dist of [1.6, 2.6, 3.8, 5.2, 7, 9].map((k) => ro + r * k)) {
      for (let k = 0; k < 16; k++) {
        const ang = -Math.PI / 4 + (k * Math.PI) / 8;
        const c = { x: o.x + Math.cos(ang) * dist, y: o.y - Math.sin(ang) * dist };
        let malo = 0;
        if (!puestos.every((q) => Math.hypot(q.x - c.x, q.y - c.y) >= q.r + ro * 1.1)) malo += 100;
        if (guias.some((g) => seCruzan(g.a, g.b, desde, c))) malo += 10;
        if (
          o.dueno !== undefined &&
          estorbos.some(
            (e) =>
              e.dueno !== o.dueno && (cruzaPoligono(desde, c, e.puntos) || dentroDe(c, e.puntos)),
          )
        )
          malo += 10;
        if (!mejor || malo < mejor.malo) mejor = { c, malo };
        if (malo === 0) break busca;
      }
    }
    const elegido = mejor!.c;
    out[o.id] = elegido;
    puestos.push({ ...elegido, r: ro });
    guias.push({ a: desde, b: elegido });
  }
  return out;
}

/** La distancia de `p` a la polilínea `ps`. */
function aPolilinea(p: P, ps: readonly P[]): number {
  let d = Infinity;
  for (let i = 0; i + 1 < ps.length; i++) d = Math.min(d, aSegmento(p, ps[i]!, ps[i + 1]!).d);
  return ps.length === 1 ? Math.hypot(p.x - ps[0]!.x, p.y - ps[0]!.y) : d;
}

/** Si `b` sigue a `a`: comparten un extremo y van casi en línea (OSM parte una calle en tramos). */
function continua(a: ViaCroquis, b: ViaCroquis): boolean {
  const extremos = (v: ViaCroquis) => {
    const n = v.puntos.length;
    const rumbo = (p: P, q: P) => Math.atan2(q.y - p.y, q.x - p.x);
    return [
      { p: v.puntos[0]!, hacia: rumbo(v.puntos[1] ?? v.puntos[0]!, v.puntos[0]!) },
      { p: v.puntos[n - 1]!, hacia: rumbo(v.puntos[n - 2] ?? v.puntos[n - 1]!, v.puntos[n - 1]!) },
    ];
  };
  return extremos(a).some((ea) =>
    extremos(b).some(
      (eb) =>
        Math.hypot(ea.p.x - eb.p.x, ea.p.y - eb.p.y) < 1 && Math.cos(ea.hacia - eb.hacia) < -0.85, // de frente, a menos de ~30°
    ),
  );
}

/** Douglas–Peucker: sin los quiebres de menos de `tol` m; una calle recta queda en una sola recta. */
export function enderezar(ps: readonly P[], tol = 0.8): P[] {
  if (ps.length <= 2) return [...ps];
  const a = ps[0]!;
  const b = ps[ps.length - 1]!;
  let peor = 0;
  let k = 0;
  for (let i = 1; i < ps.length - 1; i++) {
    const d = aSegmento(ps[i]!, a, b).d;
    if (d > peor) {
      peor = d;
      k = i;
    }
  }
  if (peor <= tol) return [a, b];
  return [...enderezar(ps.slice(0, k + 1), tol).slice(0, -1), ...enderezar(ps.slice(k), tol)];
}

/** Una calle recta: todos sus puntos a menos de `tol` m de la recta entre sus extremos. */
function recta(ps: readonly P[], tol = 1.5): boolean {
  const a = ps[0]!;
  const b = ps[ps.length - 1]!;
  return ps.every((p) => aSegmento(p, a, b).d <= tol);
}

/**
 * Chaikin: redondea los vértices que quedan (las curvas de una glorieta, la vuelta de una calle) sin
 * mover los extremos; tres puntos en línea siguen en línea.
 */
export function suavizar(ps: readonly P[], vueltas = 3): P[] {
  let r = [...ps];
  for (let v = 0; v < vueltas && r.length > 2; v++) {
    const n: P[] = [r[0]!];
    for (let i = 0; i + 1 < r.length; i++) {
      const a = r[i]!;
      const b = r[i + 1]!;
      if (i > 0) n.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      if (i + 2 < r.length) n.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    n.push(r[r.length - 1]!);
    r = n;
  }
  return r;
}

/**
 * Los tramos de OSM de una misma calle, unidos en una sola vía con un solo ancho y enderezada (René,
 * 2026-11-28: en AXA la orilla tenía un quiebre a la mitad donde se juntan dos tramos de la MEX-15D).
 */
export function unirVias(vias: readonly ViaCroquis[]): ViaCroquis[] {
  const libres = [...vias];
  const out: ViaCroquis[] = [];
  const pegado = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y) < 1;
  while (libres.length) {
    const primera = libres.shift()!;
    const grupo = [primera];
    let pts = [...primera.puntos];
    for (let cambio = true; cambio;) {
      cambio = false;
      for (let i = 0; i < libres.length; i++) {
        const w = libres[i]!;
        if (!continua({ ...primera, puntos: pts }, w)) continue;
        const ini = pts[0]!;
        const fin = pts[pts.length - 1]!;
        const a = w.puntos[0]!;
        const b = w.puntos[w.puntos.length - 1]!;
        const al = [...w.puntos].reverse();
        if (pegado(fin, a)) pts = [...pts, ...w.puntos.slice(1)];
        else if (pegado(fin, b)) pts = [...pts, ...al.slice(1)];
        else if (pegado(ini, b)) pts = [...w.puntos.slice(0, -1), ...pts];
        else if (pegado(ini, a)) pts = [...al.slice(0, -1), ...pts];
        else continue;
        grupo.push(w);
        libres.splice(i, 1);
        cambio = true;
        break;
      }
    }
    const carriles = grupo.flatMap((g) => (g.carriles !== undefined ? [g.carriles] : []));
    out.push({
      ...primera,
      // Recta donde la calle es recta (sin los quiebres de menos de 0.8 m) y curva suave donde curva.
      puntos: recta(pts) ? [pts[0]!, pts[pts.length - 1]!] : suavizar(enderezar(pts)),
      ancho: Math.max(...grupo.map((g) => g.ancho)),
      ...(carriles.length ? { carriles: Math.max(...carriles) } : {}),
      unSentido: grupo.every((g) => g.unSentido),
    });
  }
  return out;
}

/** A qué distancia del choque una calle que no recorre nadie todavía va en el croquis (m). */
export const CRUCE_CERCANO_M = 10;

/**
 * Solo las calles que importan (René, 2026-11-27: en un caso nuevo se enciman bordes de varias calles):
 * las que recorre algún vehículo o persona y las que pasan a menos de `CRUCE_CERCANO_M` del choque.
 */
export function viasRelevantes(
  vias: readonly ViaCroquis[],
  recorridos: readonly (readonly P[])[],
  choque: P,
): ViaCroquis[] {
  const dentro = new Set(
    vias.filter((v) => {
      if (aPolilinea(choque, v.puntos) - v.ancho / 2 <= CRUCE_CERCANO_M) return true;
      const cerca = v.ancho / 2 + 3;
      return recorridos.some((r) => r.some((p) => aPolilinea(p, v.puntos) <= cerca));
    }),
  );
  // OSM parte una calle en tramos: el tramo que sigue a uno que se queda también se queda, para que
  // ningún borde quede colgando.
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const v of vias)
      if (!dentro.has(v) && [...dentro].some((d) => continua(d, v))) {
        dentro.add(v);
        cambio = true;
      }
  }
  return vias.filter((v) => dentro.has(v));
}

/**
 * Los tramos de una raya de carril que no entran en otra calle: en un empalme o un cruce, las rayas de
 * una no atraviesan a la otra.
 */
export function tramosFueraDeOtras(
  raya: readonly P[],
  otras: readonly ViaCroquis[],
  paso = 1,
  /** Los recorridos: una raya no va debajo de uno (René, 2026-11-28: en AXA se confundían). */
  evitar: readonly (readonly P[])[] = [],
  cercaM = 0.9,
): P[][] {
  const fuera = (p: P) =>
    otras.every((o) => aPolilinea(p, o.puntos) > o.ancho / 2 + 0.3) &&
    evitar.every((r) => aPolilinea(p, r) > cercaM);
  const tramos: P[][] = [];
  let actual: P[] = [];
  for (let i = 0; i + 1 < raya.length; i++) {
    const a = raya[i]!;
    const b = raya[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / paso));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      if (fuera(p)) actual.push(p);
      else {
        if (actual.length >= 2) tramos.push(actual);
        actual = [];
      }
    }
  }
  if (actual.length >= 2) tramos.push(actual);
  // Sin pedacitos sueltos junto a un cruce.
  const largo = (t: P[]) =>
    t.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - t[i]!.x, p.y - t[i]!.y), 0);
  return tramos.filter((t) => largo(t) >= 2);
}

/** El color de cada vehículo en el croquis: su recorrido, su relleno en el impacto y la leyenda. */
const COLORES = ["#2563EB", "#EA580C", "#16A34A", "#9333EA", "#0891B2", "#DB2777"];

/** Una flecha a la mitad del tramo (en la hoja), de `lado` de largo, hacia donde avanza. */
function flechaEn(ps: readonly P[], lado: number): P[] | null {
  let total = 0;
  for (let i = 0; i + 1 < ps.length; i++)
    total += Math.hypot(ps[i + 1]!.x - ps[i]!.x, ps[i + 1]!.y - ps[i]!.y);
  if (total < lado * 3) return null;
  let falta = total / 2;
  for (let i = 0; i + 1 < ps.length; i++) {
    const a = ps[i]!;
    const b = ps[i + 1]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l >= falta && l > 0) {
      const d = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
      const m = { x: a.x + d.x * falta, y: a.y + d.y * falta };
      const n = { x: -d.y, y: d.x };
      return [
        { x: m.x + d.x * lado * 0.6, y: m.y + d.y * lado * 0.6 },
        {
          x: m.x - d.x * lado * 0.4 + n.x * lado * 0.45,
          y: m.y - d.y * lado * 0.4 + n.y * lado * 0.45,
        },
        {
          x: m.x - d.x * lado * 0.4 - n.x * lado * 0.45,
          y: m.y - d.y * lado * 0.4 - n.y * lado * 0.45,
        },
      ];
    }
    falta -= l;
  }
  return null;
}

/** El croquis pericial como SVG (texto), con su giro, para la pantalla y el dictamen. */
export function croquisPericial(
  resultado: ResultadoMaqueta,
  todasLasVias: readonly ViaCroquis[],
  nombres: Readonly<Record<string, string>>,
  o: OpcionesCroquis,
): {
  svg: string;
  giro: number;
  /** El `viewBox` del SVG: la capa del movimiento va con el mismo. */
  viewBox: string;
  /** El grueso de línea del croquis (unidades del SVG). */
  linea: number;
  /**
   * Los vehículos en movimiento en el instante `t`, sin redondear (René, 2026-11-28: el 2D temblaba
   * porque se rehacía todo el croquis en cada cuadro). Barato: se llama en cada cuadro; lo demás del
   * croquis no depende de `t`. Vacío cerca del impacto (encima de la posición 2 estorba).
   */
  ahora: (t: number) => VehiculoAhora[];
} {
  const c = resultado.punto_impacto ?? { x: 0, y: 0 };
  const recorridos = [
    ...resultado.vehiculos.map((v) =>
      v.trayectoria.t.map((_, i) => ({ x: v.trayectoria.x[i]!, y: v.trayectoria.y[i]! })),
    ),
    ...(resultado.personas ?? []).flatMap((q) =>
      q.trayectoria?.t?.length
        ? [q.trayectoria.t.map((_, i) => ({ x: q.trayectoria!.x[i]!, y: q.trayectoria!.y[i]! }))]
        : [],
    ),
  ];
  const vias = unirVias(viasRelevantes(todasLasVias, recorridos, c));
  const giro = giroDelCroquis(resultado, vias);
  const g = (-giro * Math.PI) / 180;
  // De la escena (x al este, y al norte) a la hoja: el choque al centro, la vía principal horizontal.
  const hoja = (p: P): P => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: dx * Math.cos(g) - dy * Math.sin(g), y: -(dx * Math.sin(g) + dy * Math.cos(g)) };
  };
  const ti = tImpacto(resultado);
  const vehiculos = resultado.vehiculos.filter((v) => v.trayectoria.t.length);
  // El color de cada vehículo, por su orden en el caso (A azul, B naranja…), igual en cada dibujo.
  const colorDe = (id: string) =>
    COLORES[
      Math.max(
        0,
        resultado.vehiculos.findIndex((v) => v.id === id),
      ) % COLORES.length
    ]!;
  // El encuadre: la zona del choque (las tres posiciones) o los recorridos completos.
  const pts: P[] = [{ x: 0, y: 0 }];
  for (const v of vehiculos) {
    const tr = v.trayectoria;
    if (o.todo)
      for (let i = 0; i < tr.t.length; i += 4) pts.push(hoja({ x: tr.x[i]!, y: tr.y[i]! }));
    else for (const p of posicionesDelCroquis(tr, ti)) pts.push(hoja(p));
  }
  let [x0, x1, y0, y1] = [
    Math.min(...pts.map((p) => p.x)),
    Math.max(...pts.map((p) => p.x)),
    Math.min(...pts.map((p) => p.y)),
    Math.max(...pts.map((p) => p.y)),
  ];
  const margen = Math.max(8, (x1 - x0 + (y1 - y0)) * 0.18);
  [x0, x1, y0, y1] = [x0 - margen, x1 + margen, y0 - margen, y1 + margen];
  const ancho = x1 - x0;
  const alto = y1 - y0;
  if (ancho / alto < o.proporcion) {
    const extra = alto * o.proporcion - ancho;
    x0 -= extra / 2;
    x1 += extra / 2;
  } else {
    const extra = ancho / o.proporcion - alto;
    y0 -= extra / 2;
    y1 += extra / 2;
  }
  const W = x1 - x0;
  const fs = W / 55;
  const linea = (W / 900) * 1.4;
  const partes: string[] = [];
  partes.push(
    `<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(W)}" height="${r1(y1 - y0)}" fill="#fff"/>`,
  );

  // El fondo, tenue y girado igual que la escena (el lugar al norte arriba, girado con el croquis).
  if (o.fondo) {
    const f = o.fondo;
    const a = { x: f.centroX - f.ladoM / 2 - c.x, y: -(f.centroY + f.ladoM / 2 - c.y) };
    partes.push(
      `<g transform="rotate(${r1(giro)})"><image href="${f.imagen}" x="${r1(a.x)}" y="${r1(a.y)}" width="${r1(f.ladoM)}" height="${r1(f.ladoM)}" opacity="${f.opacidad}" preserveAspectRatio="none" data-fondo="si"/></g>`,
    );
  }

  // La vía: primero todos los bordes en negro, luego la calzada en blanco y al final los carriles.
  const poli = (ps: readonly P[]) => ps.map((p) => `${r1(hoja(p).x)},${r1(hoja(p).y)}`).join(" ");
  const fondoVia = o.fondo ? 'fill-opacity="0"' : "";
  vias.forEach((v, i) =>
    partes.push(
      `<polyline points="${poli(v.puntos)}" fill="none" stroke="#000" stroke-width="${r1(v.ancho + linea * 2)}" stroke-linejoin="round" stroke-linecap="round" data-borde="${i}" data-ancho="${r1(v.ancho)}"/>`,
    ),
  );
  for (const v of vias)
    partes.push(
      `<polyline points="${poli(v.puntos)}" fill="none" stroke="#fff" stroke-opacity="${o.fondo ? 0.55 : 1}" stroke-width="${r1(v.ancho)}" stroke-linejoin="round" stroke-linecap="round" ${fondoVia}/>`,
    );
  for (const v of vias) {
    const n = Math.max(1, Math.round(v.carriles ?? (v.ancho >= 6 ? 2 : 1)));
    const otras = vias.filter((o) => o !== v && !continua(v, o));
    for (let k = 1; k < n; k++) {
      const d = -v.ancho / 2 + (k * v.ancho) / n;
      const doble = !v.unSentido && k === n / 2;
      // Las rayas de una calle no atraviesan a otra en un empalme o un cruce (René, 2026-11-27), son
      // finas y grises y no van debajo de un recorrido (René, 2026-11-28: en AXA se confundían).
      for (const tramo of tramosFueraDeOtras(desplazar(v.puntos, d), otras, 1, recorridos))
        partes.push(
          `<polyline points="${poli(tramo)}" fill="none" stroke="#9ca3af" stroke-width="${r1(linea * (doble ? 0.9 : 0.7))}" ${doble ? "" : `stroke-dasharray="${r1(fs * 0.9)} ${r1(fs * 0.9)}"`} data-carril="si"/>`,
        );
    }
  }

  // Los recorridos: en negro o coloreados por velocidad.
  for (const v of vehiculos) {
    const tr = v.trayectoria;
    if (o.color) {
      const vel = tr.t.map((_, i) => Math.hypot(tr.vx[i] ?? 0, tr.vy[i] ?? 0));
      const hi = Math.max(...vel, 1);
      for (let i = 0; i + 3 < tr.t.length; i += 3) {
        const f = vel[i]! / hi;
        const col = `rgb(${Math.round(37 + f * (255 - 37))},${Math.round(99 + f * (91 - 99))},${Math.round(235 + f * (46 - 235))})`;
        const a = hoja({ x: tr.x[i]!, y: tr.y[i]! });
        const b = hoja({ x: tr.x[i + 3]!, y: tr.y[i + 3]! });
        partes.push(
          `<line x1="${r1(a.x)}" y1="${r1(a.y)}" x2="${r1(b.x)}" y2="${r1(b.y)}" stroke="${col}" stroke-width="${r1(linea * 2.2)}" stroke-linecap="round"/>`,
        );
      }
    } else {
      // Una línea continua del color del vehículo, con flechas de hacia dónde va (René, 2026-11-28):
      // distinta de las rayas de carril, que son grises y punteadas.
      const ps = tr.t.map((_, i) => ({ x: tr.x[i]!, y: tr.y[i]! }));
      const col = colorDe(v.id);
      partes.push(
        `<polyline points="${poli(ps)}" fill="none" stroke="${col}" stroke-width="${r1(linea * 1.6)}" stroke-linejoin="round" stroke-linecap="round" data-recorrido="${esc(v.id)}"/>`,
      );
      // Una flecha antes del impacto y otra después, a la mitad de cada tramo.
      const antes = ps.filter((_, i) => tr.t[i]! <= ti);
      const despues = ps.filter((_, i) => tr.t[i]! >= ti);
      for (const tramo of [antes, despues]) {
        const f = flechaEn(tramo.map(hoja), fs * 0.55);
        if (f)
          partes.push(
            `<polygon points="${f.map((q) => `${r1(q.x)},${r1(q.y)}`).join(" ")}" fill="${col}" data-flecha-recorrido="${esc(v.id)}"/>`,
          );
      }
    }
  }

  // Los objetos del caso (René, 2026-11-27: en la curva no se veía el árbol): el árbol con su tronco
  // y su copa punteada, un poste como un punto y lo demás (un muro, una barda) con su planta. Los del
  // mapa (`osm-…`) no: son entorno.
  const objetosDelCaso = (resultado.objetos ?? []).filter((q) => !q.id.startsWith("osm-"));
  const etiquetasObjetos: { id: string; x: number; y: number; texto: string }[] = [];
  for (const q of objetosDelCaso) {
    const h = hoja(q);
    if (q.tipo === "arbol") {
      const copa = q.copa?.radio_m ?? 2;
      partes.push(
        `<circle cx="${r1(h.x)}" cy="${r1(h.y)}" r="${r1(copa)}" fill="none" stroke="#000" stroke-width="${r1(linea)}" stroke-dasharray="${r1(fs * 0.25)} ${r1(fs * 0.2)}" data-objeto="${esc(q.id)}"/>`,
        `<circle cx="${r1(h.x)}" cy="${r1(h.y)}" r="${r1(Math.max(0.25, q.radio_m ?? 0.2))}" fill="#000"/>`,
      );
    } else if ((q.largo_m ?? 0) > 1.2 || (q.ancho_m ?? 0) > 1.2) {
      const L = (q.largo_m ?? 1) / 2;
      const A = (q.ancho_m ?? 0.3) / 2;
      const r = ((q.rumbo_deg ?? 0) * Math.PI) / 180;
      const esq = [
        [L, A],
        [L, -A],
        [-L, -A],
        [-L, A],
      ].map(([u, w]) =>
        hoja({
          x: q.x + u! * Math.cos(r) - w! * Math.sin(r),
          y: q.y + u! * Math.sin(r) + w! * Math.cos(r),
        }),
      );
      partes.push(
        `<polygon points="${esq.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" ")}" fill="#555" stroke="#000" stroke-width="${r1(linea)}" data-objeto="${esc(q.id)}"/>`,
      );
    } else {
      partes.push(
        `<circle cx="${r1(h.x)}" cy="${r1(h.y)}" r="${r1(Math.max(0.3, q.radio_m ?? 0.2))}" fill="#000" data-objeto="${esc(q.id)}"/>`,
      );
    }
    const nombre: Record<string, string> = { arbol: "Árbol", poste: "Poste", muro: "Muro" };
    etiquetasObjetos.push({
      id: `objeto-${q.id}`,
      ...h,
      texto: nombre[q.tipo] ?? q.tipo.charAt(0).toUpperCase() + q.tipo.slice(1),
    });
  }

  // Los vehículos en sus tres posiciones, y sus etiquetas.
  const silueta = (
    v: (typeof vehiculos)[number],
    pose: { x: number; y: number; rumbo: number },
  ) => {
    const L = v.dimensiones.largo_m / 2;
    const A = v.dimensiones.ancho_m / 2;
    const cos = Math.cos(pose.rumbo);
    const sin = Math.sin(pose.rumbo);
    const esq = [
      [L, A],
      [L, -A],
      [-L, -A],
      [-L, A],
    ].map(([u, w]) => hoja({ x: pose.x + u! * cos - w! * sin, y: pose.y + u! * sin + w! * cos }));
    const frente = [
      [L, 0],
      [L * 0.55, A * 0.7],
      [L * 0.55, -A * 0.7],
    ].map(([u, w]) => hoja({ x: pose.x + u! * cos - w! * sin, y: pose.y + u! * sin + w! * cos }));
    return { esq, frente };
  };
  const ocupados: { x: number; y: number; r: number }[] = [];
  const porEtiquetar: { id: string; x: number; y: number; texto: string; dueno?: string }[] = [
    ...etiquetasObjetos,
  ];
  // Primero cada posición de cada vehículo; luego se dibujan, para saber qué flecha cae sobre otro.
  const dibujos: {
    v: (typeof vehiculos)[number];
    k: number;
    esq: P[];
    frente: P[];
  }[] = [];
  vehiculos.forEach((v) => {
    const letra = (nombres[v.id] ?? v.id).trim().charAt(0).toUpperCase();
    const poses = posicionesDelCroquis(v.trayectoria, ti);
    // Una posición igual a la anterior (el detenido en el semáforo: antes del impacto y en el impacto
    // está en el mismo lugar) se dibuja una vez, con una sola etiqueta: «B1·2» (René, 2026-11-25).
    const igual = (a: (typeof poses)[number], b: (typeof poses)[number]) =>
      Math.hypot(a.x - b.x, a.y - b.y) < 0.3 &&
      Math.abs(Math.atan2(Math.sin(a.rumbo - b.rumbo), Math.cos(a.rumbo - b.rumbo))) < 0.09;
    poses.forEach((pose, k) => {
      if (k < poses.length - 1 && igual(pose, poses[k + 1]!)) return;
      let desde = k;
      while (desde > 0 && igual(poses[desde - 1]!, pose)) desde--;
      const { esq, frente } = silueta(v, pose);
      dibujos.push({ v, k, esq, frente });
      const centro = hoja(pose);
      ocupados.push({ ...centro, r: Math.max(v.dimensiones.largo_m, v.dimensiones.ancho_m) / 2 });
      porEtiquetar.push({
        id: `${v.id}-${k + 1}`,
        ...centro,
        texto: desde < k ? `${letra}${desde + 1}·${k + 1}` : `${letra}${k + 1}`,
        dueno: v.id,
      });
    });
  });
  // En el impacto, cada vehículo con su contorno y su color semitransparente: si se enciman, se ven los
  // dos (René, 2026-11-28: en AXA eran un solo bloque). Antes del impacto, punteado; en reposo, gris.
  for (const d of dibujos) {
    const pts = d.esq.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" ");
    const estilo =
      d.k === 0
        ? `fill="none" stroke="#000" stroke-dasharray="${r1(fs * 0.3)} ${r1(fs * 0.25)}"`
        : d.k === 1
          ? `fill="${colorDe(d.v.id)}" fill-opacity="0.22" stroke="#000"`
          : 'fill="#d4d4d4" fill-opacity="0.85" stroke="#000"';
    partes.push(
      `<polygon points="${pts}" ${estilo} stroke-width="${r1(linea * 1.3)}" data-vehiculo="${esc(d.v.id)}" data-posicion="${d.k + 1}"/>`,
    );
  }
  // La flecha del frente, una por posición, salvo si cae dentro de otro vehículo o junto a otra flecha
  // («▶▶» apiladas en el impacto de AXA).
  const puntas: P[] = [];
  const conFlecha = new Set<string>();
  for (const d of dibujos) {
    const punta = d.frente[0]!;
    // Dentro de otra posición (de otro vehículo o del mismo: A2 y A3 encimadas) o junto a otra flecha.
    const tapada =
      dibujos.some((o) => o !== d && dentroDe(punta, o.esq)) ||
      puntas.some((q) => Math.hypot(q.x - punta.x, q.y - punta.y) < fs * 1.8);
    if (tapada) continue;
    puntas.push(punta);
    conFlecha.add(d.v.id);
    partes.push(
      `<polygon points="${d.frente.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" ")}" fill="#000" data-flecha="${esc(d.v.id)}"/>`,
    );
  }
  // Pero cada vehículo con su flecha: si todas sus posiciones quedaron tapadas, la del impacto.
  for (const v of vehiculos) {
    if (conFlecha.has(v.id)) continue;
    const d =
      dibujos.find((x) => x.v.id === v.id && x.k === 1) ?? dibujos.find((x) => x.v.id === v.id);
    if (!d) continue;
    partes.push(
      `<polygon points="${d.frente.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" ")}" fill="${colorDe(v.id)}" stroke="#000" stroke-width="${r1(linea * 0.5)}" data-flecha="${esc(v.id)}"/>`,
    );
  }
  // Las personas a pie o en bicicleta (A3): su recorrido y P1, P2, P3 (Q… si hay más de una).
  const personas = (resultado.personas ?? []).filter(
    (q) => !q.vehiculo_id && q.trayectoria?.t?.length,
  );
  personas.forEach((q, k) => {
    const tr = q.trayectoria!;
    const letra = "PQRSTU".charAt(k) || "P";
    partes.push(
      `<polyline points="${poli(tr.t.map((_, i) => ({ x: tr.x[i]!, y: tr.y[i]! })))}" fill="none" stroke="#000" stroke-width="${r1(linea)}" stroke-dasharray="${r1(fs * 0.2)} ${r1(fs * 0.3)}"/>`,
    );
    const n = tr.t.length;
    const poses = [
      { x: tr.x[0]!, y: tr.y[0]! },
      poseEn(tr as TrayectoriaResultado, ti),
      { x: tr.x[n - 1]!, y: tr.y[n - 1]! },
    ];
    // Igual que con los vehículos: la persona que no se movió antes del impacto lleva «P1·2».
    const misma = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y) < 0.3;
    poses.forEach((pose, j) => {
      if (j < poses.length - 1 && misma(pose, poses[j + 1]!)) return;
      let desde = j;
      while (desde > 0 && misma(poses[desde - 1]!, pose)) desde--;
      const h = hoja(pose);
      const rp = fs * 0.35;
      partes.push(
        `<circle cx="${r1(h.x)}" cy="${r1(h.y)}" r="${r1(rp)}" fill="${j === 2 ? "#d4d4d4" : "#fff"}" stroke="#000" stroke-width="${r1(linea * 1.2)}" ${j === 0 ? `stroke-dasharray="${r1(fs * 0.15)} ${r1(fs * 0.12)}"` : ""} data-persona="${esc(q.id)}" data-posicion="${j + 1}"/>`,
      );
      ocupados.push({ ...h, r: rp });
      porEtiquetar.push({
        id: `${q.id}-${j + 1}`,
        ...h,
        texto: desde < j ? `${letra}${desde + 1}·${j + 1}` : `${letra}${j + 1}`,
      });
    });
  });
  // El impacto.
  const ri = fs * 0.7;
  partes.push(
    `<path d="M${-ri},${-ri} L${ri},${ri} M${-ri},${ri} L${ri},${-ri}" stroke="#000" stroke-width="${r1(linea * 2)}" data-impacto="si"/>`,
  );
  ocupados.push({ x: 0, y: 0, r: ri });
  const rEt = fs * 0.85;
  // «Impacto» primero (es la más ancha) y con su tamaño.
  // El ancho (medio) de cada etiqueta: «Impacto», una doble («B1·2») o una sencilla («A1»).
  const medio = (e: { id: string; texto?: string }) =>
    e.id === "impacto"
      ? rEt * 4.2
      : (e.texto?.length ?? 0) > 4
        ? rEt * 0.55 * e.texto!.length // un objeto: «Árbol», «Poste»
        : (e.texto?.length ?? 0) > 3
          ? rEt * 1.7
          : rEt;
  // El norte, la escala y la leyenda también ocupan su lugar: ninguna etiqueta va encima.
  const n0 = { x: x0 + fs * 2.8, y: y0 + fs * 2.8 };
  const esM = escalaRedonda(W);
  const e0 = { x: x0 + fs * 2.5, y: y1 - fs * 1.8 };
  const leyenda = [
    "1 inicio · 2 impacto · 3 reposo",
    ...vehiculos.map((v) => nombres[v.id] ?? v.id),
    ...(personas.length ? ["P · persona a pie o en bicicleta"] : []),
  ];
  const leyAncho = Math.max(...leyenda.map((t) => t.length)) * fs * 0.42 + fs * 2.2;
  const leyAlto = leyenda.length * fs * 1.05 + fs * 0.9;
  const l0 = { x: x1 - leyAncho - fs * 1.2, y: y1 - leyAlto - fs * 1.2 };
  ocupados.push(
    { ...n0, r: fs * 2.3 },
    { x: e0.x + esM / 2, y: e0.y - fs * 0.4, r: esM / 2 + fs },
    { x: l0.x + leyAncho / 2, y: l0.y + leyAlto / 2, r: Math.max(leyAncho, leyAlto) / 2 },
  );
  const lugares = colocarEtiquetas(
    [
      { id: "impacto", x: 0, y: 0, r: rEt * 4.2 },
      ...porEtiquetar.map((e) => (medio(e) > rEt ? { ...e, r: medio(e) } : e)),
    ],
    rEt,
    ocupados,
    dibujos.map((d) => ({ dueno: d.v.id, puntos: d.esq })),
  );
  for (const e of [...porEtiquetar, { id: "impacto", x: 0, y: 0, texto: "Impacto" }]) {
    const q = lugares[e.id]!;
    const ancho = medio(e);
    partes.push(
      `<line x1="${r1(e.x)}" y1="${r1(e.y)}" x2="${r1(q.x)}" y2="${r1(q.y)}" stroke="#000" stroke-width="${r1(linea * 0.7)}" data-guia="${esc(e.id)}" data-dueno="${esc(("dueno" in e && e.dueno) || "")}"/>`,
      ancho > rEt
        ? `<rect x="${r1(q.x - ancho)}" y="${r1(q.y - rEt)}" width="${r1(ancho * 2)}" height="${r1(rEt * 2)}" rx="${r1(rEt)}" fill="#fff" stroke="#000" stroke-width="${r1(linea)}"/>`
        : `<circle cx="${r1(q.x)}" cy="${r1(q.y)}" r="${r1(rEt)}" fill="#fff" stroke="#000" stroke-width="${r1(linea)}"/>`,
      `<text x="${r1(q.x)}" y="${r1(q.y)}" font-size="${r1(fs * (e.id === "impacto" ? 0.85 : 0.95))}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#000" data-etiqueta="${esc(e.texto)}">${esc(e.texto)}</text>`,
    );
  }

  // El norte (gira con el croquis), arriba a la izquierda: a la derecha van los botones de zoom (René,
  // 2026-11-28: quedaba detrás). La escala, abajo a la izquierda con margen. La leyenda, abajo a la
  // derecha: qué es 1, 2 y 3 y qué letra es cada vehículo.
  partes.push(
    `<g transform="translate(${r1(n0.x)} ${r1(n0.y)}) rotate(${r1(giro)})" data-norte="si"><circle r="${r1(fs * 2)}" fill="#fff" fill-opacity="0.9"/><path d="M0,${r1(-fs * 1.4)} L${r1(fs * 0.55)},${r1(fs * 0.6)} L0,${r1(fs * 0.2)} L${r1(-fs * 0.55)},${r1(fs * 0.6)} Z" fill="#000"/><text y="${r1(-fs * 1.8)}" font-size="${r1(fs * 0.8)}" font-weight="700" text-anchor="middle" fill="#000" transform="rotate(${r1(-giro)} 0 ${r1(-fs * 1.8)})">N</text></g>`,
  );
  partes.push(
    `<g data-escala="${esM}"><rect x="${r1(e0.x - fs * 0.5)}" y="${r1(e0.y - fs * 1.5)}" width="${r1(esM + fs)}" height="${r1(fs * 2.2)}" fill="#fff" fill-opacity="0.9"/><rect x="${r1(e0.x)}" y="${r1(e0.y)}" width="${r1(esM / 2)}" height="${r1(fs * 0.3)}" fill="#000"/><rect x="${r1(e0.x + esM / 2)}" y="${r1(e0.y)}" width="${r1(esM / 2)}" height="${r1(fs * 0.3)}" fill="#fff" stroke="#000" stroke-width="${r1(linea * 0.6)}"/><text x="${r1(e0.x)}" y="${r1(e0.y - fs * 0.5)}" font-size="${r1(fs * 0.7)}" fill="#000">0</text><text x="${r1(e0.x + esM)}" y="${r1(e0.y - fs * 0.5)}" font-size="${r1(fs * 0.7)}" text-anchor="end" fill="#000">${esM} m</text></g>`,
  );
  const filas = leyenda
    .map((t, k) => {
      const y = l0.y + fs * 0.9 + k * fs * 1.05;
      const v = k > 0 ? vehiculos[k - 1] : undefined;
      const muestra = v
        ? `<rect x="${r1(l0.x + fs * 0.6)}" y="${r1(y - fs * 0.32)}" width="${r1(fs * 0.9)}" height="${r1(fs * 0.5)}" fill="${colorDe(v.id)}"/>`
        : "";
      return `${muestra}<text x="${r1(l0.x + (v ? fs * 1.8 : fs * 0.6))}" y="${r1(y)}" font-size="${r1(fs * 0.68)}" dominant-baseline="central" fill="#000">${esc(t)}</text>`;
    })
    .join("");
  partes.push(
    `<g data-leyenda="si"><rect x="${r1(l0.x)}" y="${r1(l0.y)}" width="${r1(leyAncho)}" height="${r1(leyAlto)}" fill="#fff" stroke="#000" stroke-width="${r1(linea * 0.5)}"/>${filas}</g>`,
  );

  const viewBox = `${r1(x0)} ${r1(y0)} ${r1(W)} ${r1(y1 - y0)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Croquis de la reconstrucción: la vía, cada vehículo antes del impacto, en el impacto y en reposo, el punto de impacto, el norte y la escala.">${partes.join("")}</svg>`;
  // El vehículo en movimiento: solo lejos del impacto (en el impacto, encima de la posición 2, estorba).
  const ahora = (t: number): VehiculoAhora[] =>
    Math.abs(t - ti) > 0.15
      ? vehiculos.map((v) => ({ id: v.id, puntos: silueta(v, poseEn(v.trayectoria, t)).esq }))
      : [];
  return { svg, giro, viewBox, linea, ahora };
}

/**
 * Las vías de una escena para el croquis: las del mapa, con sus carriles y su tipo. Sin calles del mapa,
 * la vía que describe la escena (René, 2026-11-27: una glorieta sin mapa salía sin calles): sus franjas,
 * su anillo y sus arcos.
 */
export function viasDeEscena(spec: EscenaSpec): ViaCroquis[] {
  const lay = sceneLayout(spec);
  const mapa = (lay.mapa?.vias ?? []).map((v) => ({
    puntos: v.puntos,
    ancho: v.ancho,
    carriles: v.carriles,
    unSentido: v.unSentido,
    tipo: v.tipo,
  }));
  if (mapa.length) return mapa;
  const out: ViaCroquis[] = [];
  for (const st of lay.road.strips) {
    const h = (st.heading * Math.PI) / 180;
    const d = { x: (Math.cos(h) * st.length) / 2, y: (Math.sin(h) * st.length) / 2 };
    out.push({
      puntos: [
        { x: st.center.x - d.x, y: st.center.y - d.y },
        { x: st.center.x + d.x, y: st.center.y + d.y },
      ],
      ancho: st.width,
      carriles: st.lanes,
    });
  }
  const arco = (c: P, r: number, desde: number, hasta: number) => {
    const n = Math.max(8, Math.ceil(Math.abs(hasta - desde) / 6));
    return Array.from({ length: n + 1 }, (_, k) => {
      const a = ((desde + ((hasta - desde) * k) / n) * Math.PI) / 180;
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    });
  };
  for (const g of lay.road.rings)
    out.push({
      puntos: arco(g.center, (g.innerRadius + g.outerRadius) / 2, 0, 360),
      ancho: g.outerRadius - g.innerRadius,
      carriles: 1,
      unSentido: true,
    });
  for (const a of lay.road.arcs)
    out.push({ puntos: arco(a.center, a.radius, a.from, a.to), ancho: a.width, carriles: 2 });
  return out;
}

/** El SVG del croquis como PNG (data URL), para el dictamen: el mismo dibujo que en pantalla. */
export async function svgAPng(svg: string, ancho: number, alto: number): Promise<string | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const g = lienzo.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, ancho, alto);
    g.drawImage(img, 0, 0, ancho, alto);
    return lienzo.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
