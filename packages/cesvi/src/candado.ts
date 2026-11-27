/**
 * El candado físico (René, 2026-11-24): «si el resultado exige una desaceleración mayor que la fricción
 * posible, o si la cifra no es coherente con el daño y con lo que se ve en el 3D, Croquis no la presenta
 * como resultado. Dice claramente qué no cuadra y qué revisar, y la animación nunca muestra algo
 * distinto de la cifra».
 *
 * Revisa la reconstrucción con el mismo recorrido que reproduce el 3D (`especReconstruida`, simulado
 * una vez con `reconstruct`):
 * 1. la velocidad con que cada vehículo llega a su choque en la animación cae dentro del rango que
 *    reporta la cifra (sus simulaciones al contacto);
 * 2. al chocar, los vehículos se tocan sin encimarse: dos contornos encimados el solver los separa de
 *    un instante a otro (la carambola de René movía al Aveo 1.6 m de golpe);
 * 3. con huellas de antes del choque, pasar de la velocidad previa a la del impacto en ese largo no
 *    exige frenar más de lo que deja la fricción (1 g: ningún vehículo frena más en pavimento).
 */
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import type { Expediente } from "./corpus";
import { kmhConUnidad, metros, numero, rangoKmh } from "./formato";
import { HOLGURA_FUERA_KMH, mejorFueraDelRango } from "./mejor-fuera";
import { traslape } from "./encimadas";

type Id = Expediente["vehiculos"][number]["id"];
type Json = Record<string, unknown>;

/** m/s²: lo más que frena un vehículo en pavimento (1 g), con 5 % de redondeo. */
export const FRENADA_MAXIMA = 9.81 * 1.05;
/**
 * m: lo más que dos vehículos se enciman en el instante en que el solver detecta su choque. Más que
 * esto es una colocación encimada que el solver separa de golpe (la carambola de René: 0.9 m; la
 * reversa de ejemplo en su pendiente: 1.7 m); por debajo, es lo que avanzan en un paso de la simulación.
 */
export const ENCIMADO_MAXIMO_M = 0.5;

export interface NoCuadra {
  /** Qué no cuadra, en palabras para el perito. */
  motivos: string[];
  /** Qué revisar. */
  revisar: string[];
  /** Lo que daba el ajuste, solo como referencia: no se presenta como resultado. */
  cifras: { vehiculo: Id; mejor: number; p10?: number; p90?: number }[];
}

/** Lo que dice el candado: lo que no cuadra, o null si todo cuadra. */
export interface Candado {
  noCuadra: NoCuadra | null;
}

interface Velocidad {
  vehiculo: Id;
  previa: { mejor: number; p10?: number; p90?: number } | null;
  impacto: { p10?: number; p50?: number; p90?: number } | null;
}

interface Tray {
  t: number[];
  x: number[];
  y: number[];
  vx?: number[];
  vy?: number[];
}

interface VehiculoSimulado {
  id: string;
  dimensiones?: { largo_m?: number; ancho_m?: number };
  trayectoria?: Tray & { rumbo?: number[] };
}

/** Las esquinas del contorno en un instante (rumbo del solver: radianes desde el este). */
function contorno(v: VehiculoSimulado, i: number): [number, number][] {
  const tr = v.trayectoria!;
  const l = (v.dimensiones?.largo_m ?? 4.4) / 2;
  const w = (v.dimensiones?.ancho_m ?? 1.8) / 2;
  const r = tr.rumbo?.[i] ?? 0;
  const f = [Math.cos(r), Math.sin(r)];
  const d = [Math.sin(r), -Math.cos(r)];
  return (
    [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ] as const
  ).map(([a, b]) => [
    tr.x[i]! + a * l * f[0]! + b * w * d[0]!,
    tr.y[i]! + a * l * f[1]! + b * w * d[1]!,
  ]);
}

/**
 * Cuánto se enciman dos vehículos (m, por el eje de menor traslape) en el instante en que el solver
 * detecta su choque: un traslape hondo es una colocación encimada que el solver separa de golpe.
 */
export function encimadoAlChocar(a: VehiculoSimulado, b: VehiculoSimulado, t: number): number {
  const ta = a.trayectoria;
  const tb = b.trayectoria;
  if (!ta?.t?.length || !tb?.t?.length) return 0;
  const ia = ta.t.findIndex((x) => x >= t - 1e-9);
  const ib = tb.t.findIndex((x) => x >= t - 1e-9);
  if (ia < 0 || ib < 0) return 0;
  return traslape(contorno(a, ia), contorno(b, ib))?.prof ?? 0;
}

/**
 * Lo que no cuadra de una reconstrucción. `especAnimada` es el recorrido del 3D
 * (`especReconstruida`); `ids` traduce los ids del solver a los del expediente.
 */
export function candadoFisico(o: {
  especAnimada: Json;
  /** La malla de relieve con que se reconstruyó (la misma que usa el 3D); null en plano. */
  relieve?: unknown;
  ids: Record<string, Id>;
  velocidades: readonly Velocidad[];
  nombre?: (id: Id) => string;
}): Candado {
  const fijadas = o.velocidades.filter((v) => v.previa);
  if (!fijadas.length) return { noCuadra: null };
  const nombre = o.nombre ?? ((id: Id) => String(id));
  const motivos: string[] = [];
  const revisar = new Set<string>();
  const solverDe = (id: Id) => Object.entries(o.ids).find(([, v]) => v === id)?.[0];
  const listo = (): Candado => ({
    noCuadra: motivos.length ? { motivos, revisar: [...revisar], cifras: cifrasDe(fijadas) } : null,
  });

  // 0. El mejor ajuste fuera de su propio rango (René, 2026-11-25, aud-30: «33 con rango 13–30»): la
  // solución depende tanto de la evidencia y los supuestos que no hay una cifra que presentar.
  // Solo si sale por más del 10 % del ancho del rango: el p10 y el p90 de 128 simulaciones tienen su
  // propia incertidumbre, de ese orden; por menos, queda el límite con las dos cifras (`mejor-fuera`).
  for (const v of fijadas) {
    const lado = mejorFueraDelRango(v.previa);
    const { mejor, p10, p90 } = v.previa!;
    if (!lado || p10 === undefined || p90 === undefined) continue;
    const fuera = lado === "arriba" ? mejor - p90 : p10 - mejor;
    if (fuera <= Math.max(HOLGURA_FUERA_KMH, 0.1 * (p90 - p10))) continue;
    motivos.push(
      `${nombre(v.vehiculo)}: el mejor ajuste (${kmhConUnidad(v.previa!.mejor, "reconstruccion")}) queda ${lado === "arriba" ? "por arriba" : "por debajo"} de su propio rango (${rangoKmh(v.previa!.p10, v.previa!.p90, "reconstruccion")}): la solución depende tanto de la evidencia y los supuestos que Croquis no presenta una cifra.`,
    );
    revisar.add(
      "la evidencia y los supuestos del caso (posiciones finales, huellas, masas y rumbos)",
    );
  }

  // 3. La frenada que exigen las huellas de antes del choque.
  const huellas = ((o.especAnimada.evidencias ?? []) as Json[]).filter(
    (e) =>
      (e.tipo === "marcas_frenado" || e.tipo === "marcas_derrape") &&
      (e.fase === "antes_impacto" || (e.tipo === "marcas_frenado" && !e.fase)),
  );
  for (const v of fijadas) {
    const h = huellas.find((e) => e.vehiculo_id === solverDe(v.vehiculo));
    const largo = Number((h?.longitud as Json | undefined)?.valor);
    const alImpacto = v.impacto?.p50;
    if (!h || !(largo > 0) || alImpacto === undefined) continue;
    const v0 = v.previa!.mejor / 3.6;
    const vi = alImpacto / 3.6;
    const a = (v0 * v0 - vi * vi) / (2 * largo);
    if (a > FRENADA_MAXIMA) {
      motivos.push(
        `${nombre(v.vehiculo)}: con ${largo} m de huella, pasar de ${Math.round(v.previa!.mejor)} a ${Math.round(alImpacto)} km/h exige frenar a ${numero(a / 9.81, 1)} g; ningún vehículo frena más de 1 g en pavimento.`,
      );
      revisar.add("las posiciones finales y el largo de las huellas");
    }
  }

  // 1 y 2. El recorrido del 3D.
  let dict: Json;
  try {
    dict = reconstructionToDict(
      reconstruct(o.especAnimada, { relieve: (o.relieve ?? null) as never }),
    );
  } catch {
    return listo();
  }
  const eventos = ((dict.eventos ?? []) as { tipo: string; t: number; actores: string[] }[])
    .filter((e) => e.tipo.startsWith("impacto_"))
    .sort((a, b) => a.t - b.t);
  const simulados = (dict.vehiculos ?? []) as VehiculoSimulado[];
  // 2. Encimados al chocar.
  for (const ev of eventos) {
    const [a, b] = ev.actores.map((x) => simulados.find((v) => v.id === x));
    if (!a || !b) continue;
    const prof = encimadoAlChocar(a, b, ev.t);
    if (prof <= ENCIMADO_MAXIMO_M) continue;
    motivos.push(
      `${nombre(o.ids[a.id]!)} y ${nombre(o.ids[b.id]!)} quedan encimados ${metros(prof, 1)} al chocar en la simulación, y el solver los separa de golpe: la animación los mostraría saltando.`,
    );
    revisar.add(
      "las posiciones de impacto, para que los vehículos se toquen sin encimarse (en La escena, «Separarlos»)",
    );
  }
  for (const sv of simulados) {
    const id = o.ids[sv.id];
    const tr = sv.trayectoria;
    if (!id || !tr?.t?.length) continue;
    // 1. La velocidad al llegar a su primer choque, contra el rango de la cifra.
    const v = fijadas.find((x) => x.vehiculo === id);
    const ev = eventos.find((e) => e.actores.includes(sv.id));
    if (!v || !ev || v.impacto?.p10 === undefined || v.impacto.p90 === undefined) continue;
    const k = Math.max(0, tr.t.findIndex((t) => t >= ev.t) - 1);
    const vx = tr.vx?.[k];
    const vy = tr.vy?.[k];
    if (vx === undefined || vy === undefined) continue;
    const anim = Math.hypot(vx, vy) * 3.6;
    const holgura = Math.max(5, 0.15 * (v.impacto.p50 ?? anim));
    if (anim < v.impacto.p10 - holgura || anim > v.impacto.p90 + holgura) {
      motivos.push(
        `${nombre(id)}: en la animación llega al choque a ${Math.round(anim)} km/h, y la cifra dice que llega entre ${Math.round(v.impacto.p10)} y ${Math.round(v.impacto.p90)}. La animación no mostraría lo que dice la cifra.`,
      );
      revisar.add("las posiciones de impacto y finales, y el rumbo de cada vehículo");
    }
  }
  return listo();
}

function cifrasDe(vs: readonly Velocidad[]): NoCuadra["cifras"] {
  return vs.map((v) => ({
    vehiculo: v.vehiculo,
    mejor: v.previa!.mejor,
    ...(v.previa!.p10 !== undefined ? { p10: v.previa!.p10 } : {}),
    ...(v.previa!.p90 !== undefined ? { p90: v.previa!.p90 } : {}),
  }));
}

/**
 * ¿El vehículo estaba detenido según la narración? (El Aveo de la carambola de René, 2026-11-24:
 * decía «la evidencia no la fija» cuando la narración dice que estaba parado: es 0 km/h, narrado.)
 */
export function detenidoNarrado(r: { spec: Json; ids: Record<string, Id> }, vehiculo: Id): boolean {
  const sv = ((r.spec.vehiculos ?? []) as Json[]).find((v) => r.ids[String(v.id)] === vehiculo);
  const m = (sv?.maniobra ?? {}) as Json;
  return m.valor === "detenido" || m.valor === "estacionado";
}

/** Lo que se muestra de un vehículo sin cifra: detenido, que no cuadra, o que la evidencia no la fija. */
export function sinCifraEnTexto(
  r: { spec: Json; ids: Record<string, Id>; noCuadra?: NoCuadra },
  vehiculo: Id,
): string {
  if (detenidoNarrado(r, vehiculo)) return "0 km/h (detenido, lo dice la narración)";
  if (r.noCuadra) return "no cuadra: Croquis no presenta su velocidad";
  return "la evidencia no la fija";
}
