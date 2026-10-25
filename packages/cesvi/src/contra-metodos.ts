/**
 * La reconstrucción contra cada método de CESVI que trae el reporte (diagnóstico de AXA, ADR 0091).
 * Cada velocidad del reporte se pone junto a la de la reconstrucción que mide lo mismo que pueda
 * medir el solver, con su diferencia en km/h y en %, y una línea en lenguaje de perito de por qué
 * los métodos no tienen que coincidir. Nada se ajusta para que cuadre: si el solver además no
 * alcanza la deformación medida (`dano_no_alcanzado`), se avisa con sus números.
 */
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import type { Expediente } from "./corpus";
import { especReconstruida, type Reconstruccion } from "./reconstruccion";

type Id = Expediente["vehiculos"][number]["id"];
type Json = Record<string, unknown>;

export interface FilaMetodoCesvi {
  /** El vehículo al que el reporte atribuye la velocidad. */
  vehiculo: Id;
  metodo: string;
  /** Qué velocidad calcula el reporte con ese método. */
  cesviQue: string;
  cesviKmh: number;
  /** La velocidad de la reconstrucción con la que se compara, y cuál es. */
  croquisQue: string;
  croquisKmh: number | null;
  /**
   * p10–p90 de la velocidad de la reconstrucción (las reestimaciones con entradas perturbadas), si
   * la evidencia la fija: con AXA el ajuste cambia con la semilla (`eval/results/axa_semillas.json`).
   */
  croquisRango: [number, number] | null;
  /** Croquis − CESVI (km/h) y su porcentaje sobre CESVI; null si la reconstrucción no la fija. */
  diferenciaKmh: number | null;
  diferenciaPct: number | null;
  /** Por qué los métodos no miden lo mismo, en una línea. */
  porQue: string;
}

export interface ContraMetodosCesvi {
  filas: FilaMetodoCesvi[];
  /** La reconstrucción no alcanza la deformación medida de un vehículo, con sus números. */
  avisos: string[];
}

const KMH = 3.6;
const r2 = (x: number) => Math.round(x * 100) / 100;

const entrada = (c: NonNullable<Expediente["calculos"]>[number], nombre: string) =>
  c.entradas?.find((e) => e.nombre === nombre)?.valor.valor;

/** Velocidad (km/h) de un vehículo de la reconstrucción justo después del primer impacto. */
function alSalirDelImpacto(resultado: Json, sid: string): number | null {
  const v = ((resultado.vehiculos ?? []) as Json[]).find((x) => x.id === sid);
  const tr = v?.trayectoria as { t: number[]; vx: number[]; vy: number[] } | undefined;
  if (!tr) return null;
  const i = tr.t.findIndex((t) => t > 0);
  return i < 0 ? null : Math.hypot(tr.vx[i]!, tr.vy[i]!) * KMH;
}

/**
 * `ajustada` es la reconstrucción con las velocidades que ajustó la inversión (la del 3D); sin ella,
 * se calcula. Las trayectorias de `r.resultado` van con las velocidades de partida de la escena.
 */
export function reconstruccionContraCesvi(
  e: Expediente,
  r: Reconstruccion,
  ajustada?: Json,
): ContraMetodosCesvi {
  let conAjuste = ajustada;
  const trayectorias = () =>
    (conAjuste ??= reconstructionToDict(reconstruct(especReconstruida(r))));
  const sid = (id: Id) => Object.entries(r.ids).find(([, x]) => x === id)?.[0];
  const previa = (id: Id) => r.velocidades.find((v) => v.vehiculo === id)?.previa?.mejor ?? null;
  const rango = (id: Id): [number, number] | null => {
    const p = r.velocidades.find((v) => v.vehiculo === id)?.previa;
    return p?.p10 !== undefined && p.p90 !== undefined ? [r2(p.p10), r2(p.p90)] : null;
  };
  const parametros = (r.resultado.parametros ?? {}) as Record<string, { valor?: number }>;
  const arrastre = parametros.arrastre_post_impacto?.valor;
  const filas: FilaMetodoCesvi[] = [];
  for (const c of e.calculos ?? []) {
    const res = c.resultado;
    if (!c.vehiculo || !res || res.unidad !== "km/h") continue;
    const v = c.vehiculo;
    if (c.metodo === "ebs") {
      filas.push({
        vehiculo: v,
        metodo: "Deformación (EBS)",
        cesviQue: `velocidad equivalente de barrera de ${v}`,
        cesviKmh: res.valor,
        croquisQue: `velocidad de ${v} antes del impacto`,
        croquisKmh: previa(v),
        croquisRango: rango(v),
        diferenciaKmh: null,
        diferenciaPct: null,
        porQue: `CESVI convierte la energía de la deformación de ${v} en la velocidad de un choque contra un muro fijo, √(2E/m), con la masa de ${v} sola; Croquis calcula a qué velocidad circulaba, con el momento de los dos vehículos y lo que recorrieron después del impacto.`,
      });
    } else if (c.metodo === "desplazamiento") {
      const s = sid(v);
      const D = entrada(c, "D");
      const a = entrada(c, "a");
      filas.push({
        vehiculo: v,
        metodo: "Restos (desplazamiento)",
        cesviQue: `velocidad de ${v} al salir del impacto`,
        cesviKmh: res.valor,
        croquisQue: `velocidad de ${v} al salir del impacto`,
        croquisKmh: s ? alSalirDelImpacto(trayectorias(), s) : null,
        croquisRango: null,
        diferenciaKmh: null,
        diferenciaPct: null,
        porQue: `CESVI hace que los vehículos se deslicen juntos${D !== undefined ? ` ${D} m` : ""}${a !== undefined ? ` con a = ${a}` : ""} (llantas que no ruedan); en Croquis, después del golpe las llantas ruedan${arrastre !== undefined ? ` con un arrastre de ${arrastre} de la fricción` : ""} y cada vehículo sigue su propia trayectoria, así que la misma distancia pide otra velocidad.`,
      });
    }
  }
  for (const f of filas) {
    if (f.croquisKmh === null) continue;
    f.croquisKmh = r2(f.croquisKmh);
    f.diferenciaKmh = r2(f.croquisKmh - f.cesviKmh);
    f.diferenciaPct = r2((100 * (f.croquisKmh - f.cesviKmh)) / f.cesviKmh);
  }
  const avisos = ((r.resultado.consistencia ?? []) as Json[])
    .filter((b) => b.codigo === "dano_no_alcanzado")
    .map((b) => {
      const d = b.datos as {
        vehiculo: string;
        dano_minimo_kmh: number[];
        reconstruccion_kmh: number;
      };
      const v = r.ids[d.vehiculo] ?? d.vehiculo;
      const [p10, p90] = d.dano_minimo_kmh;
      return `La reconstrucción no alcanza la deformación medida de ${v}: solo con ella, su cambio de velocidad sería de al menos ${p10!.toFixed(0)}–${p90!.toFixed(0)} km/h, y en la reconstrucción que reproduce las posiciones finales es de ${d.reconstruccion_kmh.toFixed(0)} km/h. Revisa las posiciones finales que sean supuestos: con ellas, la velocidad de ${v} sale baja para ese daño.`;
    });
  return { filas, avisos };
}
