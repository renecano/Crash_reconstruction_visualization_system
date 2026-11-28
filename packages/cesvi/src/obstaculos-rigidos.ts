/**
 * Los edificios, muros y bardas como obstáculos rígidos en la simulación hacia adelante del «¿Y si…?»
 * (René, 2026-11-27: con la Ranger a 100 km/h, los vehículos atravesaban las casas). Se simula; si un
 * vehículo cruza un edificio o un muro del mapa, en la cara que cruza se pone un muro y un impacto
 * contra él (`impacto_vehiculo_objeto`, el mismo cálculo que un choque contra un objeto fijo: el
 * vehículo choca, se detiene y se deforma), y se vuelve a simular. La cifra reconstruida no cambia:
 * esto es solo la hipótesis.
 *
 * Coordenadas de la escena: x al este, y al norte (m).
 */
import { crucesDeTrayectorias, type ObstaculoDelMapa, type Plano } from "./obstaculos";

type Json = Record<string, unknown>;

/** Lo que se agregó: quién chocó contra qué y cuándo (s de la simulación). */
export interface ChoqueContraObstaculo {
  vehiculo: string;
  obstaculo: string;
  tipo: ObstaculoDelMapa["tipo"];
  t: number;
}

/** Cuántas veces se vuelve a simular como mucho (un vehículo que rebota contra otra casa…). */
export const RONDAS_OBSTACULOS = 3;

/** La arista del obstáculo más cercana a `p`: el punto de ella más cercano y su rumbo (°). */
function aristaCercana(
  p: Plano,
  puntos: readonly Plano[],
  cerrado: boolean,
): { q: Plano; rumboDeg: number; largo: number } {
  let mejor = { d: Infinity, q: puntos[0]!, rumboDeg: 0, largo: 0 };
  const n = puntos.length;
  for (let i = 0; i < (cerrado ? n : n - 1); i++) {
    const a = puntos[i]!;
    const b = puntos[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < mejor.d)
      mejor = { d, q, rumboDeg: (Math.atan2(dy, dx) * 180) / Math.PI, largo: Math.sqrt(L2) };
  }
  return mejor;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * La escena de la hipótesis con los obstáculos del mapa como muros rígidos. `simular` corre la escena
 * hacia adelante (el solver de la web en el navegador, o el del proceso en las pruebas) y devuelve el
 * resultado (`reconstructionToDict`).
 */
export async function contraObstaculos(
  spec: Json,
  obstaculos: readonly { nombre: string; tipo: ObstaculoDelMapa["tipo"]; puntos: Plano[] }[],
  simular: (spec: Json) => Promise<Json>,
): Promise<{ spec: Json; resultado: Json; choques: ChoqueContraObstaculo[] }> {
  let s = structuredClone(spec);
  let resultado = await simular(s);
  const choques: ChoqueContraObstaculo[] = [];
  if (!obstaculos.length) return { spec: s, resultado, choques };
  const iniciales = new Map(
    ((s.vehiculos ?? []) as Json[]).flatMap((v) => {
      const p = v.posicion_inicial as { x?: number; y?: number; rumbo_deg?: number } | undefined;
      return p?.x !== undefined && p.y !== undefined
        ? [[String(v.id), { x: p.x, y: p.y, rumbo_deg: p.rumbo_deg ?? 0 }] as const]
        : [];
    }),
  );
  for (let ronda = 0; ronda < RONDAS_OBSTACULOS; ronda++) {
    const ya = new Set(choques.map((c) => `${c.vehiculo}|${c.obstaculo}`));
    const cruces = crucesDeTrayectorias((resultado.vehiculos ?? []) as never, obstaculos, iniciales)
      .filter((c) => !c.enLaLlegada && !ya.has(`${c.vehiculo}|${c.obstaculo}`))
      .sort((a, b) => a.t - b.t);
    const c = cruces[0];
    if (!c) break;
    const ob = obstaculos.find((o) => o.nombre === c.obstaculo)!;
    const v = ((resultado.vehiculos ?? []) as Json[]).find((x) => String(x.id) === c.vehiculo);
    const tr = v?.trayectoria as { t: number[]; x: number[]; y: number[] } | undefined;
    if (!tr) break;
    const k = Math.max(
      0,
      tr.t.findIndex((t) => t >= c.t),
    );
    const arista = aristaCercana({ x: tr.x[k]!, y: tr.y[k]! }, ob.puntos, ob.tipo === "edificio");
    const id = `obj-obstaculo-${choques.length + 1}`;
    s = structuredClone(s);
    const entorno = (s.entorno ??= {}) as Json & { objetos?: Json[] };
    (entorno.objetos ??= []).push({
      id,
      tipo: "muro",
      posicion: { x: r3(arista.q.x), y: r3(arista.q.y) },
      rumbo_deg: Math.round(arista.rumboDeg * 10) / 10,
      largo: {
        valor: Math.max(2, Math.min(12, r3(arista.largo))),
        unidad: "m",
        fuente: "mapa",
        confianza: 0.7,
      },
      ancho: { valor: 0.3, unidad: "m", fuente: "supuesto", confianza: 0.5 },
      alto: { valor: 2.5, unidad: "m", fuente: "supuesto", confianza: 0.5 },
      procedencia: {
        fuente: "mapa",
        confianza: 0.7,
        nota: `${ob.tipo === "edificio" ? "La fachada" : "El muro"} «${ob.nombre}» de OpenStreetMap, como obstáculo rígido de la hipótesis.`,
      },
    });
    const eventos = (s.eventos ?? []) as Json[];
    eventos.push({
      id: `ev-obstaculo-${choques.length + 1}`,
      orden: eventos.length + 1,
      tipo: "impacto_vehiculo_objeto",
      actores: [c.vehiculo, id],
      punto_impacto: { x: r3(arista.q.x), y: r3(arista.q.y) },
      procedencia: {
        fuente: "supuesto",
        confianza: 0.5,
        nota: "Choque contra un edificio o un muro del mapa en la hipótesis «¿Y si…?».",
      },
    });
    s.eventos = eventos;
    choques.push({ vehiculo: c.vehiculo, obstaculo: c.obstaculo, tipo: c.tipo, t: c.t });
    resultado = await simular(s);
  }
  return { spec: s, resultado, choques };
}
