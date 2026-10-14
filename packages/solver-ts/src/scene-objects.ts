/**
 * Geometría de los objetos del entorno (port de `croquis_solver.scene_objects`): la misma con la
 * que el visor los dibuja y con la que la visibilidad decide qué tapa la vista. Lo que el relato no
 * dice se completa con valores por defecto; la variación entre árboles sale de un hash FNV-1a de la
 * semilla y el id, determinista.
 */
import { pyRound, str } from "./pymath";

type Json = Record<string, unknown>;

const LEN: Readonly<Record<string, number>> = { m: 1.0, cm: 0.01, mm: 0.001, km: 1000.0 };
const FLAT_TYPES = new Set(["muro", "barda"]);
const TWO_WHEEL = new Set(["motocicleta", "scooter", "bicicleta"]);

/** FNV-1a de 32 bits sobre las unidades UTF-16 del texto, normalizado a [0, 1). */
export function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 0x1_0000_0000;
}

function len(field: unknown): number | null {
  if (!field) return null;
  const f = field as Json;
  return Number(f.valor) * (LEN[str(f.unidad, "m")] ?? 1.0);
}

/** `x or dflt` de Python para números opcionales (0 también cae al valor por omisión). */
function orDefault(x: number | null, dflt: number): number {
  return x ? x : dflt;
}

export interface SceneObject {
  id: string;
  tipo: string;
  /** "arbol" | "cilindro" | "caja" | "senal" */
  forma: string;
  x: number;
  y: number;
  rumboDeg: number;
  /** Caja: a lo largo de su rumbo; cilindro y árbol: diámetro. */
  largo: number;
  ancho: number;
  /** Altura total. */
  alto: number;
  radio: number;
  troncoAlto: number;
  copaRadio: number;
  copaCentro: number;
  claseVehiculo: string | null;
}

function obj(
  id: string,
  tipo: string,
  forma: string,
  x: number,
  y: number,
  rumboDeg: number,
  largo: number,
  ancho: number,
  alto: number,
  extra: Partial<SceneObject> = {},
): SceneObject {
  return {
    id,
    tipo,
    forma,
    x,
    y,
    rumboDeg,
    largo,
    ancho,
    alto,
    radio: 0.0,
    troncoAlto: 0.0,
    copaRadio: 0.0,
    copaCentro: 0.0,
    claseVehiculo: null,
    ...extra,
  };
}

export function sceneObjectToDict(o: SceneObject): Json {
  const d: Json = {
    id: o.id,
    tipo: o.tipo,
    forma: o.forma,
    x: pyRound(o.x, 6),
    y: pyRound(o.y, 6),
    rumbo_deg: pyRound(o.rumboDeg, 6),
    largo_m: pyRound(o.largo, 6),
    ancho_m: pyRound(o.ancho, 6),
    alto_m: pyRound(o.alto, 6),
  };
  if (o.forma === "arbol" || o.forma === "cilindro") d.radio_m = pyRound(o.radio, 6);
  if (o.forma === "arbol") {
    d.copa = {
      radio_m: pyRound(o.copaRadio, 6),
      centro_m: pyRound(o.copaCentro, 6),
      tronco_alto_m: pyRound(o.troncoAlto, 6),
    };
  }
  if (o.claseVehiculo) d.clase_vehiculo = o.claseVehiculo;
  return d;
}

/** Tronco y copa de un árbol (si no se declara la altura, varía con el hash). */
export function treeGeometry(
  seed: number,
  oid: string,
  trunkD: number,
  totalH: number | null,
): SceneObject {
  const u = hash01(`${seed}:${oid}`);
  let crownR = 1.8 + 1.6 * u + 2.0 * trunkD;
  let trunkH: number;
  let crownC: number;
  let total: number;
  if (totalH === null) {
    trunkH = 3.5 + 2.5 * u;
    crownC = trunkH + 0.7 * crownR;
    total = trunkH + 1.7 * crownR;
  } else {
    crownR = Math.min(crownR, 0.35 * totalH);
    total = totalH;
    crownC = totalH - crownR;
    trunkH = totalH - 1.7 * crownR;
  }
  return obj(oid, "arbol", "arbol", 0.0, 0.0, 0.0, 2 * crownR, 2 * crownR, total, {
    radio: trunkD / 2,
    troncoAlto: trunkH,
    copaRadio: crownR,
    copaCentro: crownC,
  });
}

/** Geometría de todos los objetos del entorno declarados. */
export function sceneObjects(spec: Json): SceneObject[] {
  const seed = Math.trunc(Number((spec.meta as Json).semilla));
  const out: SceneObject[] = [];
  const objetos = ((spec.entorno as Json).objetos ?? []) as Json[];
  for (const o of objetos) {
    const oid = String(o.id);
    const tipo = String(o.tipo);
    const pos = o.posicion as Json;
    const x = Number(pos.x);
    const y = Number(pos.y);
    const rumbo = Number(o.rumbo_deg ?? 0.0);
    const largo = len(o.largo);
    const ancho = len(o.ancho);
    const alto = len(o.alto);
    if (tipo === "arbol") {
      const d = orDefault(len(o.diametro_tronco), 0.35);
      const t = treeGeometry(seed, oid, d, alto);
      out.push(
        obj(oid, tipo, "arbol", x, y, rumbo, t.largo, t.ancho, t.alto, {
          radio: t.radio,
          troncoAlto: t.troncoAlto,
          copaRadio: t.copaRadio,
          copaCentro: t.copaCentro,
        }),
      );
    } else if (tipo === "poste") {
      const d = orDefault(len(o.diametro_tronco), 0.3);
      out.push(
        obj(oid, tipo, "cilindro", x, y, rumbo, d, d, orDefault(alto, 8.0), { radio: d / 2 }),
      );
    } else if (tipo === "vehiculo_estacionado") {
      const clase = str(((o.clase_vehiculo ?? {}) as Json).valor, "sedan_compacto");
      const two = TWO_WHEEL.has(clase);
      out.push(
        obj(
          oid,
          tipo,
          "caja",
          x,
          y,
          rumbo,
          orDefault(largo, two ? 2.0 : 4.4),
          orDefault(ancho, 1.8),
          orDefault(alto, 1.5),
          { claseVehiculo: clase },
        ),
      );
    } else if (tipo === "senal") {
      out.push(obj(oid, tipo, "senal", x, y, rumbo, 0.6, 0.04, 2.6, { radio: 0.04 }));
    } else {
      const flat = FLAT_TYPES.has(tipo);
      out.push(
        obj(
          oid,
          tipo,
          "caja",
          x,
          y,
          rumbo,
          orDefault(largo, flat ? 6.0 : 2.0),
          orDefault(ancho, flat ? 0.25 : 1.5),
          orDefault(alto, flat ? 2.2 : 2.0),
        ),
      );
    }
  }
  return out;
}

/** Radio de un círculo que contiene la huella del objeto (para descartes rápidos). */
export function footprintRadius(o: SceneObject): number {
  if (o.forma === "arbol") return Math.max(o.radio, o.copaRadio);
  if (o.forma === "cilindro" || o.forma === "senal") return Math.max(o.radio, 0.5 * o.largo);
  return 0.5 * Math.hypot(o.largo, o.ancho);
}
