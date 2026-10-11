/**
 * Validación semántica de una EscenaSpec (PLAN §4.2): lo que el JSON Schema no puede expresar.
 *
 * Referencia de paridad: `python/croquis_scene_schema/check.py`. Ambos producen la misma lista de
 * problemas (`codigo` + `ruta`) para los casos de `fixtures/semantic/cases.json`. Los mensajes
 * están en lenguaje llano, nunca asignan culpa (PLAN §10).
 */
import type { EscenaSpec, Pose2D } from "./generated/escena.zod";
import { SCHEMA_VERSION } from "./generated/escena.zod";

export type Severidad = "error" | "advertencia";

export interface Problema {
  codigo: string;
  severidad: Severidad;
  /** JSON Pointer al campo afectado. */
  ruta: string;
  mensaje: string;
}

export interface RangoClase {
  masa_kg: [number, number];
  largo_m: [number, number];
  ancho_m: [number, number];
  alto_m: [number, number];
  distancia_entre_ejes_m: [number, number];
  velocidad_max_kmh: number;
  tipico: { masa_kg: number; largo_m: number; ancho_m: number; alto_m: number; distancia_entre_ejes_m: number };
}

export type TablaClases = Record<string, RangoClase>;

export interface CheckOptions {
  /** Rangos por clase de vehículo; si falta una clase, se omiten sus comprobaciones. */
  clases?: TablaClases;
}

/** Umbral por debajo del cual una confianza en un campo clave genera una advertencia (pregunta candidata). */
export const CONFIANZA_BAJA = 0.3;

const MASA_A_KG: Record<string, number> = { kg: 1, t: 1000, lb: 0.45359237 };
const LONGITUD_A_M: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001, km: 1000 };
const VELOCIDAD_A_KMH: Record<string, number> = { "km/h": 1, "m/s": 3.6 };

export function masaKg(c: { valor: number; unidad: string }): number {
  return c.valor * (MASA_A_KG[c.unidad] ?? 1);
}
export function longitudM(c: { valor: number; unidad: string }): number {
  return c.valor * (LONGITUD_A_M[c.unidad] ?? 1);
}
export function velocidadKmh(c: { valor: number; unidad: string }): number {
  return c.valor * (VELOCIDAD_A_KMH[c.unidad] ?? 1);
}

type Vec = [number, number];

function corners(pose: Pose2D, largo: number, ancho: number): Vec[] {
  const th = (pose.rumbo_deg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const hl = largo / 2;
  const hw = ancho / 2;
  const local: Vec[] = [
    [hl, hw],
    [hl, -hw],
    [-hl, -hw],
    [-hl, hw],
  ];
  return local.map(([x, y]) => [pose.x + x * c - y * s, pose.y + x * s + y * c]);
}

/** Separating Axis Theorem para dos rectángulos orientados. Devuelve verdadero si se traslapan. */
export function boxesOverlap(a: Vec[], b: Vec[]): boolean {
  const axes: Vec[] = [];
  for (const poly of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const p = poly[i];
      const q = poly[i + 1];
      if (!p || !q) continue;
      const edge: Vec = [q[0] - p[0], q[1] - p[1]];
      axes.push([-edge[1], edge[0]]);
    }
  }
  for (const [ax, ay] of axes) {
    const proj = (poly: Vec[]): [number, number] => {
      let min = Infinity;
      let max = -Infinity;
      for (const [x, y] of poly) {
        const d = x * ax + y * ay;
        if (d < min) min = d;
        if (d > max) max = d;
      }
      return [min, max];
    };
    const [amin, amax] = proj(a);
    const [bmin, bmax] = proj(b);
    if (amax <= bmin || bmax <= amin) return false;
  }
  return true;
}

interface Campo {
  fuente?: string;
  confianza?: number;
  evidencia?: { inicio: number; fin: number; texto: string }[];
  valor?: unknown;
  rango?: [number, number];
}

function isCampo(o: unknown): o is Campo & Record<string, unknown> {
  return !!o && typeof o === "object" && !Array.isArray(o) && "fuente" in o;
}

export function checkEscena(spec: EscenaSpec, options: CheckOptions = {}): Problema[] {
  const problemas: Problema[] = [];
  const err = (codigo: string, ruta: string, mensaje: string): void => {
    problemas.push({ codigo, severidad: "error", ruta, mensaje });
  };
  const warn = (codigo: string, ruta: string, mensaje: string): void => {
    problemas.push({ codigo, severidad: "advertencia", ruta, mensaje });
  };
  const relato = spec.meta.relato;

  if (spec.meta.version_esquema !== SCHEMA_VERSION) {
    warn("W002", "/meta/version_esquema", `La escena usa la versión ${spec.meta.version_esquema}; la vigente es ${SCHEMA_VERSION}. Conviene migrarla.`);
  }

  // --- Ids y referencias -------------------------------------------------------------------
  const kinds = new Map<string, string>();
  const seen = new Map<string, string>();
  const register = (id: string, kind: string, ruta: string): void => {
    const prev = seen.get(id);
    if (prev !== undefined) err("E001", ruta, `El id “${id}” se repite (ya se usó en ${prev}).`);
    else {
      seen.set(id, ruta);
      kinds.set(id, kind);
    }
  };
  spec.vehiculos.forEach((v, i) => register(v.id, "vehiculo", `/vehiculos/${i}/id`));
  spec.personas.forEach((p, i) => register(p.id, "persona", `/personas/${i}/id`));
  (spec.entorno.objetos ?? []).forEach((o, i) => register(o.id, "objeto", `/entorno/objetos/${i}/id`));
  (spec.lugar.dispositivos ?? []).forEach((d, i) => register(d.id, "dispositivo", `/lugar/dispositivos/${i}/id`));
  spec.eventos.forEach((e, i) => register(e.id, "evento", `/eventos/${i}/id`));
  spec.evidencias.forEach((e, i) => register(e.id, "evidencia", `/evidencias/${i}/id`));

  const expectRef = (id: string | undefined, allowed: string[], ruta: string): void => {
    if (id === undefined) return;
    const k = kinds.get(id);
    if (!k) err("E002", ruta, `“${id}” no corresponde a ningún elemento de la escena.`);
    else if (!allowed.includes(k)) err("E002", ruta, `“${id}” es un ${k}; aquí se esperaba ${allowed.join(" o ")}.`);
  };
  spec.vehiculos.forEach((v, i) => (v.ocupantes ?? []).forEach((id, j) => expectRef(id, ["persona"], `/vehiculos/${i}/ocupantes/${j}`)));
  spec.personas.forEach((p, i) => expectRef(p.vehiculo_id, ["vehiculo"], `/personas/${i}/vehiculo_id`));
  (spec.lugar.dispositivos ?? []).forEach((d, i) => (d.aplica_a ?? []).forEach((id, j) => expectRef(id, ["vehiculo"], `/lugar/dispositivos/${i}/aplica_a/${j}`)));
  spec.eventos.forEach((e, i) => {
    e.actores.forEach((id, j) => expectRef(id, ["vehiculo", "persona", "objeto"], `/eventos/${i}/actores/${j}`));
    (e.zonas_impacto ?? []).forEach((z, j) => {
      expectRef(z.vehiculo_id, ["vehiculo"], `/eventos/${i}/zonas_impacto/${j}/vehiculo_id`);
      if (kinds.get(z.vehiculo_id) === "vehiculo" && !e.actores.includes(z.vehiculo_id)) {
        err("E015", `/eventos/${i}/zonas_impacto/${j}/vehiculo_id`, `El vehículo “${z.vehiculo_id}” tiene zona de impacto pero no está entre los actores del evento.`);
      }
    });
  });
  spec.danos_declarados.forEach((d, i) => expectRef(d.vehiculo_id, ["vehiculo"], `/danos_declarados/${i}/vehiculo_id`));
  spec.evidencias.forEach((e, i) => {
    expectRef(e.vehiculo_id, ["vehiculo"], `/evidencias/${i}/vehiculo_id`);
    expectRef(e.persona_id, ["persona"], `/evidencias/${i}/persona_id`);
  });

  // --- Procedencia: evidencia y rangos ------------------------------------------------------
  const walk = (node: unknown, ruta: string): void => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${ruta}/${i}`));
      return;
    }
    if (!node || typeof node !== "object") return;
    if (isCampo(node)) {
      const ev = node.evidencia ?? [];
      if (node.fuente === "relato" && ev.length === 0) {
        err("E003", ruta, "El dato se atribuye al relato pero no cita ningún fragmento.");
      }
      ev.forEach((e, i) => {
        if (e.fin <= e.inicio) err("E004", `${ruta}/evidencia/${i}`, "El fragmento citado tiene fin antes del inicio.");
        else if (relato !== undefined && relato.slice(e.inicio, e.fin) !== e.texto) {
          err("E004", `${ruta}/evidencia/${i}`, "El fragmento citado no coincide con el relato en esas posiciones.");
        }
      });
      if (node.rango && typeof node.valor === "number") {
        const [lo, hi] = node.rango;
        if (lo > hi) err("E005", `${ruta}/rango`, "El rango está invertido (mínimo mayor que máximo).");
        else if (node.valor < lo || node.valor > hi) err("E005", `${ruta}/valor`, `El valor ${node.valor} queda fuera de su propio rango [${lo}, ${hi}].`);
      }
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${ruta}/${k}`);
  };
  walk(spec, "");

  // --- Vehículos: clase, dimensiones, velocidad, superposición ----------------------------
  const boxes: { i: number; corners: Vec[] }[] = [];
  spec.vehiculos.forEach((v, i) => {
    const base = `/vehiculos/${i}`;
    const clase = options.clases?.[v.clase.valor];
    const dims: { key: "largo" | "ancho" | "alto" | "distancia_entre_ejes"; rango: keyof RangoClase }[] = [
      { key: "largo", rango: "largo_m" },
      { key: "ancho", rango: "ancho_m" },
      { key: "alto", rango: "alto_m" },
      { key: "distancia_entre_ejes", rango: "distancia_entre_ejes_m" },
    ];
    if (clase) {
      if (v.masa) {
        const m = masaKg(v.masa);
        const [lo, hi] = clase.masa_kg;
        if (m < lo || m > hi) err("E006", `${base}/masa/valor`, `Una ${v.clase.valor} suele pesar entre ${lo} y ${hi} kg; aquí dice ${Math.round(m)} kg.`);
      }
      for (const d of dims) {
        const campo = v[d.key];
        if (!campo) continue;
        const x = longitudM(campo);
        const [lo, hi] = clase[d.rango] as [number, number];
        if (x < lo || x > hi) err("E007", `${base}/${d.key}/valor`, `El ${d.key.replaceAll("_", " ")} de una ${v.clase.valor} suele estar entre ${lo} y ${hi} m; aquí dice ${x} m.`);
      }
      const vel = velocidadKmh(v.velocidad_previa);
      if (vel > clase.velocidad_max_kmh) err("E008", `${base}/velocidad_previa/valor`, `Una ${v.clase.valor} difícilmente supera ${clase.velocidad_max_kmh} km/h; aquí dice ${Math.round(vel)} km/h.`);
    }
    for (const key of ["velocidad_previa", "maniobra", "clase"] as const) {
      if (v[key].confianza < CONFIANZA_BAJA) {
        warn("W001", `${base}/${key}/confianza`, `Hay poca certeza sobre ${key.replaceAll("_", " ")} del vehículo ${v.rol}; conviene preguntar.`);
      }
    }
    const largo = v.largo ? longitudM(v.largo) : clase?.tipico.largo_m;
    const ancho = v.ancho ? longitudM(v.ancho) : clase?.tipico.ancho_m;
    if (largo !== undefined && ancho !== undefined) boxes.push({ i, corners: corners(v.posicion_inicial, largo, ancho) });
  });
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a];
      const B = boxes[b];
      if (A && B && boxesOverlap(A.corners, B.corners)) {
        const ra = spec.vehiculos[A.i]?.rol ?? "?";
        const rb = spec.vehiculos[B.i]?.rol ?? "?";
        err("E009", `/vehiculos/${B.i}/posicion_inicial`, `Los vehículos ${ra} y ${rb} empiezan uno encima del otro; ajusta sus posiciones iniciales en el croquis.`);
      }
    }
  }
  if (spec.lugar.tipo_via.confianza < CONFIANZA_BAJA) {
    warn("W001", "/lugar/tipo_via/confianza", "Hay poca certeza sobre el tipo de vía; conviene preguntar.");
  }
  if (spec.vehiculos.length === 0) warn("W003", "/vehiculos", "La escena no tiene vehículos; el solver no tendrá nada que reconstruir.");

  // --- Personas y ocupantes -----------------------------------------------------------------
  const ocupadoPor = new Map<string, string>();
  spec.vehiculos.forEach((v) => (v.ocupantes ?? []).forEach((pid) => ocupadoPor.set(pid, v.id)));
  spec.personas.forEach((p, i) => {
    const base = `/personas/${i}`;
    const rol = p.rol.valor;
    if (rol === "peaton" && p.vehiculo_id !== undefined) err("E011", `${base}/vehiculo_id`, "Un peatón no va a bordo de un vehículo.");
    if (rol !== "peaton" && p.vehiculo_id === undefined) err("E010", `${base}/vehiculo_id`, `Un ${rol} debe ir asociado a un vehículo.`);
    const listado = ocupadoPor.get(p.id);
    if (p.vehiculo_id !== undefined && kinds.get(p.vehiculo_id) === "vehiculo" && listado !== p.vehiculo_id) {
      err("E012", `${base}/vehiculo_id`, `La persona “${p.id}” dice ir en “${p.vehiculo_id}” pero ese vehículo no la lista entre sus ocupantes.`);
    }
  });
  spec.vehiculos.forEach((v, i) =>
    (v.ocupantes ?? []).forEach((pid, j) => {
      const p = spec.personas.find((x) => x.id === pid);
      if (p && p.vehiculo_id !== v.id) err("E012", `/vehiculos/${i}/ocupantes/${j}`, `“${pid}” aparece como ocupante de “${v.id}” pero la persona no lo indica.`);
    }),
  );

  // --- Eventos ------------------------------------------------------------------------------
  const ordenes = new Map<number, number>();
  spec.eventos.forEach((e, i) => {
    const prev = ordenes.get(e.orden);
    if (prev !== undefined) err("E013", `/eventos/${i}/orden`, `El orden ${e.orden} se repite (ya lo usa el evento ${prev}).`);
    else ordenes.set(e.orden, i);
    const vehiculos = e.actores.filter((id) => kinds.get(id) === "vehiculo").length;
    const personas = e.actores.filter((id) => kinds.get(id) === "persona").length;
    if (e.tipo === "impacto_vehiculo_vehiculo" && vehiculos < 2) err("E014", `/eventos/${i}/actores`, "Un impacto entre vehículos necesita al menos dos vehículos como actores.");
    if (e.tipo === "impacto_vehiculo_persona" && (vehiculos < 1 || personas < 1)) err("E014", `/eventos/${i}/actores`, "Un impacto con persona necesita un vehículo y una persona como actores.");
    if (e.tipo === "impacto_vehiculo_objeto" && vehiculos < 1) err("E014", `/eventos/${i}/actores`, "Un impacto con objeto necesita al menos un vehículo como actor.");
  });

  problemas.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
  return problemas;
}

/** Solo los errores (sin advertencias). */
export function erroresDe(problemas: Problema[]): Problema[] {
  return problemas.filter((p) => p.severidad === "error");
}
