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
import { grados, numero } from "./formato";

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
  /** El valor en pocas palabras, para su tarjeta («μ 0.70»); si no, `valor`. */
  corto?: string;
  /** Lo que abarca, si es un número: lo que dibuja su barra. */
  rango?: { min: number; max: number; valor: number; minTexto: string; maxTexto: string };
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
    : "Lo supone el perito: el caso no dice dónde quedó.";
}

/** La incertidumbre de un reposo supuesto: `PRIORIDAD` veces la de una posición medida. */
export const SIGMA_REPOSO_SUPUESTO_M = PRIORIDAD * SIGMA_POSITION_M;

const NOMBRE_SUPERFICIE: Record<string, string> = {
  asfalto: "asfalto",
  concreto: "concreto",
  adoquin: "adoquín",
  empedrado: "empedrado",
  terraceria: "terracería",
};
const NOMBRE_ESTADO: Record<string, string> = {
  seco: "seco",
  mojado: "mojado",
  encharcado: "encharcado",
  grava_suelta: "con grava suelta",
  lodo: "con lodo",
  aceite: "con aceite",
};

/**
 * La superficie del caso y de dónde sale (René, 2026-11-18): «concreto mojado, como lo narra el
 * perito», «asfalto mojado: se supone porque llovía» o «asfalto seco: la narración no lo dice».
 */
export function superficieDelCaso(spec: { lugar?: unknown } | null | undefined): string {
  type C = { valor?: string; fuente?: string };
  const l = (spec?.lugar ?? {}) as { superficie?: C; estado_superficie?: C };
  const sup = String(l.superficie?.valor ?? "asfalto");
  const est = String(l.estado_superficie?.valor ?? "seco");
  const texto = `${NOMBRE_SUPERFICIE[sup] ?? sup} ${NOMBRE_ESTADO[est] ?? est}`;
  const dichos = [l.superficie, l.estado_superficie].filter((c) => c?.fuente === "usuario").length;
  if (l.estado_superficie?.fuente === "supuesto" && est === "mojado")
    return `${texto} (se supone mojado porque llovía)`;
  if (dichos === 2) return `${texto}, como lo narra el perito`;
  if (dichos === 1)
    return `${texto} (${l.superficie?.fuente === "usuario" ? "la superficie" : "su estado"} lo narra el perito; lo otro se supone)`;
  return `${texto} (la narración no dice la superficie: se supone)`;
}

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
      rango: (() => {
        const min = f ? f.peso_vacio_kg[0]! : v.masa.valor * (1 - MASS_SPREAD);
        const max = f ? f.peso_vacio_kg[1]! : v.masa.valor * (1 + MASS_SPREAD);
        return { min, max, valor: v.masa.valor, minTexto: kg(min), maxTexto: kg(max) };
      })(),
      justificacion: f
        ? `Ficha técnica de ${titulo(`${f.marca} ${f.modelo}`)} ${f.anio}: ${f.regla} (data/SOURCES.md).`
        : tipica && tipica.valor === v.masa.valor
          ? `Valor típico de su clase (${tipica.fuente}).`
          : "Supuesta: el caso no la da.",
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
      corto: `±${SIGMA_REPOSO_SUPUESTO_M} m`,
      vehiculo: p.vehiculo,
      justificacion: justificacionReposo(e),
      incertidumbre: `±${SIGMA_REPOSO_SUPUESTO_M} m: ${PRIORIDAD} veces la de una posición medida, así que la deformación medida pesa más.`,
    });
  }
  if (!r) return out;
  const spec = r.spec as { vehiculos?: Json[] } | undefined;
  for (const sv of spec?.vehiculos ?? []) {
    const pi = sv.posicion_inicial as
      { procedencia?: { fuente?: string; nota?: string } } | undefined;
    const id = r.ids[String(sv.id)];
    if (!id || pi?.procedencia?.fuente !== "supuesto") continue;
    // El rumbo que la evidencia no fija se queda en el del mapa y entra al rango (ADR 0135).
    const rumbo = (
      (r.resultado?.inversion as { parametros?: Json[] } | undefined)?.parametros ?? []
    ).find((p) => p.parametro === "rumbo_inicial" && p.vehiculo === sv.id);
    const rumboSupuesto = rumbo !== undefined && rumbo.identificable === false;
    out.push({
      clave: `inicio-${id}`,
      que: `Posición inicial de ${id}`,
      valor: pi.procedencia.nota?.replace(/\.$/, "") ?? "supuesta por Croquis",
      vehiculo: id,
      justificacion: "El caso no la da: es el punto de partida de la reconstrucción.",
      incertidumbre: rumboSupuesto
        ? `La evidencia no fija su rumbo de llegada: se usa el que se colocó en el mapa (${grados(Number(rumbo.inicial))}) y en el rango se sortea ±${ANGLE_BOUND_DEG}° alrededor de él. La inversión ajusta su velocidad.`
        : `La inversión ajusta su velocidad y su rumbo de llegada (±${ANGLE_BOUND_DEG}°).`,
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
      corto: `μ ${numero(mu.valor, 2)}`,
      ...(mu.rango
        ? {
            rango: {
              min: mu.rango[0],
              max: mu.rango[1],
              valor: mu.valor,
              minTexto: numero(mu.rango[0], 2),
              maxTexto: numero(mu.rango[1], 2),
            },
          }
        : {}),
      justificacion: `Valor de la literatura para ${superficieDelCaso(r.spec)} (${mu.fuente ?? "tabla de fricción de Croquis"}).`,
      incertidumbre: mu.rango
        ? `En el rango de las velocidades, μ de ${mu.rango[0]} a ${mu.rango[1]}.`
        : "Sin rango.",
    });
  if (arrastre?.valor !== undefined) {
    // Desde la Tanda 3 (ADR 0139) la fracción también se sortea en su rango; un resultado guardado
    // antes no trae `rango` y se describe como entonces: fracción fija.
    const [fMin, fMax] = arrastre.rango ?? [arrastre.valor, arrastre.valor];
    out.push({
      clave: "arrastre",
      que: "Después del impacto",
      valor: `las llantas ruedan, con un arrastre de ${arrastre.valor} de la fricción`,
      corto: `${arrastre.valor} × μ`,
      ...(mu?.valor !== undefined && mu.rango
        ? {
            rango: {
              min: fMin * mu.rango[0],
              max: fMax * mu.rango[1],
              valor: arrastre.valor * mu.valor,
              minTexto: numero(fMin * mu.rango[0], 2),
              maxTexto: numero(fMax * mu.rango[1], 2),
            },
          }
        : {}),
      justificacion: arrastre.rango
        ? `Supuesto de Croquis: el caso no trae huellas de arrastre que digan que las llantas deslizaron. La fracción sale de la literatura (${arrastre.fuente ?? "Fricke 2010"}).`
        : "Supuesto de Croquis: el caso no trae huellas de arrastre que digan que las llantas deslizaron.",
      incertidumbre: arrastre.rango
        ? mu?.rango
          ? `En el rango de las velocidades, la fracción va de ${arrastre.rango[0]} a ${arrastre.rango[1]} y la fricción de ${mu.rango[0]} a ${mu.rango[1]}: el arrastre, de ${numero(fMin * mu.rango[0], 2)} a ${numero(fMax * mu.rango[1], 2)}.`
          : `En el rango de las velocidades, la fracción va de ${arrastre.rango[0]} a ${arrastre.rango[1]}.`
        : mu?.rango
          ? `La fracción es fija; varía con la fricción (de ${numero(arrastre.valor * mu.rango[0], 2)} a ${numero(arrastre.valor * mu.rango[1], 2)}).`
          : "La fracción es fija.",
    });
  }
  // Los otros dos supuestos del impacto (ADR 0139): solo si el resultado ya los trae con su rango.
  const restitucion = parametros.restitucion_vehiculo_vehiculo;
  if (restitucion?.valor !== undefined && restitucion.rango)
    out.push({
      clave: "restitucion",
      que: "Restitución del choque",
      valor: `e = ${restitucion.valor}`,
      corto: `e ${numero(restitucion.valor, 2)}`,
      rango: {
        min: restitucion.rango[0],
        max: restitucion.rango[1],
        valor: restitucion.valor,
        minTexto: numero(restitucion.rango[0], 2),
        maxTexto: numero(restitucion.rango[1], 2),
      },
      justificacion: `Supuesto de Croquis: cuánto rebotan los vehículos al separarse. El rango sale de pruebas de choque (${restitucion.fuente ?? "literatura"}).`,
      incertidumbre: `En el rango de las velocidades, e de ${restitucion.rango[0]} a ${restitucion.rango[1]}.`,
    });
  const razon = parametros.relacion_impulso_tangencial;
  if (razon?.valor !== undefined && razon.rango)
    out.push({
      clave: "razon_impulso",
      que: "Fricción entre los vehículos durante el choque",
      valor: `razón de impulso de ${razon.valor}`,
      corto: `razón ${numero(razon.valor, 2)}`,
      rango: {
        min: razon.rango[0],
        max: razon.rango[1],
        valor: razon.valor,
        minTexto: numero(razon.rango[0], 2),
        maxTexto: numero(razon.rango[1], 2),
      },
      justificacion: `Supuesto de Croquis: el tope del impulso tangencial entre el normal; solo pesa si los vehículos deslizan uno contra otro. No hay un rango tabulado: ${razon.fuente ?? "se declara con su justificación"}.`,
      incertidumbre: `En el rango de las velocidades, de ${razon.rango[0]} a ${razon.rango[1]}.`,
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
