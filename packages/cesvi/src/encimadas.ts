/**
 * Posiciones finales que se enciman (comentario de René, 2026-10-24): si el perito coloca a dos
 * vehículos en reposo de modo que sus contornos se traslapan, Croquis se lo dice y le propone
 * separarlos. En el impacto se tocan por definición; en el reposo, dos vehículos no ocupan el mismo
 * lugar.
 *
 * El contorno es el rectángulo largo × ancho de la clase (`medidasDe`, el mismo con que el mapa
 * dibuja cada vehículo) en su pose. La propuesta mueve a cada uno la mitad de lo que se traslapan,
 * más `HOLGURA_M`, por el eje de menor traslape: lo mínimo para que dejen de encimarse, sin girarlos.
 */
import type { Expediente } from "./corpus";
import { desdeMetros, enMetros, type LonLat } from "./geo";
import { medidasDe } from "./poses-impacto";

type Id = Expediente["vehiculos"][number]["id"];
type Vec = [number, number];

/** m: la separación que queda entre los dos contornos después de separarlos. */
export const HOLGURA_M = 0.1;
/** m: un traslape menor no se avisa (es el redondeo del mapa). */
const TOLERANCIA_M = 0.01;

export interface PoseFinal {
  vehiculo: Id;
  punto: { lat: number; lon: number };
  rumbo: number;
}

export interface Encimadas {
  vehiculos: [Id, Id];
  /** Cuánto se traslapan, en metros, por el eje de menor traslape. */
  traslape_m: number;
  /** Las dos poses separadas que se proponen (mismo rumbo, cada una movida la mitad). */
  propuesta: [PoseFinal, PoseFinal];
}

function esquinas(c: Vec, rumbo: number, largo: number, ancho: number): Vec[] {
  // Rumbo desde el norte, horario: el frente apunta a (sen r, cos r) en (este, norte).
  const r = (rumbo * Math.PI) / 180;
  const f: Vec = [Math.sin(r), Math.cos(r)];
  const d: Vec = [Math.cos(r), -Math.sin(r)]; // a la derecha
  const out: Vec[] = [];
  for (const [a, b] of [
    [0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
    [-0.5, 0.5],
  ] as const) {
    out.push([
      c[0] + a * largo * f[0] + b * ancho * d[0],
      c[1] + a * largo * f[1] + b * ancho * d[1],
    ]);
  }
  return out;
}

/** Traslape de dos rectángulos por el eje de menor traslape, con la normal de A hacia B; o null. */
function traslape(a: Vec[], b: Vec[]): { prof: number; n: Vec } | null {
  let mejor: { prof: number; n: Vec } | null = null;
  for (const poly of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const p = poly[i]!;
      const q = poly[i + 1]!;
      const largo = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n: Vec = [(q[0] - p[0]) / largo, (q[1] - p[1]) / largo];
      const pa = a.map((u) => u[0] * n[0] + u[1] * n[1]);
      const pb = b.map((u) => u[0] * n[0] + u[1] * n[1]);
      const prof = Math.min(Math.max(...pa) - Math.min(...pb), Math.max(...pb) - Math.min(...pa));
      if (prof <= 0) return null;
      if (!mejor || prof < mejor.prof) {
        // Orientada de A hacia B.
        const ca = pa.reduce((s, x) => s + x, 0) / 4;
        const cb = pb.reduce((s, x) => s + x, 0) / 4;
        mejor = { prof, n: cb >= ca ? n : [-n[0], -n[1]] };
      }
    }
  }
  return mejor;
}

/** Los pares de vehículos cuyas posiciones finales se enciman, con la propuesta para separarlos. */
export function posicionesEncimadas(e: Expediente): Encimadas[] {
  const finales = (e.versiones ?? [])
    .find((v) => v.tipo === "evidencia")
    ?.posiciones?.filter((p) => p.fase === "final")
    .sort((a, b) => (a.vehiculo < b.vehiculo ? -1 : 1));
  if (!finales || finales.length < 2) return [];
  const origen: LonLat = [finales[0]!.punto.lon, finales[0]!.punto.lat];
  const local = finales.map((p) => {
    const v = e.vehiculos.find((x) => x.id === p.vehiculo);
    const { largo, ancho } = v ? medidasDe(v) : { largo: 4.5, ancho: 1.8 };
    const m = enMetros([p.punto.lon, p.punto.lat], origen);
    const c: Vec = [m.este, m.norte];
    return { p, c, contorno: esquinas(c, p.rumbo, largo, ancho) };
  });
  const out: Encimadas[] = [];
  for (let i = 0; i < local.length; i++) {
    for (let k = i + 1; k < local.length; k++) {
      const a = local[i]!;
      const b = local[k]!;
      const t = traslape(a.contorno, b.contorno);
      if (!t || t.prof < TOLERANCIA_M) continue;
      const mitad = (t.prof + HOLGURA_M) / 2;
      const mover = (x: (typeof local)[number], s: number): PoseFinal => {
        const [lon, lat] = desdeMetros(
          x.c[0] + s * mitad * t.n[0],
          x.c[1] + s * mitad * t.n[1],
          origen,
        );
        return { vehiculo: x.p.vehiculo, punto: { lat, lon }, rumbo: x.p.rumbo };
      };
      out.push({
        vehiculos: [a.p.vehiculo, b.p.vehiculo],
        traslape_m: Math.round(t.prof * 100) / 100,
        propuesta: [mover(a, -1), mover(b, 1)],
      });
    }
  }
  return out;
}
