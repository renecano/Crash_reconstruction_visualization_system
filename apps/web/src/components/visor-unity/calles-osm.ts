/**
 * Lo que OSM dice de las calles y que llega al 3D (René, 2026-11-27, punto 9; la auditoría
 * `eval/results/auditoria_calles.md` los marcaba como «mal»): los pasos peatonales y los semáforos
 * de `red_vial.nodos` y las flechas de `turn:lanes`. Solo se dibujan: no mueven nada del caso.
 */
import { crosswalkLength, type Crosswalk, type MapLayout } from "@croquis/croquis-2d";
import type { Escenario } from "@croquis/scene-schema";
import type { Mesh2D } from "@croquis/viewer/puro";

type P = { x: number; y: number };
type Via = MapLayout["vias"][number];
type Nodo = NonNullable<MapLayout["nodos"]>[number];

/** El segmento de la calle más cercano a `p`: su distancia, su rumbo (°) y la calle. */
function masCercana(vias: readonly Via[], p: P): { via: Via; d: number; rumbo: number } | null {
  let mejor: { via: Via; d: number; rumbo: number } | null = null;
  for (const via of vias)
    for (let i = 0; i + 1 < via.puntos.length; i++) {
      const a = via.puntos[i]!;
      const b = via.puntos[i + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
      if (!mejor || d < mejor.d) mejor = { via, d, rumbo: (Math.atan2(dy, dx) * 180) / Math.PI };
    }
  return mejor;
}

/** Los pasos peatonales de OSM, a lo ancho de su calle; no repite uno que ya declara la escena. */
export function pasosDeOsm(
  vias: readonly Via[],
  nodos: readonly Nodo[],
  declarados: readonly Crosswalk[],
): Crosswalk[] {
  const out: Crosswalk[] = [];
  for (const n of nodos) {
    if (n.tipo !== "paso_peatonal") continue;
    const c = masCercana(vias, n);
    if (!c || c.d > c.via.ancho / 2) continue;
    const yaEsta = [...declarados, ...out].some(
      (o) => Math.hypot(o.center.x - n.x, o.center.y - n.y) < 6,
    );
    if (yaEsta) continue;
    const porSentido = Math.max(1, Math.round((c.via.carriles ?? 2) / (c.via.unSentido ? 1 : 2)));
    out.push({
      center: { x: n.x, y: n.y },
      roadHeading: c.rumbo,
      roadWidth: c.via.ancho,
      length: crosswalkLength(undefined, porSentido, c.via.banqueta !== undefined),
    });
  }
  return out;
}

/**
 * Los semáforos de OSM. El nodo va sobre el eje de la calle: el poste se pone en la orilla derecha,
 * de frente al tránsito que llega, y fuera de cualquier calzada. Sin fases (OSM no las dice), así que
 * van apagados: no se inventa una luz. No repite uno que ya declara la escena.
 */
export function semaforosDeOsm(
  vias: readonly Via[],
  nodos: readonly Nodo[],
  declarados: readonly P[],
  enCalzada: (p: P) => boolean,
): Escenario["dispositivos"] {
  const out: Escenario["dispositivos"] = [];
  for (const n of nodos) {
    if (n.tipo !== "semaforo") continue;
    if (declarados.some((d) => Math.hypot(d.x - n.x, d.y - n.y) < 15)) continue;
    const c = masCercana(vias, n);
    if (!c || c.d > c.via.ancho) continue;
    const r = (c.rumbo * Math.PI) / 180;
    const derecha = { x: Math.sin(r), y: -Math.cos(r) };
    // La orilla derecha y, si ahí hay otra calzada (un cruce ancho), la izquierda. Si en 15 m no hay
    // lugar fuera de la calzada, ese semáforo no se dibuja: nunca en medio de la calle.
    let p: P | null = null;
    for (let lado = c.via.ancho / 2 + 0.6; !p && lado <= c.via.ancho / 2 + 15; lado += 0.5)
      for (const s of [1, -1]) {
        const q = { x: n.x + derecha.x * lado * s, y: n.y + derecha.y * lado * s };
        if (!p && !enCalzada(q)) p = q;
      }
    if (!p) continue;
    const cm = (v: number) => Math.round(v * 100) / 100;
    out.push({
      id: `osm-semaforo-${out.length + 1}`,
      tipo: "semaforo",
      x: cm(p.x),
      y: cm(p.y),
      rumbo_deg: cm(c.rumbo + 180),
      luces: [],
      intermitente: false,
    });
  }
  return out;
}

/** Las flechas pintadas de cada carril (`turn:lanes`), antes del final de la calle. */
export function flechasDeVuelta(vias: readonly Via[]): Mesh2D {
  const m: Mesh2D = { positions: [], indices: [] };
  for (const v of vias) {
    const ida = v.vueltas?.length ?? 0;
    const vuelta = v.vueltasVuelta?.length ?? 0;
    if (!ida && !vuelta) continue;
    const nIda = v.carrilesIda ?? (v.unSentido ? (v.carriles ?? ida) : ida);
    const nVuelta = v.unSentido ? 0 : (v.carrilesVuelta ?? vuelta);
    const total = nIda + nVuelta;
    if (!total || ida > nIda || vuelta > nVuelta) continue;
    const w = v.ancho / total;
    const c = v.ancho / 2 - nVuelta * w;
    // Ida: el final de la calle, carriles de izquierda a derecha (de c hacia la orilla derecha).
    if (ida) {
      const pose = antesDelFinal([...v.puntos].reverse());
      if (pose) v.vueltas!.forEach((f, i) => flecha(m, pose, c - (i + 0.5) * w, f));
    }
    // Vuelta: el principio de la calle, en contra de los puntos.
    if (vuelta) {
      const pose = antesDelFinal(v.puntos);
      if (pose) v.vueltasVuelta!.forEach((f, i) => flecha(m, pose, -(c + (i + 0.5) * w), f));
    }
  }
  return m;
}

/**
 * Dónde van las flechas, mirando hacia el final del recorrido: a 10 m de él (o a la mitad si la calle
 * es más corta). `desdeElFinal` va del final hacia atrás.
 */
function antesDelFinal(desdeElFinal: readonly P[]): { p: P; d: P } | null {
  let largo = 0;
  for (let i = 0; i + 1 < desdeElFinal.length; i++)
    largo += Math.hypot(
      desdeElFinal[i + 1]!.x - desdeElFinal[i]!.x,
      desdeElFinal[i + 1]!.y - desdeElFinal[i]!.y,
    );
  if (largo < 8) return null;
  let falta = Math.min(10, largo / 2);
  for (let i = 0; i + 1 < desdeElFinal.length; i++) {
    const a = desdeElFinal[i]!;
    const b = desdeElFinal[i + 1]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l >= falta) {
      // El sentido de circulación es de b hacia a.
      const d = { x: (a.x - b.x) / l, y: (a.y - b.y) / l };
      return { p: { x: a.x - d.x * falta, y: a.y - d.y * falta }, d };
    }
    falta -= l;
  }
  return null;
}

/**
 * Una flecha (NOM-034: recta, a la izquierda, a la derecha o combinada), de 5 m, centrada en `pose`
 * y movida `lateral` m a la izquierda del sentido de circulación.
 */
function flecha(m: Mesh2D, pose: { p: P; d: P }, lateral: number, que: string): void {
  const n = { x: -pose.d.y, y: pose.d.x };
  const en = (u: number, s: number) => ({
    x: pose.p.x + pose.d.x * u + n.x * (s + lateral),
    y: pose.p.y + pose.d.y * u + n.y * (s + lateral),
  });
  const tri = (a: P, b: P, c: P) => {
    const k = m.positions.length / 2;
    // Antihorario visto desde arriba.
    const cruz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const [q, r] = cruz >= 0 ? [b, c] : [c, b];
    m.positions.push(a.x, a.y, q.x, q.y, r.x, r.y);
    m.indices.push(k, k + 1, k + 2);
  };
  const barra = (u0: number, s0: number, u1: number, s1: number, ancho: number) => {
    const dx = u1 - u0;
    const ds = s1 - s0;
    const l = Math.hypot(dx, ds) || 1;
    const o = { u: (-ds / l) * (ancho / 2), s: (dx / l) * (ancho / 2) };
    const a = en(u0 + o.u, s0 + o.s);
    const b = en(u0 - o.u, s0 - o.s);
    const c = en(u1 - o.u, s1 - o.s);
    const d = en(u1 + o.u, s1 + o.s);
    tri(a, b, c);
    tri(a, c, d);
  };
  const punta = (u: number, s: number, du: number, ds: number) => {
    const l = Math.hypot(du, ds) || 1;
    const [eu, es] = [du / l, ds / l];
    tri(
      en(u + eu * 1.2, s + es * 1.2),
      en(u - es * 0.45, s + eu * 0.45),
      en(u + es * 0.45, s - eu * 0.45),
    );
  };
  const partes = que.split(";").map((x) => x.trim());
  const recta = partes.some((x) => x === "through");
  const izq = partes.some((x) => x.includes("left"));
  const der = partes.some((x) => x.includes("right"));
  if (!recta && !izq && !der) return;
  barra(-2.5, 0, recta ? 1.3 : 0.2, 0, 0.18);
  if (recta) punta(1.3, 0, 1, 0);
  for (const [hay, lado] of [
    [izq, 1],
    [der, -1],
  ] as const)
    if (hay) {
      barra(0.2, 0, 1.1, lado * 0.9, 0.18);
      punta(1.1, lado * 0.9, 1, lado);
    }
}

/** ¿`p` (con un margen de `r` m alrededor) cae en algún triángulo de la malla? */
export function enMalla(m: Mesh2D, p: P, r = 0.3): boolean {
  const pos = m.positions;
  const ix = m.indices;
  const puntos = [
    p,
    ...[0, 1, 2, 3].map((k) => ({
      x: p.x + r * Math.cos((k * Math.PI) / 2),
      y: p.y + r * Math.sin((k * Math.PI) / 2),
    })),
  ];
  for (let t = 0; t < ix.length; t += 3) {
    const [ax, ay, bx, by, cx, cy] = [ix[t]!, ix[t + 1]!, ix[t + 2]!].flatMap((k) => [
      pos[k * 2]!,
      pos[k * 2 + 1]!,
    ]);
    for (const q of puntos) {
      const s1 = (bx! - ax!) * (q.y - ay!) - (by! - ay!) * (q.x - ax!);
      const s2 = (cx! - bx!) * (q.y - by!) - (cy! - by!) * (q.x - bx!);
      const s3 = (ax! - cx!) * (q.y - cy!) - (ay! - cy!) * (q.x - cx!);
      if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return true;
    }
  }
  return false;
}

/** Dos mallas en una. */
export function unirMallas(a: Mesh2D, b: Mesh2D): Mesh2D {
  const k = a.positions.length / 2;
  return {
    positions: [...a.positions, ...b.positions],
    indices: [...a.indices, ...b.indices.map((i) => i + k)],
  };
}
