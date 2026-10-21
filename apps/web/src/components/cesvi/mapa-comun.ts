/**
 * Lo común de los mapas de /cesvi (ADR 0050): el estilo de OpenFreeMap, las calles de OSM como
 * líneas, el GeoJSON del croquis (vehículos por fase, zona de restos y medición), los colores de los
 * tokens y las marcas que el perito arrastra.
 */
import {
  FASES,
  rectanguloVehiculo,
  type Fase,
  type LonLat,
  type Medidas,
  type VersionCroquis,
} from "@croquis/cesvi";
import { VEHICLE_CLASSES } from "@croquis/scene-schema";
import type { Feature, FeatureCollection, Position } from "geojson";

export const ESTILO_MAPA = "https://tiles.openfreemap.org/styles/dark";
export const NOMINATIM = "https://nominatim.openstreetmap.org/search";
export const RADIO_OSM_M = 250;
/** «Unos metros»: valor con que se dibuja la reversa declarada; el perito lo cambia. */
export const REVERSA_INICIAL_M = 3;

const tipico = VEHICLE_CLASSES.pickup?.tipico;
export const MEDIDAS_PICKUP: Medidas = {
  largo: tipico?.largo_m ?? 5.34,
  ancho: tipico?.ancho_m ?? 1.86,
};

export const NOMBRE_FASE: Record<Fase, string> = {
  inicial: "posición inicial",
  impacto: "impacto",
  final: "posición final",
};

export interface ViaOsm {
  nombre?: string;
  tipo: string;
  puntos: LonLat[];
}

export interface Resultado {
  display_name: string;
  lat: string;
  lon: string;
}

/** Calles de la respuesta de Overpass como líneas [lon, lat]. */
export function viasDe(respuesta: unknown): ViaOsm[] {
  const elementos = (respuesta as { elements?: Record<string, unknown>[] }).elements ?? [];
  const nodos = new Map<number, LonLat>();
  for (const e of elementos) {
    if (e.type === "node") nodos.set(e.id as number, [e.lon as number, e.lat as number]);
  }
  const vias: ViaOsm[] = [];
  for (const e of elementos) {
    const tags = (e.tags ?? {}) as Record<string, string>;
    if (e.type !== "way" || !tags.highway) continue;
    const puntos = ((e.nodes as number[]) ?? [])
      .map((id) => nodos.get(id))
      .filter((p): p is LonLat => p !== undefined);
    if (puntos.length > 1) vias.push({ nombre: tags.name ?? tags.ref, tipo: tags.highway, puntos });
  }
  return vias;
}

export const vacio: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Lo que se dibuja de una versión: vehículos por fase, la zona de restos y la medición. */
export function geojson(
  v: VersionCroquis | null,
  medidas: Record<"A" | "B", Medidas>,
  medicion: LonLat[],
) {
  const features: Feature[] = [];
  if (v) {
    for (const letra of ["A", "B"] as const) {
      for (const fase of FASES) {
        const p = v.vehiculos[letra][fase];
        const m = medidas[letra];
        features.push({
          type: "Feature",
          properties: { tipo: "vehiculo", letra, fase },
          geometry: {
            type: "Polygon",
            coordinates: [rectanguloVehiculo(p.punto, p.rumbo, m.largo, m.ancho)],
          },
        });
      }
    }
    features.push({
      type: "Feature",
      properties: { tipo: "restos" },
      geometry: { type: "LineString", coordinates: [v.restos.inicio, v.restos.fin] },
    });
  }
  if (medicion.length === 2) {
    features.push({
      type: "Feature",
      properties: { tipo: "medicion" },
      geometry: { type: "LineString", coordinates: medicion as unknown as Position[] },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

export function colores(): { texto: string; texto2: string; evidencia: string; accion: string } {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d;
  return {
    texto: v("--texto", "#f2f0e9"),
    texto2: v("--texto-2", "#a7aab0"),
    evidencia: v("--evidencia", "#ff6a1a"),
    accion: v("--accion", "#ffc21a"),
  };
}

export function marcador(texto: string, clase: string): HTMLElement {
  const el = document.createElement("div");
  el.className = clase;
  el.textContent = texto;
  return el;
}
