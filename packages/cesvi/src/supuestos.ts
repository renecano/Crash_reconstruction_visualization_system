/**
 * Los supuestos declarados de un caso (René, 2026-10-26; ADR 0091). Los reportes de CESVI son casos
 * de ejemplo: lo que no traen no existe y no se pide. Entra como supuesto, con su justificación
 * (supuesto del método de CESVI, ficha técnica, valor típico de su clase con su fuente o supuesto
 * del solver) y su incertidumbre, la que entra en el rango de las velocidades.
 *
 * Una sola lista para el paso 6, el 3D, la bitácora y el dictamen: se deduce del expediente y de la
 * reconstrucción, sin números escritos a mano (las incertidumbres son las constantes del solver).
 */
import { ANGLE_BOUND_DEG, MASS_SPREAD, PRIORIDAD, SIGMA_POSITION_M } from "@croquis/solver-ts";
import type { Expediente } from "./corpus";
import { masaTipica } from "./escena-narracion";
import { fichaDe } from "./fichas";
import type { Reconstruccion } from "./reconstruccion";

type Id = Expediente["vehiculos"][number]["id"];
type Json = Record<string, unknown>;

export interface SupuestoDeclarado {
  /** Para la interfaz y las pruebas: «masa-V1», «reposo-V2», «arrastre»… */
  clave: string;
  /** Qué se supone: «Masa de V1». */
  que: string;
  valor: string;
  justificacion: string;
  /** Cómo entra en el rango de las velocidades. */
  incertidumbre: string;
  vehiculo?: Id;
}

const kg = (x: number) => `${x.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg`;
const pct = (x: number) => `±${Math.round(x * 100)} %`;
const titulo = (t: string) => t.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** Si el reporte calcula con el método de restos de CESVI (los vehículos se desplazan juntos). */
const usaMetodoDeRestos = (e: Expediente) =>
  (e.calculos ?? []).some((c) => c.metodo === "desplazamiento");

/** El reposo de un vehículo, supuesto, según cómo lo justifica el caso. */
export function justificacionReposo(e: Expediente): string {
  return usaMetodoDeRestos(e)
    ? "Supuesto del método de restos de CESVI: los vehículos se desplazan juntos después del impacto, así que queda junto al otro."
    : "Lo supone el perito: el reporte no da dónde quedó.";
}

/** La incertidumbre de un reposo supuesto: `PRIORIDAD` veces la de una posición medida. */
export const SIGMA_REPOSO_SUPUESTO_M = PRIORIDAD * SIGMA_POSITION_M;

export function supuestosDeclarados(
  e: Expediente,
  r: Reconstruccion | null = null,
): SupuestoDeclarado[] {
  const out: SupuestoDeclarado[] = [];
  for (const v of e.vehiculos) {
    if (v.masa?.fuente !== "supuesto") continue;
    const f = fichaDe(v);
    const tipica = masaTipica(v.clase);
    out.push({
      clave: `masa-${v.id}`,
      que: `Masa de ${v.id}`,
      valor: kg(v.masa.valor),
      vehiculo: v.id,
      justificacion: f
        ? `Ficha técnica de ${titulo(`${f.marca} ${f.modelo}`)} ${f.anio}: ${f.regla} (data/SOURCES.md).`
        : tipica && tipica.valor === v.masa.valor
          ? `Valor típico de su clase (${tipica.fuente}).`
          : "Supuesta: el reporte no la da.",
      incertidumbre: f
        ? `La ficha va de ${kg(f.peso_vacio_kg[0]!)} a ${kg(f.peso_vacio_kg[1]!)}; en el rango de las velocidades, ${pct(MASS_SPREAD)}.`
        : `En el rango de las velocidades, ${pct(MASS_SPREAD)}.`,
    });
  }
  const evidencia = e.versiones?.find((x) => x.tipo === "evidencia");
  for (const p of evidencia?.posiciones ?? []) {
    if (p.fase !== "final" || p.fuente !== "supuesto") continue;
    out.push({
      clave: `reposo-${p.vehiculo}`,
      que: `Posición final de ${p.vehiculo}`,
      valor: "la que se colocó en el mapa",
      vehiculo: p.vehiculo,
      justificacion: justificacionReposo(e),
      incertidumbre: `±${SIGMA_REPOSO_SUPUESTO_M} m: ${PRIORIDAD} veces la de una posición medida, así que la deformación medida pesa más (ADR 0091).`,
    });
  }
  if (!r) return out;
  const spec = r.spec as { vehiculos?: Json[] } | undefined;
  for (const sv of spec?.vehiculos ?? []) {
    const pi = sv.posicion_inicial as
      { procedencia?: { fuente?: string; nota?: string } } | undefined;
    const id = r.ids[String(sv.id)];
    if (!id || pi?.procedencia?.fuente !== "supuesto") continue;
    out.push({
      clave: `inicio-${id}`,
      que: `Posición inicial de ${id}`,
      valor: pi.procedencia.nota?.replace(/\.$/, "") ?? "supuesta por Croquis",
      vehiculo: id,
      justificacion: "El reporte no la da: es el punto de partida de la reconstrucción.",
      incertidumbre: `La inversión ajusta su velocidad y su rumbo de llegada (±${ANGLE_BOUND_DEG}°).`,
    });
  }
  const parametros = (r.resultado?.parametros ?? {}) as Record<
    string,
    { valor?: number; rango?: [number, number]; fuente?: string; tipo?: string }
  >;
  const mu = parametros.friccion_llanta;
  const arrastre = parametros.arrastre_post_impacto;
  if (mu?.valor !== undefined)
    out.push({
      clave: "friccion",
      que: "Fricción llanta–pavimento",
      valor: `μ = ${mu.valor}`,
      justificacion: `Valor de la literatura para la superficie del caso (${mu.fuente ?? "tabla de fricción del solver"}).`,
      incertidumbre: mu.rango
        ? `En el rango de las velocidades, μ de ${mu.rango[0]} a ${mu.rango[1]}.`
        : "Sin rango.",
    });
  if (arrastre?.valor !== undefined)
    out.push({
      clave: "arrastre",
      que: "Después del impacto",
      valor: `las llantas ruedan, con un arrastre de ${arrastre.valor} de la fricción`,
      justificacion:
        "Supuesto del solver: el reporte no trae huellas de arrastre que digan que las llantas deslizaron, y no hay una fuente medida para un vehículo dañado que rueda.",
      incertidumbre: arrastre.rango
        ? `En el rango de las velocidades, la fracción va de ${arrastre.rango[0]} (rodar libre) a ${arrastre.rango[1]} (deslizar con toda la fricción).`
        : mu?.rango
          ? `La fracción es fija; varía con la fricción (de ${(arrastre.valor * mu.rango[0]).toFixed(2)} a ${(arrastre.valor * mu.rango[1]).toFixed(2)}).`
          : "La fracción es fija.",
    });
  return out;
}

/** Los supuestos en una línea: «Masa de V1: 2,562.1 kg; Posición final de V2: …». */
export function supuestosEnUnaLinea(s: readonly SupuestoDeclarado[]): string {
  return s.map((x) => `${x.que}: ${x.valor}`).join("; ");
}

/**
 * Lo que queda cuando el perito contesta «No sé» a una pregunta del Físico: el supuesto, con su
 * nombre. null si la pregunta no es de las que agrega el Físico.
 */
export function supuestoAlNoSaber(
  clave: string,
  supuestos: readonly SupuestoDeclarado[],
): string | null {
  const [tipo, v] = clave.split("-") as [string, Id | undefined];
  if (!v) return null;
  if (tipo === "final") {
    const s = supuestos.find((x) => x.clave === `reposo-${v}`);
    return s
      ? `Queda el supuesto «${s.que}», ${s.incertidumbre.split(":")[0]}. ${s.justificacion}`
      : `${v} sigue sin posición final: la evidencia no fija su velocidad con ella.`;
  }
  if (tipo === "huella")
    return `Queda el supuesto: sin huellas de frenado de ${v}, su frenado antes del impacto es el que narra el hecho (o ninguno), sin una distancia medida que lo fije.`;
  return null;
}
