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
  /** El instante de la línea de tiempo: el vehículo en movimiento, encima, con trazo fino. */
  t?: number | null;
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

/**
 * El giro del croquis (grados): el que deja horizontal la vía principal cerca del choque (o, sin
 * vías, el recorrido del vehículo más rápido), entre −90° y 90° para que nada quede de cabeza.
 */
export function giroDelCroquis(resultado: ResultadoMaqueta, vias: readonly ViaCroquis[]): number {
  const c = resultado.punto_impacto ?? { x: 0, y: 0 };
  // Primero la vía donde fue el choque (el impacto cae sobre ella); entre varias (un cruce), la de
  // más jerarquía. Si ninguna lo contiene, la más cercana a menos de 30 m.
  let mejor: { dentro: boolean; rango: number; d: number; ang: number } | null = null;
  for (const v of vias) {
    const rango = RANGO[v.tipo ?? ""] ?? 2;
    for (let i = 0; i + 1 < v.puntos.length; i++) {
      const s = aSegmento(c, v.puntos[i]!, v.puntos[i + 1]!);
      if (s.d > Math.max(30, v.ancho * 2)) continue;
      const dentro = s.d <= v.ancho / 2 + 1.5;
      const gana =
        !mejor ||
        (dentro && !mejor.dentro) ||
        (dentro === mejor.dentro &&
          (dentro
            ? rango > mejor.rango || (rango === mejor.rango && s.d < mejor.d)
            : s.d < mejor.d));
      if (gana) mejor = { dentro, rango, d: s.d, ang: s.ang };
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

/** Dónde poner cada etiqueta sin encimarse: la primera posición libre alrededor de su objeto. */
export function colocarEtiquetas(
  objetos: readonly { id: string; x: number; y: number; r?: number }[],
  r: number,
  ocupados: readonly { x: number; y: number; r: number }[] = [],
): Record<string, { x: number; y: number }> {
  const puestos: { x: number; y: number; r: number }[] = [...ocupados];
  const out: Record<string, { x: number; y: number }> = {};
  for (const o of objetos) {
    // Cada etiqueta con su tamaño: «Impacto» es más ancha que «A1».
    const ro = o.r ?? r;
    let elegido: { x: number; y: number } | null = null;
    for (const dist of [ro + r * 1.6, ro + r * 2.6, ro + r * 3.8, ro + r * 5.2]) {
      for (let k = 0; k < 12 && !elegido; k++) {
        const ang = -Math.PI / 4 + (k * Math.PI) / 6;
        const c = { x: o.x + Math.cos(ang) * dist, y: o.y - Math.sin(ang) * dist };
        if (puestos.every((q) => Math.hypot(q.x - c.x, q.y - c.y) >= q.r + ro * 1.1)) elegido = c;
      }
      if (elegido) break;
    }
    elegido ??= { x: o.x + ro + r * 5.2, y: o.y - ro - r * 5.2 };
    out[o.id] = elegido;
    puestos.push({ ...elegido, r: ro });
  }
  return out;
}

/** El croquis pericial como SVG (texto), con su giro, para la pantalla y el dictamen. */
export function croquisPericial(
  resultado: ResultadoMaqueta,
  vias: readonly ViaCroquis[],
  nombres: Readonly<Record<string, string>>,
  o: OpcionesCroquis,
): { svg: string; giro: number } {
  const giro = giroDelCroquis(resultado, vias);
  const c = resultado.punto_impacto ?? { x: 0, y: 0 };
  const g = (-giro * Math.PI) / 180;
  // De la escena (x al este, y al norte) a la hoja: el choque al centro, la vía principal horizontal.
  const hoja = (p: P): P => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: dx * Math.cos(g) - dy * Math.sin(g), y: -(dx * Math.sin(g) + dy * Math.cos(g)) };
  };
  const ti = tImpacto(resultado);
  const vehiculos = resultado.vehiculos.filter((v) => v.trayectoria.t.length);
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
  for (const v of vias)
    partes.push(
      `<polyline points="${poli(v.puntos)}" fill="none" stroke="#000" stroke-width="${r1(v.ancho + linea * 2)}" stroke-linejoin="round" stroke-linecap="butt"/>`,
    );
  for (const v of vias)
    partes.push(
      `<polyline points="${poli(v.puntos)}" fill="none" stroke="#fff" stroke-opacity="${o.fondo ? 0.55 : 1}" stroke-width="${r1(v.ancho)}" stroke-linejoin="round" stroke-linecap="butt" ${fondoVia}/>`,
    );
  for (const v of vias) {
    const n = Math.max(1, Math.round(v.carriles ?? (v.ancho >= 6 ? 2 : 1)));
    for (let k = 1; k < n; k++) {
      const d = -v.ancho / 2 + (k * v.ancho) / n;
      const doble = !v.unSentido && k === n / 2;
      partes.push(
        `<polyline points="${poli(desplazar(v.puntos, d))}" fill="none" stroke="#000" stroke-width="${r1(linea * (doble ? 1.2 : 0.8))}" ${doble ? "" : `stroke-dasharray="${r1(fs * 0.9)} ${r1(fs * 0.9)}"`}/>`,
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
      const ps = tr.t.map((_, i) => ({ x: tr.x[i]!, y: tr.y[i]! }));
      partes.push(
        `<polyline points="${poli(ps)}" fill="none" stroke="#000" stroke-width="${r1(linea)}" stroke-dasharray="${r1(fs * 0.35)} ${r1(fs * 0.35)}"/>`,
      );
    }
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
  const porEtiquetar: { id: string; x: number; y: number; texto: string }[] = [];
  vehiculos.forEach((v) => {
    const letra = (nombres[v.id] ?? v.id).trim().charAt(0).toUpperCase();
    posicionesDelCroquis(v.trayectoria, ti).forEach((pose, k) => {
      const { esq, frente } = silueta(v, pose);
      const pts = esq.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" ");
      const estilo =
        k === 0
          ? `fill="none" stroke="#000" stroke-dasharray="${r1(fs * 0.3)} ${r1(fs * 0.25)}"`
          : k === 1
            ? 'fill="#fff" stroke="#000"'
            : 'fill="#d4d4d4" stroke="#000"';
      partes.push(
        `<polygon points="${pts}" ${estilo} stroke-width="${r1(linea * 1.3)}" data-vehiculo="${esc(v.id)}" data-posicion="${k + 1}"/>`,
        `<polygon points="${frente.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" ")}" fill="#000"/>`,
      );
      const centro = hoja(pose);
      ocupados.push({ ...centro, r: Math.max(v.dimensiones.largo_m, v.dimensiones.ancho_m) / 2 });
      porEtiquetar.push({ id: `${v.id}-${k + 1}`, ...centro, texto: `${letra}${k + 1}` });
    });
  });
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
    poses.forEach((pose, j) => {
      const h = hoja(pose);
      const rp = fs * 0.35;
      partes.push(
        `<circle cx="${r1(h.x)}" cy="${r1(h.y)}" r="${r1(rp)}" fill="${j === 2 ? "#d4d4d4" : "#fff"}" stroke="#000" stroke-width="${r1(linea * 1.2)}" ${j === 0 ? `stroke-dasharray="${r1(fs * 0.15)} ${r1(fs * 0.12)}"` : ""} data-persona="${esc(q.id)}" data-posicion="${j + 1}"/>`,
      );
      ocupados.push({ ...h, r: rp });
      porEtiquetar.push({ id: `${q.id}-${j + 1}`, ...h, texto: `${letra}${j + 1}` });
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
  const lugares = colocarEtiquetas(
    [{ id: "impacto", x: 0, y: 0, r: rEt * 4.2 }, ...porEtiquetar],
    rEt,
    ocupados,
  );
  for (const e of [...porEtiquetar, { id: "impacto", x: 0, y: 0, texto: "Impacto" }]) {
    const q = lugares[e.id]!;
    const ancho = e.id === "impacto" ? rEt * 4.2 : rEt;
    partes.push(
      `<line x1="${r1(e.x)}" y1="${r1(e.y)}" x2="${r1(q.x)}" y2="${r1(q.y)}" stroke="#000" stroke-width="${r1(linea * 0.7)}"/>`,
      e.id === "impacto"
        ? `<rect x="${r1(q.x - ancho)}" y="${r1(q.y - rEt)}" width="${r1(ancho * 2)}" height="${r1(rEt * 2)}" rx="${r1(rEt)}" fill="#fff" stroke="#000" stroke-width="${r1(linea)}"/>`
        : `<circle cx="${r1(q.x)}" cy="${r1(q.y)}" r="${r1(rEt)}" fill="#fff" stroke="#000" stroke-width="${r1(linea)}"/>`,
      `<text x="${r1(q.x)}" y="${r1(q.y)}" font-size="${r1(fs * (e.id === "impacto" ? 0.85 : 0.95))}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#000" data-etiqueta="${esc(e.texto)}">${esc(e.texto)}</text>`,
    );
  }

  // El vehículo en movimiento, en el instante de la línea de tiempo.
  // Solo lejos del impacto: en el impacto, encima de la posición 2, no aporta y estorba.
  if (o.t !== null && o.t !== undefined && Math.abs(o.t - ti) > 0.15)
    for (const v of vehiculos) {
      const { esq } = silueta(v, poseEn(v.trayectoria, o.t));
      partes.push(
        `<polygon points="${esq.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" ")}" fill="#2563EB" fill-opacity="0.18" stroke="#2563EB" stroke-width="${r1(linea)}" data-ahora="${esc(v.id)}"/>`,
      );
    }

  // El norte (gira con el croquis) y la escala gráfica.
  const n0 = { x: x1 - fs * 2.8, y: y0 + fs * 2.8 };
  partes.push(
    `<g transform="translate(${r1(n0.x)} ${r1(n0.y)}) rotate(${r1(giro)})"><circle r="${r1(fs * 2)}" fill="#fff" fill-opacity="0.9"/><path d="M0,${r1(-fs * 1.4)} L${r1(fs * 0.55)},${r1(fs * 0.6)} L0,${r1(fs * 0.2)} L${r1(-fs * 0.55)},${r1(fs * 0.6)} Z" fill="#000"/><text y="${r1(-fs * 1.8)}" font-size="${r1(fs * 0.8)}" font-weight="700" text-anchor="middle" fill="#000" transform="rotate(${r1(-giro)} 0 ${r1(-fs * 1.8)})">N</text></g>`,
  );
  const esM = escalaRedonda(W);
  const e0 = { x: x0 + fs * 1.5, y: y1 - fs * 1.6 };
  partes.push(
    `<g data-escala="${esM}"><rect x="${r1(e0.x - fs * 0.5)}" y="${r1(e0.y - fs * 1.5)}" width="${r1(esM + fs)}" height="${r1(fs * 2.2)}" fill="#fff" fill-opacity="0.9"/><rect x="${r1(e0.x)}" y="${r1(e0.y)}" width="${r1(esM / 2)}" height="${r1(fs * 0.3)}" fill="#000"/><rect x="${r1(e0.x + esM / 2)}" y="${r1(e0.y)}" width="${r1(esM / 2)}" height="${r1(fs * 0.3)}" fill="#fff" stroke="#000" stroke-width="${r1(linea * 0.6)}"/><text x="${r1(e0.x)}" y="${r1(e0.y - fs * 0.5)}" font-size="${r1(fs * 0.7)}" fill="#000">0</text><text x="${r1(e0.x + esM)}" y="${r1(e0.y - fs * 0.5)}" font-size="${r1(fs * 0.7)}" text-anchor="end" fill="#000">${esM} m</text></g>`,
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(x0)} ${r1(y0)} ${r1(W)} ${r1(y1 - y0)}" preserveAspectRatio="xMidYMid meet" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Croquis de la reconstrucción: la vía, cada vehículo antes del impacto, en el impacto y en reposo, el punto de impacto, el norte y la escala.">${partes.join("")}</svg>`;
  return { svg, giro };
}

/** Las vías de una escena (las del mapa, con sus carriles y su tipo), para el croquis. */
export function viasDeEscena(spec: EscenaSpec): ViaCroquis[] {
  return (sceneLayout(spec).mapa?.vias ?? []).map((v) => ({
    puntos: v.puntos,
    ancho: v.ancho,
    carriles: v.carriles,
    unSentido: v.unSentido,
    tipo: v.tipo,
  }));
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
