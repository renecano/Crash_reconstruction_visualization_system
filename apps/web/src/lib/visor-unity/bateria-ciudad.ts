/**
 * La batería de ciudad del visor 3D (René, 2026-11-20: Tollocan tronaba en Unity con una
 * NullReferenceException, y era el único caso de ciudad con el mapa en vivo, un árbol como objeto del
 * choque y un vehículo sin modelo). Arma el paquete caso-3d de cada caso como lo arma el navegador
 * (`especDel3d` con las calles y los objetos de OpenStreetMap, y el resultado de la reconstrucción que
 * Unity recibe primero) para que Unity lo cargue en una prueba, sin red.
 *
 * Los datos de OpenStreetMap salen de `data/osm/` (manifiesto con su huella; ODbL). Los casos que no
 * son de René son el suyo de Tollocan llevado a otro lugar: el mismo recorrido y el mismo objeto (o
 * otro), con el punto de impacto en una calle de ese lugar. Son pruebas del 3D, no reconstrucciones.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Expediente } from "@croquis/cesvi";
import { reconstruirExpediente } from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { especDel3d } from "@/components/cesvi/caso/reconstruccion";
import { expedienteAxaReconstruccion } from "@/lib/axa-reconstruccion";
import { paqueteDelCaso } from "@/lib/visor-unity/paquete";

type Json = Record<string, unknown>;

/** Un lugar de ciudad: su extracto de OpenStreetMap y el punto del impacto. */
const LUGARES = {
  tollocan_rene: { lat: 19.298904302569596, lon: -99.58887106452113, nombre: "Tollocan" },
  centro_toluca: { lat: 19.2925, lon: -99.6557, nombre: "Centro de Toluca" },
  tollocan_metepec: { lat: 19.28706, lon: -99.60228, nombre: "Paseo Tollocan en Metepec" },
  reforma_cdmx: { lat: 19.427, lon: -99.1677, nombre: "Paseo de la Reforma, CDMX" },
  insurgentes_cdmx: { lat: 19.4235, lon: -99.1631, nombre: "Insurgentes, CDMX" },
  centro_guadalajara: { lat: 20.6767, lon: -103.3469, nombre: "Centro de Guadalajara" },
  centro_monterrey: { lat: 25.6694, lon: -100.3097, nombre: "Centro de Monterrey" },
  axa_mex15d: { lat: 26.20915, lon: -109.0597, nombre: "MEX 15D (AXA)" },
} as const;
type Lugar = keyof typeof LUGARES;

export interface CasoBateria {
  clave: string;
  que: string;
  lugar: Lugar;
  /** El expediente del caso, ya en su lugar. */
  expediente: (raiz: string) => Expediente;
  /** Sin las calles ni los objetos del mapa (como sin red). */
  sinMapa?: boolean;
  /** Sin el árbol colocado como objeto del choque (en el paquete). */
  sinArbolColocado?: boolean;
  /**
   * Otras calles, de `data/osm/<callesDe>.overpass.json` y sin objetos: las de las teselas del mapa,
   * como cuando Overpass no responde.
   */
  callesDe?: string;
}

const tollocan = (raiz: string): Expediente =>
  (
    JSON.parse(readFileSync(resolve(raiz, "data/cesvi/casos/tollocan-rene.croquis"), "utf8")) as {
      expediente: Expediente;
    }
  ).expediente;

/** Todo punto `{lat, lon}` del expediente, movido de `de` a `a` (el mismo recorrido, en otro lugar). */
function mover(e: Expediente, de: Lugar, a: Lugar): Expediente {
  const dLat = LUGARES[a].lat - LUGARES[de].lat;
  const dLon = LUGARES[a].lon - LUGARES[de].lon;
  const visitar = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(visitar);
    if (x && typeof x === "object") {
      const o = x as Json;
      if (typeof o.lat === "number" && typeof o.lon === "number" && Object.keys(o).length <= 3)
        return { ...o, lat: o.lat + dLat, lon: o.lon + dLon };
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, visitar(v)]));
    }
    return x;
  };
  const m = visitar(e) as Expediente;
  return {
    ...m,
    caso: {
      ...m.caso,
      lugar: { ...m.caso.lugar, descripcion: { valor: LUGARES[a].nombre, fuente: "perito" } },
    },
  };
}

/** El mismo caso, con otro objeto del choque. */
function conObjeto(e: Expediente, objeto: string): Expediente {
  return {
    ...e,
    impactos: (e.impactos ?? []).map((i) => (i.objeto_fijo ? { ...i, objeto_fijo: objeto } : i)),
    evidencias: { ...e.evidencias, objetos_fijos_danados: [objeto] },
  };
}

const enLugar = (a: Lugar, objeto?: string) => (raiz: string) => {
  const e = mover(tollocan(raiz), "tollocan_rene", a);
  return objeto ? conObjeto(e, objeto) : e;
};

export const CASOS_BATERIA: readonly CasoBateria[] = [
  {
    clave: "tollocan",
    que: "Tollocan de René tal cual",
    lugar: "tollocan_rene",
    expediente: tollocan,
  },
  {
    clave: "tollocan-sin-arbol",
    que: "Tollocan sin el árbol colocado",
    lugar: "tollocan_rene",
    expediente: tollocan,
    sinArbolColocado: true,
  },
  {
    clave: "tollocan-sin-mapa",
    que: "Tollocan sin el mapa en vivo",
    lugar: "tollocan_rene",
    expediente: tollocan,
    sinMapa: true,
  },
  {
    clave: "tollocan-teselas",
    que: "Tollocan con las calles de las teselas del mapa (sin Overpass)",
    lugar: "tollocan_rene",
    expediente: tollocan,
    callesDe: "tollocan_rene_teselas",
  },
  {
    clave: "toluca-poste",
    que: "Un vehículo contra un poste, centro de Toluca",
    lugar: "centro_toluca",
    expediente: enLugar("centro_toluca", "poste"),
  },
  {
    clave: "toluca-arbol",
    que: "Un vehículo contra un árbol, centro de Toluca",
    lugar: "centro_toluca",
    expediente: enLugar("centro_toluca", "árbol"),
  },
  {
    clave: "toluca-pared",
    que: "Un vehículo contra una pared, centro de Toluca",
    lugar: "centro_toluca",
    expediente: enLugar("centro_toluca", "pared"),
  },
  {
    clave: "axa",
    que: "AXA con el mapa en vivo",
    lugar: "axa_mex15d",
    expediente: () => expedienteAxaReconstruccion(),
  },
  {
    clave: "axa-sin-modelo",
    que: "AXA con un vehículo sin marca ni modelo",
    lugar: "axa_mex15d",
    expediente: () => {
      const e = expedienteAxaReconstruccion();
      return {
        ...e,
        vehiculos: e.vehiculos.map((v, i) => {
          if (i !== 0) return v;
          const resto = { ...v };
          delete resto.marca;
          delete resto.modelo;
          return resto;
        }),
      };
    },
  },
  {
    clave: "metepec-arbol",
    que: "Paseo Tollocan en Metepec, contra un árbol",
    lugar: "tollocan_metepec",
    expediente: enLugar("tollocan_metepec"),
  },
  {
    clave: "reforma-poste",
    que: "Paseo de la Reforma, contra un poste",
    lugar: "reforma_cdmx",
    expediente: enLugar("reforma_cdmx", "poste"),
  },
  {
    clave: "insurgentes-arbol",
    que: "Insurgentes, contra un árbol",
    lugar: "insurgentes_cdmx",
    expediente: enLugar("insurgentes_cdmx"),
  },
  {
    clave: "guadalajara-poste",
    que: "Centro de Guadalajara, contra un poste",
    lugar: "centro_guadalajara",
    expediente: enLugar("centro_guadalajara", "poste"),
  },
  {
    clave: "monterrey-pared",
    que: "Centro de Monterrey, contra una pared",
    lugar: "centro_monterrey",
    expediente: enLugar("centro_monterrey", "pared"),
  },
];

/** Lo que trae un paquete, para la tabla de la batería. */
export function resumenDelPaquete(p: Json) {
  const esc = p.escenario as
    | {
        entorno?: Record<string, unknown>;
        via?: { capas?: { posiciones: unknown[] }[]; rodadas?: unknown[] };
      }
    | undefined;
  const en = esc?.entorno ?? {};
  const n = (k: string) => (Array.isArray(en[k]) ? (en[k] as unknown[]).length : 0);
  const res = p.resultado as { objetos?: { tipo: string }[]; vehiculos?: unknown[] };
  return {
    zona: en.zona ?? null,
    edificios: n("edificios"),
    arboles: n("arboles"),
    postes: n("postes"),
    senales: n("senales"),
    rodadas: esc?.via?.rodadas?.length ?? 0,
    vertices_via: Math.round(
      (esc?.via?.capas ?? []).reduce((a, c) => a + c.posiciones.length / 3, 0),
    ),
    objetos_del_choque: (res.objetos ?? []).map((o) => o.tipo),
    vehiculos: res.vehiculos?.length ?? 0,
    bytes: JSON.stringify(p).length,
  };
}

/** El paquete caso-3d de un caso de la batería, como lo arma el navegador. */
export function paqueteDeLaBateria(
  c: CasoBateria,
  raiz: string,
  /** Otras calles (las de las teselas del mapa, cuando Overpass no responde); sin objetos. */
  calles?: OverpassResponse,
): Json {
  const e = c.expediente(raiz);
  calles ??= c.callesDe
    ? (JSON.parse(
        readFileSync(resolve(raiz, `data/osm/${c.callesDe}.overpass.json`), "utf8"),
      ) as OverpassResponse)
    : undefined;
  const osm = calles
    ? null
    : c.sinMapa
      ? null
      : (JSON.parse(
          readFileSync(resolve(raiz, `data/osm/${c.lugar}.overpass.json`), "utf8"),
        ) as OverpassResponse);
  const r = reconstruirExpediente(e, undefined, { samples: 8, mcSamples: 8 });
  const escena = especDel3d(r, calles ?? osm, osm) as unknown as Json;
  if (c.sinArbolColocado) {
    const entorno = (escena.entorno ?? {}) as Json;
    entorno.objetos = ((entorno.objetos ?? []) as Json[]).filter((o) => o.tipo !== "arbol");
  }
  // Lo que Unity recibe primero: la reconstrucción de esa escena (U6), sin Monte Carlo.
  const resultado = reconstructionToDict(reconstruct(escena as never));
  return paqueteDelCaso(escena as never, resultado as never, r.relieve ?? null) as unknown as Json;
}
