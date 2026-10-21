/**
 * Las calles alrededor del punto de impacto, sin esperar a Overpass (ADR 0053). Vienen de dos
 * fuentes inmediatas: el tramo precargado del caso (`data/cesvi/casos/<id>-tramo.json`, de OSM) y
 * los mosaicos vectoriales que el mapa ya cargó. Overpass solo enriquece después (carriles, ancho,
 * nombre).
 */
import A2010930 from "../../../data/cesvi/casos/A2010930-tramo.json";
import { rumboCercano, type LonLat } from "./geo";

export interface Calle {
  /** Nombre o número de la vía (p. ej. «MEX 15»). */
  nombre?: string;
  /** Tipo de vía (`highway` de OSM o `class` de OpenMapTiles). */
  tipo: string;
  carriles?: number;
  anchoM?: number;
  unSentido?: boolean;
  puntos: LonLat[];
  fuente: "tramo" | "mosaicos" | "overpass";
}

interface ViaTramo {
  id_osm: number;
  tags: Record<string, string>;
  puntos: [number, number][];
}

function calleDeTramo(v: ViaTramo): Calle {
  const t = v.tags;
  const carriles = Number.parseInt(t.lanes ?? "", 10);
  const ancho = Number.parseFloat(t.width ?? "");
  return {
    nombre: t.ref && t.name ? `${t.ref}, ${t.name}` : (t.ref ?? t.name),
    tipo: t.highway ?? "carretera",
    ...(Number.isFinite(carriles) ? { carriles } : {}),
    ...(Number.isFinite(ancho) ? { anchoM: ancho } : {}),
    ...(t.oneway === "yes" ? { unSentido: true } : {}),
    puntos: v.puntos,
    fuente: "tramo",
  };
}

const TRAMOS: Readonly<Record<string, Calle[]>> = {
  A2010930: (A2010930 as unknown as { vias: ViaTramo[] }).vias.map(calleDeTramo),
};

/** El tramo precargado del caso (vacío si no tiene). */
export function tramoDelCaso(id: string): Calle[] {
  return TRAMOS[id] ?? [];
}

export interface CallesCerca {
  calles: Calle[];
  /** La más cercana al punto, con su distancia y el rumbo de su tramo más cercano. */
  cercana: { calle: Calle; distanciaM: number; rumbo: number } | null;
}

/** Las calles a menos de `radioM` del punto, y la más cercana. */
export function callesCerca(calles: readonly Calle[], p: LonLat, radioM: number): CallesCerca {
  const cerca: Calle[] = [];
  let cercana: CallesCerca["cercana"] = null;
  for (const c of calles) {
    const r = rumboCercano(c.puntos, p);
    if (!r || r.distancia > radioM) continue;
    cerca.push(c);
    if (!cercana || r.distancia < cercana.distanciaM) {
      cercana = { calle: c, distanciaM: r.distancia, rumbo: r.rumbo };
    }
  }
  return { calles: cerca, cercana };
}
