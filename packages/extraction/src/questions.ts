/**
 * Preguntas al usuario (port de `extraction/croquis_extraction/questions.py`; PLAN §5.1, paso 6):
 * lo que más cambia el resultado, máximo 3 por ronda, sin culpar a nadie.
 *
 * 1. Contradicciones: banderas de consistencia y avisos del solver, como preguntas neutrales.
 * 2. Sensibilidad: la escena se reconstruye variando un campo incierto a la vez (muestras
 *    estratificadas con la misma semilla y el mismo generador que Python) y se pregunta lo que más
 *    pesa en la varianza de la velocidad al impacto y la posición final.
 * 3. Ambigüedad: las expresiones ambiguas del glosario traen su pregunta.
 *
 * Usa el solver TS. Las banderas de consistencia que muestrean (daño, reposo, velocidad contra
 * evidencia) llegan con la inversión y Monte Carlo en F9; mientras, esta ronda equivale a la de
 * Python con `sampled=False` y la paridad se prueba contra ella.
 */
import { VEHICLE_CLASSES } from "@croquis/scene-schema";
import {
  type Aviso,
  checkConsistencyBasic,
  pvariance,
  PyRandom,
  pyFixed,
  pyRound,
  pySum,
  reconstruct,
} from "@croquis/solver-ts";
import { findTerms } from "./glossary";

type Json = Record<string, unknown>;

export const MAX_QUESTIONS = 3;
export const MIN_SHARE = 0.1;
/** km/h en la velocidad al impacto o m en la posición final. */
export const MIN_EFFECT = 2.0;
export const SAMPLES = 6;
const SOLVER_DT = 0.1;
const STATED = new Set(["relato", "usuario"]);
export const CLASS_LABEL: Readonly<Record<string, string>> = {
  sedan_compacto: "el auto",
  sedan_mediano: "el auto",
  hatchback: "el auto",
  suv_compacta: "la camioneta",
  suv_grande: "la camioneta",
  pickup: "la camioneta",
  van: "la van",
  microbus_combi: "la combi",
  autobus: "el autobús",
  camion_unitario: "el camión",
  tractocamion: "el tráiler",
  motocicleta: "la moto",
  bicicleta: "la bicicleta",
  scooter: "el scooter",
};
const SPEED_RANGE_BY_ROAD: Readonly<Record<string, readonly [number, number]>> = {
  autopista: [60.0, 120.0],
  carretera_dos_carriles: [50.0, 100.0],
  glorieta: [10.0, 40.0],
  estacionamiento: [3.0, 20.0],
  retorno: [10.0, 40.0],
};
const SPEED_RANGE_DEFAULT = [20.0, 70.0] as const;
export const NO_SE = "no sé";
export const MANIOBRA_OPCIONES = [
  "cambió de carril a la izquierda",
  "cambió de carril a la derecha",
  "dio vuelta a la izquierda",
  "dio vuelta a la derecha",
  "siguió recto",
  NO_SE,
] as const;
const MANIOBRA_VALOR: Readonly<Record<string, string>> = {
  "cambió de carril a la izquierda": "cambio_carril_izquierda",
  "cambió de carril a la derecha": "cambio_carril_derecha",
  "dio vuelta a la izquierda": "vuelta_izquierda",
  "dio vuelta a la derecha": "vuelta_derecha",
  "siguió recto": "recto",
};
const USER_CONFIDENCE = 0.8;

export interface Pregunta {
  id: string;
  texto: string;
  /** "contradiccion" | "sensibilidad" | "ambiguedad" */
  motivo: string;
  /** Ruta en la EscenaSpec, p. ej. "vehiculos.1.velocidad_previa". */
  campo: string;
  opciones: readonly string[];
  /** Participación en la varianza (solo sensibilidad). */
  reduccion: number | null;
}

function pregunta(
  id: string,
  texto: string,
  motivo: string,
  campo: string,
  opciones: readonly string[] = [],
  reduccion: number | null = null,
): Pregunta {
  return { id, texto, motivo, campo, opciones, reduccion };
}

export function preguntaToDict(p: Pregunta): Json {
  const d: Json = { id: p.id, texto: p.texto, motivo: p.motivo, campo: p.campo };
  if (p.opciones.length > 0) d.opciones = [...p.opciones];
  if (p.reduccion !== null) d.reduccion = pyRound(p.reduccion, 3);
  return d;
}

function str(x: unknown, dflt = ""): string {
  if (x === undefined || x === null) return dflt;
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  return JSON.stringify(x);
}

function stated(campo: unknown): boolean {
  return campo !== null && campo !== undefined && STATED.has(str((campo as Json).fuente));
}

/** `str.capitalize()` de Python: primera letra en mayúscula y el resto en minúsculas. */
function capitalize(s: string): string {
  const chars = [...s];
  if (chars.length === 0) return s;
  return chars[0]!.toUpperCase() + chars.slice(1).join("").toLowerCase();
}

const FIRST_PERSON = /(?<![a-záéíóúñ])(?:yo|mi|me|iba|venía|venia|manejaba)(?![a-záéíóúñ])/iu;

/** Vehículo de quien narra: la nota "narrador" o el conductor con evidencia en primera persona. */
function narratorVehicle(spec: Json): string | null {
  const drivers = ((spec.personas ?? []) as Json[]).filter((p) => {
    const rol = (p.rol ?? {}) as Json;
    return rol.valor === "conductor" && p.vehiculo_id;
  });
  for (const p of drivers) if ((p.rol as Json).nota === "narrador") return str(p.vehiculo_id);
  for (const p of drivers) {
    const ev = ((p.rol as Json).evidencia ?? []) as Json[];
    if (ev.some((e) => FIRST_PERSON.test(str(e.texto)))) return str(p.vehiculo_id);
  }
  return null;
}

/** Cómo nombrar un vehículo en una pregunta, sin juicios: "tu vehículo", "la camioneta (B)". */
function ref(spec: Json, vid: string): string {
  if (vid === narratorVehicle(spec)) return "tu vehículo";
  const v = (spec.vehiculos as Json[]).find((x) => x.id === vid);
  if (!v) return "el otro vehículo";
  let label = CLASS_LABEL[str((v.clase as Json).valor)] ?? "el vehículo";
  if (!stated(v.clase)) label = "el vehículo";
  return `${label} (${str(v.rol)})`;
}

function vindex(spec: Json, vid: string): number {
  return (spec.vehiculos as Json[]).findIndex((v) => v.id === vid);
}

// --- Contradicciones ----------------------------------------------------------------------------

const CONSISTENCY_TOPIC: Readonly<Record<string, readonly [string, string]>> = {
  detenido_con_velocidad: ["velocidad", "vehiculos.{i}.velocidad_previa"],
  marcas_vs_velocidad: ["velocidad", "vehiculos.{i}.velocidad_previa"],
  proyeccion_vs_velocidad: ["proyeccion", "evidencias.distancia_proyeccion"],
  dano_vs_velocidad: ["velocidad", "vehiculos.{i}.velocidad_previa"],
  reposo_inalcanzable: ["reposo", "vehiculos.{i}.posicion_final"],
  velocidad_vs_evidencia: ["velocidad", "vehiculos.{i}.velocidad_previa"],
};

/** Lo declarado que no cabe en ninguna solución física, como pregunta, y la evidencia cubierta. */
export function fromConsistency(spec: Json): [Pregunta[], Set<string>] {
  const out: Pregunta[] = [];
  const covered = new Set<string>();
  for (const f of checkConsistencyBasic(spec)) {
    const [kind, campo] = CONSISTENCY_TOPIC[f.codigo]!;
    const vid = str(f.datos.vehiculo);
    const i = Math.max(0, vindex(spec, vid));
    out.push(
      pregunta(`${kind}:${vid}`, f.mensaje, "contradiccion", campo.replace("{i}", String(i))),
    );
    for (const e of (f.datos.evidencia ?? []) as string[]) covered.add(topic(e));
  }
  return [out, covered];
}

export function fromAvisos(spec: Json, avisos: readonly Aviso[]): Pregunta[] {
  const out: Pregunta[] = [];
  for (const a of avisos) {
    const d = a.datos;
    const vid = d.vehiculo === undefined || d.vehiculo === null ? "" : str(d.vehiculo);
    if (a.codigo === "frenado_detiene_antes" && vid) {
      out.push(
        pregunta(
          `frenado_distancia:${vid}`,
          `Con unos ${pyFixed(Number(d.v_kmh), 0)} km/h y ${pyFixed(Number(d.frenado_m), 0)} m de frenado, ` +
            `${ref(spec, vid)} se habría detenido antes del golpe. ¿Recuerdas desde dónde ` +
            "empezó a frenar, o la velocidad?",
          "contradiccion",
          `vehiculos.${vindex(spec, vid)}.frenado.distancia_antes_impacto`,
        ),
      );
    } else if (a.codigo === "proyeccion_vs_velocidad") {
      out.push(
        pregunta(
          `proyeccion:${str(d.persona)}`,
          `La persona quedó a unos ${pyFixed(Number(d.distancia_m), 0)} m, lo que suele ` +
            `corresponder a ${pyFixed(Number(d.v_min_kmh), 0)}–${pyFixed(Number(d.v_max_kmh), 0)} km/h, y la ` +
            "velocidad indicada da " +
            `${pyFixed(Number(d.v_kmh), 0)} km/h. ¿Puedes confirmar la distancia o la velocidad?`,
          "contradiccion",
          "evidencias.distancia_proyeccion",
        ),
      );
    } else if (a.codigo === "zonas_no_se_tocan") {
      out.push(
        pregunta(
          "zonas_impacto",
          "Con las zonas de golpe indicadas los vehículos no llegan a tocarse. ¿En qué " +
            "parte de cada vehículo fue el golpe?",
          "contradiccion",
          "eventos.0.zonas_impacto",
          ["frente", "atrás", "lado izquierdo", "lado derecho"],
        ),
      );
    } else if (a.codigo === "desvio_lateral" && vid) {
      const lat = Number(d.lateral_m);
      const lado = lat > 0 ? "izquierda" : "derecha";
      const metros = `${pyFixed(Math.abs(lat), 0)} m hacia la ${lado}`;
      const texto =
        vid === narratorVehicle(spec)
          ? `Para llegar al punto del golpe tuviste que moverte unos ${metros}. ¿Cambiaste ` +
            "de carril o te abriste?"
          : `Para llegar al punto del golpe, ${ref(spec, vid)} tuvo que moverse unos ` +
            `${metros}. ¿Cambió de carril o se abrió?`;
      out.push(
        pregunta(
          `maniobra:${vid}`,
          texto,
          "contradiccion",
          `vehiculos.${vindex(spec, vid)}.maniobra`,
          MANIOBRA_OPCIONES,
        ),
      );
    } else if (a.codigo === "volcadura_sin_velocidad" && vid) {
      out.push(
        pregunta(
          `volcadura:${vid}`,
          "Para que el vehículo se volcara hacía falta que fuera de lado hacia la " +
            "orilla. ¿Iba derrapando, o pegó con algo antes de voltearse?",
          "contradiccion",
          `vehiculos.${vindex(spec, vid)}.maniobra`,
          ["iba derrapando", "pegó con algo", "no sé"],
        ),
      );
    } else if (a.codigo === "volcadura_no_mencionada" && vid) {
      out.push(
        pregunta(
          `volcadura:${vid}`,
          `¿${capitalize(ref(spec, vid))} llegó a volcarse o a levantarse de un lado?`,
          "contradiccion",
          "eventos",
          ["sí", "no", "no sé"],
        ),
      );
    } else if (a.codigo === "frenado_sin_distancia" && vid) {
      out.push(
        pregunta(
          `frenado_distancia:${vid}`,
          (vid === narratorVehicle(spec)
            ? "¿Desde dónde empezaste a frenar?"
            : `¿Desde dónde empezó a frenar ${ref(spec, vid)}?`) +
            " Un aproximado en metros o en largos de auto basta.",
          "contradiccion",
          `vehiculos.${vindex(spec, vid)}.frenado.distancia_antes_impacto`,
        ),
      );
    }
  }
  return out;
}

// --- Sensibilidad -------------------------------------------------------------------------------

function massRange(clase: string): readonly [number, number] | null {
  const info = (VEHICLE_CLASSES as unknown as Record<string, Json>)[clase];
  const rng = info?.masa_kg as number[] | undefined;
  return Array.isArray(rng) && rng.length === 2 ? [Number(rng[0]), Number(rng[1])] : null;
}

interface Candidate {
  pregunta: Pregunta;
  values: readonly (number | string | boolean)[];
  /** Dónde escribir el valor muestreado en la spec. */
  path: readonly (string | number)[];
  unidad: string | null;
}

function stratified(rng: PyRandom, lo: number, hi: number, n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(pyRound(lo + ((k + rng.random()) / n) * (hi - lo), 2));
  return out;
}

/** Campos inciertos que el solver usa, con sus muestras. */
export function candidates(spec: Json, rng: PyRandom, n = SAMPLES): Candidate[] {
  const out: Candidate[] = [];
  const lugar = spec.lugar as Json;
  const tipoVia = str((lugar.tipo_via as Json).valor);
  if (!stated(lugar.estado_superficie)) {
    out.push({
      pregunta: pregunta(
        "estado_superficie",
        "¿El piso estaba seco o mojado?",
        "sensibilidad",
        "lugar.estado_superficie",
        ["seco", "mojado", "encharcado"],
      ),
      values: ["seco", "mojado", "encharcado"],
      path: ["lugar", "estado_superficie"],
      unidad: null,
    });
  }
  const narrator = narratorVehicle(spec);
  (spec.vehiculos as Json[]).forEach((v, i) => {
    const vid = str(v.id);
    const man = str((v.maniobra as Json).valor);
    if (man === "detenido" || man === "estacionado") return;
    const r = ref(spec, vid);
    if (!stated(v.velocidad_previa)) {
      const [lo, hi] = SPEED_RANGE_BY_ROAD[tipoVia] ?? SPEED_RANGE_DEFAULT;
      const texto =
        vid === narrator
          ? "¿A qué velocidad aproximada ibas antes del golpe?"
          : `¿A qué velocidad crees que iba ${r}?`;
      out.push({
        pregunta: pregunta(
          `velocidad:${vid}`,
          texto,
          "sensibilidad",
          `vehiculos.${i}.velocidad_previa`,
        ),
        values: stratified(rng, lo, hi, n),
        path: ["vehiculos", i, "velocidad_previa"],
        unidad: "km/h",
      });
    }
    const frenado = ((v.frenado ?? {}) as Json).aplico;
    if (!stated(frenado)) {
      const texto =
        vid === narrator
          ? "¿Alcanzaste a frenar antes del golpe?"
          : `¿Viste si ${r} frenó antes del golpe?`;
      out.push({
        pregunta: pregunta(
          `frenado:${vid}`,
          texto,
          "sensibilidad",
          `vehiculos.${i}.frenado.aplico`,
          ["sí", "no", "no sé"],
        ),
        values: [true, false],
        path: ["vehiculos", i, "frenado", "aplico"],
        unidad: null,
      });
    }
    const clase = str((v.clase as Json).valor);
    const mass = massRange(clase);
    if (!stated(v.clase) && mass && !v.masa) {
      out.push({
        pregunta: pregunta(
          `clase:${vid}`,
          `¿Qué tipo o modelo de vehículo era ${r}?`,
          "sensibilidad",
          `vehiculos.${i}.clase`,
        ),
        values: stratified(rng, mass[0], mass[1], n),
        path: ["vehiculos", i, "masa"],
        unidad: "kg",
      });
    }
  });
  return out;
}

function setPath(
  spec: Json,
  path: readonly (string | number)[],
  value: unknown,
  unidad: string | null,
): void {
  let node: Record<string | number, unknown> = spec;
  for (const key of path.slice(0, -1)) {
    if (typeof key === "string" && !(key in node)) node[key] = {};
    node = node[key] as Record<string | number, unknown>;
  }
  const campo: Json = { valor: value, fuente: "supuesto", confianza: 0.3 };
  if (unidad) campo.unidad = unidad;
  node[path[path.length - 1]!] = campo;
}

function outputs(spec: Json): number[] | null {
  try {
    const r = reconstruct(spec, { dt: SOLVER_DT });
    return r.vehiculos.flatMap((v) => [v.vImpactKmh, v.restPose[0], v.restPose[1]]);
  } catch {
    return null;
  }
}

/** (campo, participación en la varianza, efecto absoluto), de mayor a menor participación. */
export function sensitivity(spec: Json, seed: number, n = SAMPLES): [Candidate, number, number][] {
  const rng = new PyRandom(seed);
  const cands = candidates(spec, rng, n);
  const perCand: number[][][] = cands.map((c) => {
    const runs: number[][] = [];
    for (const value of c.values) {
      const s = structuredClone(spec);
      setPath(s, c.path, value, c.unidad);
      const y = outputs(s);
      if (y !== null) runs.push(y);
    }
    return runs;
  });
  const kOut = Math.max(0, ...perCand.filter((r) => r.length > 0).map((r) => r[0]!.length));
  const variances = perCand.map((runs) => {
    const row: number[] = [];
    for (let k = 0; k < kOut; k++) {
      const col = runs.filter((r) => r.length > k).map((r) => r[k]!);
      row.push(col.length >= 2 ? pvariance(col) : 0.0);
    }
    return row;
  });
  let shares = cands.map(() => 0.0);
  let used = 0;
  for (let k = 0; k < kOut; k++) {
    const total = pySum(variances.map((row) => row[k]!));
    if (total <= 1e-9) continue;
    used++;
    variances.forEach((row, i) => {
      shares[i] = shares[i]! + row[k]! / total;
    });
  }
  if (used) shares = shares.map((s) => s / used);
  const effects = variances.map((row) => Math.sqrt(row.length > 0 ? Math.max(...row) : 0.0));
  const rows = cands.map((c, i) => [c, shares[i]!, effects[i]!] as [Candidate, number, number]);
  return rows.sort(
    (a, b) =>
      b[1] - a[1] ||
      (a[0].pregunta.id < b[0].pregunta.id ? -1 : a[0].pregunta.id > b[0].pregunta.id ? 1 : 0),
  );
}

// --- Ronda de preguntas -------------------------------------------------------------------------

/** Tema de una pregunta: dos preguntas del mismo tema no van en la misma ronda. */
export function topic(qid: string): string {
  const i = qid.indexOf(":");
  const kind = i >= 0 ? qid.slice(0, i) : qid;
  const target = i >= 0 ? qid.slice(i + 1) : "";
  const base = kind.endsWith("_distancia") ? kind.slice(0, -"_distancia".length) : kind;
  return `${base}:${target}`;
}

export function fromGlossary(text: string): Pregunta[] {
  const out: Pregunta[] = [];
  const seen = new Set<string>();
  for (const t of findTerms(text)) {
    if (t.ambiguo && t.pregunta && !seen.has(t.id)) {
      seen.add(t.id);
      const campo = t.efectos.length > 0 ? String(t.efectos[0]!.campo) : "relato";
      out.push(pregunta(`glosario:${t.id}`, t.pregunta, "ambiguedad", campo));
    }
  }
  return out;
}

export interface AskOptions {
  seed?: number;
  samples?: number;
  maxQuestions?: number;
  answered?: ReadonlySet<string>;
}

/** La ronda de preguntas para `spec` (y su relato redactado, si se tiene). */
export function ask(spec: Json, text: string | null = null, opts: AskOptions = {}): Pregunta[] {
  const seed = opts.seed ?? Math.trunc(Number((spec.meta as Json).semilla));
  const samples = opts.samples ?? SAMPLES;
  const maxQuestions = opts.maxQuestions ?? MAX_QUESTIONS;
  const base = reconstruct(spec, { dt: SOLVER_DT });
  const chosen: Pregunta[] = [];
  const seen = new Set([...(opts.answered ?? [])].map(topic));
  const take = (p: Pregunta): void => {
    const key = topic(p.id);
    if (!seen.has(key) && chosen.length < maxQuestions) {
      seen.add(key);
      chosen.push(p);
    }
  };
  const [consistency, covered] = fromConsistency(spec);
  for (const p of consistency) take(p);
  for (const c of covered) seen.add(c);
  for (const p of fromAvisos(spec, base.avisos)) take(p);
  for (const [cand, share, effect] of sensitivity(spec, seed, samples)) {
    if (share >= MIN_SHARE && effect >= MIN_EFFECT) {
      const q = cand.pregunta;
      take(pregunta(q.id, q.texto, q.motivo, q.campo, q.opciones, share));
    }
  }
  if (text) for (const p of fromGlossary(text)) take(p);
  return chosen;
}

// --- Respuestas ---------------------------------------------------------------------------------

function user(valor: unknown, unidad: string | null = null): Json {
  const campo: Json = { valor, fuente: "usuario", confianza: USER_CONFIDENCE };
  if (unidad) campo.unidad = unidad;
  return campo;
}

function number(raw: unknown): number | null {
  if (typeof raw === "boolean") return null;
  if (typeof raw === "number") return raw;
  const m = /\d+(?:[.,]\d+)?/.exec(str(raw, "None"));
  return m ? parseFloat(m[0].replace(",", ".")) : null;
}

function yesNo(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  return (
    ({ sí: true, si: true, no: false } as Record<string, boolean>)[str(raw).trim().toLowerCase()] ??
    null
  );
}

/** La spec con las respuestas (`fuente: usuario`) y los ids que cambiaron algo. */
export function applyAnswers(spec: Json, respuestas: Record<string, unknown>): [Json, string[]] {
  const out = structuredClone(spec);
  const applied: string[] = [];
  const ids = new Map((out.vehiculos as Json[]).map((v) => [str(v.id), v]));
  for (const [qid, raw] of Object.entries(respuestas)) {
    if (
      raw === null ||
      raw === undefined ||
      ["", NO_SE, "no se"].includes(str(raw).trim().toLowerCase())
    )
      continue;
    const i = qid.indexOf(":");
    const kind = i >= 0 ? qid.slice(0, i) : qid;
    const target = i >= 0 ? qid.slice(i + 1) : "";
    const v = ids.get(target);
    if (kind === "velocidad" && v) {
      const n = number(raw);
      if (n !== null && n >= 0 && n <= 300) {
        v.velocidad_previa = user(n, "km/h");
        applied.push(qid);
      }
    } else if (kind === "frenado" && v) {
      const yn = yesNo(raw);
      if (yn !== null) {
        const fr = (v.frenado ??= {}) as Json;
        fr.aplico = user(yn);
        applied.push(qid);
      }
    } else if (kind === "frenado_distancia" && v) {
      const n = number(raw);
      if (n !== null && n > 0 && n <= 200) {
        const fr = (v.frenado ??= {}) as Json;
        fr.aplico = user(true);
        fr.distancia_antes_impacto = user(n, "m");
        applied.push(qid);
      }
    } else if (kind === "clase" && v && typeof raw === "string" && raw in CLASS_LABEL) {
      v.clase = user(raw);
      delete v.masa;
      applied.push(qid);
    } else if (kind === "maniobra" && v && typeof raw === "string" && raw in MANIOBRA_VALOR) {
      v.maniobra = user(MANIOBRA_VALOR[raw]);
      applied.push(qid);
    } else if (
      kind === "estado_superficie" &&
      ["seco", "mojado", "encharcado"].includes(str(raw))
    ) {
      (out.lugar as Json).estado_superficie = user(raw);
      applied.push(qid);
    } else if (kind === "proyeccion") {
      const n = number(raw);
      const ev = ((out.evidencias ?? []) as Json[]).find((e) => e.tipo === "distancia_proyeccion");
      if (n !== null && n > 0 && n <= 100 && ev) {
        ev.longitud = user(n, "m");
        applied.push(qid);
      }
    }
  }
  return [out, applied];
}
