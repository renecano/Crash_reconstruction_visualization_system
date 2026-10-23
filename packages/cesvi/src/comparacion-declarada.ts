/**
 * R7 (ADR 0070): la versión que declara un conductor, simulada con el mismo solver que la
 * reconstrucción, y «Qué cambia entre versiones» fila por fila. Croquis no declara culpables ni
 * dice quién miente: muestra en qué se parecen y en qué no, y una sugerencia solo si el perito la
 * pide.
 *
 * La versión declarada parte de la escena de la reconstrucción (mismo lugar, mismos vehículos y
 * mismo punto de impacto) y cambia lo que dice el conductor: maniobras, velocidades y caras de
 * contacto. Las posiciones finales del perito se quitan, porque son evidencia: la versión declarada
 * se simula hacia adelante y se ve a dónde la lleva la física.
 */
import type { Expediente } from "./corpus";
import type { VersionDeclarada } from "./declaracion";
import type { EscenaSolver, Reconstruccion } from "./reconstruccion";

type Json = Record<string, unknown>;
type Id = Expediente["vehiculos"][number]["id"];

const LADO: Record<string, string> = {
  frontal: "F",
  posterior: "B",
  lateral_izquierdo: "L",
  lateral_derecho: "R",
};
const CARA: Record<string, string> = {
  F: "frontal",
  B: "posterior",
  L: "lateral_izquierdo",
  R: "lateral_derecho",
};
/** La dirección de deformación que deja un golpe en cada cara. */
const ENTRA: Record<string, string> = {
  frontal: "de_adelante_hacia_atras",
  posterior: "de_atras_hacia_adelante",
  lateral_izquierdo: "de_izquierda_a_derecha",
  lateral_derecho: "de_derecha_a_izquierda",
};
/** La maniobra de la escena v1 para cada maniobra declarada. */
const MANIOBRA: Record<string, string> = {
  circula: "recto",
  se_detiene: "detenido",
  reversa: "reversa",
  vira_izquierda: "vuelta_izquierda",
  vira_derecha: "vuelta_derecha",
};
const DEL_CONDUCTOR = { fuente: "usuario", confianza: 0.6, nota: "Lo declara el conductor." };

/**
 * La escena de la versión declarada. Sin velocidad declarada, un vehículo va a la que fijó la
 * reconstrucción (si la fija), marcada como tal.
 */
export function especDeclarada(
  base: EscenaSolver,
  v: VersionDeclarada,
  reconstruidas: ReadonlyMap<Id, number> = new Map(),
): EscenaSolver {
  const spec = structuredClone(base.spec) as EscenaSolver["spec"] & {
    vehiculos: Json[];
    eventos: Json[];
  };
  const limites: string[] = [];
  const escenaDe = (id: Id) => Object.keys(base.ids).find((k) => base.ids[k] === id);
  for (const sv of spec.vehiculos) {
    const id = base.ids[String(sv.id)]!;
    const man = v.maniobras.find((m) => m.vehiculo === id);
    const k = man ? MANIOBRA[man.tipo] : undefined;
    if (k) sv.maniobra = { valor: k, ...DEL_CONDUCTOR };
    const vel = v.velocidades.find((x) => x.vehiculo === id);
    if (k === "detenido") {
      sv.velocidad_previa = { valor: 0, unidad: "km/h", ...DEL_CONDUCTOR };
    } else if (vel) {
      sv.velocidad_previa = { valor: vel.kmh, unidad: "km/h", ...DEL_CONDUCTOR };
    } else if (reconstruidas.has(id)) {
      sv.velocidad_previa = {
        valor: Math.round(reconstruidas.get(id)! * 10) / 10,
        unidad: "km/h",
        fuente: "supuesto",
        confianza: 0.5,
        nota: "La de la reconstrucción: el conductor no la declara.",
      };
      limites.push(`${id}: el conductor no declara su velocidad; va la de la reconstrucción.`);
    }
    delete sv.posicion_final;
  }
  // Las caras de contacto que dice del primer impacto.
  const primero = spec.eventos.find((e) => String(e.tipo).startsWith("impacto_"));
  const contactos = v.contactos.filter(
    (c) => c.impacto === Math.min(...v.contactos.map((x) => x.impacto)),
  );
  if (primero && contactos.length) {
    const zonas = [
      ...((primero.zonas_impacto as { vehiculo_id: string; cdc: Json }[] | undefined) ?? []),
    ];
    for (const c of contactos) {
      const vid = escenaDe(c.vehiculo);
      const lado = LADO[c.cara];
      if (!vid || !lado) continue;
      const i = zonas.findIndex((z) => z.vehiculo_id === vid);
      const z = { vehiculo_id: vid, cdc: { lado } };
      if (i >= 0) zonas[i] = z;
      else zonas.push(z);
    }
    primero.zonas_impacto = zonas;
  }
  return { ...base, spec, limites: [...base.limites, ...limites] };
}

export type EstadoDeclarada = "coincide" | "no_coincide" | "sin_dato";

export interface FilaDeclarada {
  clave: "velocidad" | "posicion_final" | "zona" | "direccion" | "altura";
  vehiculo: Id;
  concepto: string;
  declarada: string;
  evidencia: string;
  estado: EstadoDeclarada;
  /** De dónde sale la fila. */
  fuente: string;
  /** Si es un indicador de correspondencia de daños (cuenta para la sugerencia). */
  indicador: boolean;
}

/** La dirección de deformación que deja una fuerza principal (PDOF) en horas de reloj. */
export function direccionDePdof(horas: number): string | null {
  const h = ((horas % 12) + 12) % 12;
  // ±1 h: de 11 a 1 es frontal, de 2 a 4 derecha…; las oblicuas (1 a 2, 4 a 5…) no dan dirección.
  const cerca = (c: number) => Math.min(Math.abs(h - c), 12 - Math.abs(h - c)) <= 1;
  if (cerca(0)) return "de_adelante_hacia_atras";
  if (cerca(6)) return "de_atras_hacia_adelante";
  if (cerca(3)) return "de_derecha_a_izquierda";
  if (cerca(9)) return "de_izquierda_a_derecha";
  return null;
}

interface VehiculoResultado {
  id: string;
  dimensiones?: { largo_m?: number };
  pdof_horas?: number | null;
  dano?: { cdc?: { lado?: string } | null };
  pose_final?: { x: number; y: number };
}

const enPalabras = (s: string) => s.replaceAll("_", " ");

/**
 * «Qué cambia entre versiones» (R7): la versión declarada (simulada) contra la reconstrucción y los
 * daños que observó el perito. Una posición final coincide si queda a menos de un largo del
 * vehículo de la de la reconstrucción; una velocidad declarada, si cae en el rango p10–p90 que fija
 * la evidencia.
 */
export function compararDeclarada(e: {
  expediente: Expediente;
  reconstruccion: Reconstruccion;
  declarada: VersionDeclarada;
  /** El resultado del solver para `especDeclarada`. */
  resultadoDeclarado: Json;
}): FilaDeclarada[] {
  const { expediente, reconstruccion: r, declarada: v } = e;
  const ids = r.ids;
  const vehRes = (res: Json, id: Id) =>
    ((res.vehiculos as VehiculoResultado[] | undefined) ?? []).find((x) => ids[x.id] === id);
  const filas: FilaDeclarada[] = [];
  for (const veh of expediente.vehiculos) {
    const id = veh.id;
    const ev = vehRes(r.resultado, id);
    const de = vehRes(e.resultadoDeclarado, id);
    // Velocidad
    const vel = v.velocidades.find((x) => x.vehiculo === id);
    const rec = r.velocidades.find((x) => x.vehiculo === id)?.previa ?? null;
    if (vel) {
      const dentro =
        rec && rec.p10 !== undefined && rec.p90 !== undefined
          ? vel.kmh >= rec.p10 && vel.kmh <= rec.p90
          : null;
      filas.push({
        clave: "velocidad",
        vehiculo: id,
        concepto: "Velocidad previa",
        declarada: `${vel.kmh} km/h`,
        evidencia: rec
          ? `${rec.mejor.toFixed(1)} km/h (${rec.p10?.toFixed(1) ?? "—"}–${rec.p90?.toFixed(1) ?? "—"})`
          : "la evidencia no la fija",
        estado: dentro === null ? "sin_dato" : dentro ? "coincide" : "no_coincide",
        fuente:
          "Lo que declara el conductor · la inversión de la reconstrucción con la evidencia del perito",
        indicador: false,
      });
    }
    // Posición final
    if (ev?.pose_final && de?.pose_final) {
      const d = Math.hypot(de.pose_final.x - ev.pose_final.x, de.pose_final.y - ev.pose_final.y);
      const largo = ev.dimensiones?.largo_m ?? 4.5;
      filas.push({
        clave: "posicion_final",
        vehiculo: id,
        concepto: "Posición final",
        declarada: `a ${d.toFixed(1)} m de la reconstruida`,
        evidencia: "la de la reconstrucción",
        estado: d <= largo ? "coincide" : "no_coincide",
        fuente: "La versión declarada simulada con el solver · la reconstrucción",
        indicador: true,
      });
    }
    // Zona de contacto: la que deja la versión declarada contra los daños que observó el perito.
    const observadas = [
      ...new Set(
        (expediente.danos ?? [])
          .filter((d) => d.vehiculo === id && !d.dano_previo)
          .map((d) => d.zona.cara),
      ),
    ];
    const ladoDeclarado = de?.dano?.cdc?.lado;
    const caraDeclarada = ladoDeclarado ? CARA[ladoDeclarado] : undefined;
    if (caraDeclarada || observadas.length) {
      filas.push({
        clave: "zona",
        vehiculo: id,
        concepto: "Zona de contacto",
        declarada: caraDeclarada ? enPalabras(caraDeclarada) : "—",
        evidencia: observadas.length ? observadas.map(enPalabras).join(", ") : "—",
        estado:
          !caraDeclarada || !observadas.length
            ? "sin_dato"
            : observadas.includes(caraDeclarada as never)
              ? "coincide"
              : "no_coincide",
        fuente: "La versión declarada simulada · los daños que observó el perito",
        indicador: true,
      });
    }
    // Dirección de la fuerza contra la dirección de deformación. La declarada sale de la cara que
    // dice el conductor; si no la dice, de la fuerza principal (PDOF) de la versión simulada, que
    // conserva la geometría del impacto de la evidencia.
    const dirObs = [
      ...new Set(
        (expediente.danos ?? [])
          .filter((d) => d.vehiculo === id && !d.dano_previo)
          .flatMap((d) => d.direcciones ?? []),
      ),
    ];
    const caraDicha = v.contactos.find((c) => c.vehiculo === id)?.cara;
    const dirDecl =
      (caraDicha ? ENTRA[caraDicha] : undefined) ??
      (typeof de?.pdof_horas === "number" ? direccionDePdof(de.pdof_horas) : null);
    if (dirDecl || dirObs.length) {
      filas.push({
        clave: "direccion",
        vehiculo: id,
        concepto: "Dirección de la deformación",
        declarada: dirDecl ? enPalabras(dirDecl) : "—",
        evidencia: dirObs.length ? dirObs.map(enPalabras).join(", ") : "—",
        estado:
          !dirDecl || !dirObs.length
            ? "sin_dato"
            : dirObs.includes(dirDecl as never)
              ? "coincide"
              : "no_coincide",
        fuente: "La fuerza principal de la versión declarada · la dirección que observó el perito",
        indicador: true,
      });
    }
  }
  // Altura: los daños de las caras que se tocan en la versión declarada deben estar a la misma altura.
  const par = expediente.vehiculos.slice(0, 2).map((x) => x.id);
  if (par.length === 2) {
    const alturas = par.map((id) => {
      const lado = vehRes(e.resultadoDeclarado, id)?.dano?.cdc?.lado;
      const cara = lado ? CARA[lado] : undefined;
      const h = (expediente.danos ?? []).find(
        (d) => d.vehiculo === id && !d.dano_previo && d.zona.cara === cara,
      )?.altura_cm;
      return h?.min !== undefined && h.max !== undefined ? { min: h.min, max: h.max } : undefined;
    });
    const [a, b] = alturas;
    filas.push({
      clave: "altura",
      vehiculo: par[0]!,
      concepto: `Altura del contacto (${par[0]} y ${par[1]})`,
      declarada: a ? `${par[0]}: ${a.min}–${a.max} cm` : "—",
      evidencia: b ? `${par[1]}: ${b.min}–${b.max} cm` : "—",
      estado: !a || !b ? "sin_dato" : a.min <= b.max && b.min <= a.max ? "coincide" : "no_coincide",
      fuente:
        "La altura de los daños que observó el perito en las caras que se tocan según la versión declarada",
      indicador: true,
    });
  }
  return filas;
}

export interface SugerenciaDeclarada {
  texto: string;
  en_contra: number;
  a_favor: number;
}

/** La regla, dicha al perito: cuenta los indicadores con dato (zona, dirección, altura, posición). */
export const REGLA_SUGERENCIA_DECLARADA =
  "Croquis cuenta los indicadores con dato: si dos o más no coinciden y ninguno coincide más que ellos, sugiere que los daños y la evidencia no son compatibles con la versión declarada; si dos o más coinciden y ninguno no coincide, que sí lo son; si no, que no alcanzan para decirlo. El perito confirma o descarta.";

/** La sugerencia (solo si el perito la pide). Habla de compatibilidad con la evidencia, no de personas. */
export function sugerirDeclarada(filas: readonly FilaDeclarada[]): SugerenciaDeclarada {
  const ind = filas.filter((f) => f.indicador && f.estado !== "sin_dato");
  const en_contra = ind.filter((f) => f.estado === "no_coincide").length;
  const a_favor = ind.filter((f) => f.estado === "coincide").length;
  const texto =
    en_contra >= 2 && en_contra >= a_favor
      ? `Los daños y la evidencia no son compatibles con la versión declarada en ${en_contra} de ${ind.length} indicadores.`
      : a_favor >= 2 && en_contra === 0
        ? `Los daños y la evidencia son compatibles con la versión declarada en los ${a_favor} indicadores con dato.`
        : "Los indicadores no alcanzan para decir si la versión declarada es compatible con la evidencia.";
  return { texto, en_contra, a_favor };
}
