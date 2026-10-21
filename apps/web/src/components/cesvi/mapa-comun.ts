/**
 * Lo común del mapa de /cesvi (ADR 0050 y 0053): el estilo de OpenFreeMap, las calles de Overpass, los
 * colores de los tokens y las marcas que el perito arrastra.
 */
import { type Calle, type Fase, type LonLat, type Medidas } from "@croquis/cesvi";
import { VEHICLE_CLASSES } from "@croquis/scene-schema";
import type { FeatureCollection } from "geojson";

export const ESTILO_MAPA = "https://tiles.openfreemap.org/styles/dark";
/** El estilo del tema claro (ADR 0057). */
export const ESTILO_MAPA_CLARO = "https://tiles.openfreemap.org/styles/positron";
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

/** Calles de la respuesta de Overpass, con lo que enriquece al tramo: carriles, ancho y nombre. */
export function viasDe(respuesta: unknown): Calle[] {
  const elementos = (respuesta as { elements?: Record<string, unknown>[] }).elements ?? [];
  const nodos = new Map<number, LonLat>();
  for (const e of elementos) {
    if (e.type === "node") nodos.set(e.id as number, [e.lon as number, e.lat as number]);
  }
  const vias: Calle[] = [];
  for (const e of elementos) {
    const tags = (e.tags ?? {}) as Record<string, string>;
    if (e.type !== "way" || !tags.highway) continue;
    const puntos = ((e.nodes as number[]) ?? [])
      .map((id) => nodos.get(id))
      .filter((p): p is LonLat => p !== undefined);
    if (puntos.length < 2) continue;
    const carriles = Number.parseInt(tags.lanes ?? "", 10);
    const ancho = Number.parseFloat(tags.width ?? "");
    const nombre = tags.ref && tags.name ? `${tags.ref}, ${tags.name}` : (tags.name ?? tags.ref);
    vias.push({
      ...(nombre ? { nombre } : {}),
      tipo: tags.highway,
      ...(Number.isFinite(carriles) ? { carriles } : {}),
      ...(Number.isFinite(ancho) ? { anchoM: ancho } : {}),
      ...(tags.oneway === "yes" ? { unSentido: true } : {}),
      puntos,
      fuente: "overpass",
    });
  }
  return vias;
}

export const vacio: FeatureCollection = { type: "FeatureCollection", features: [] };

export function colores(): {
  texto: string;
  texto2: string;
  texto3: string;
  evidencia: string;
  accion: string;
} {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d;
  // Los roles apuntan a tokens (`var(--marca-…)`): se leen ya resueltos en <html>.
  return {
    texto: v("--marca-blanco", "#F2F3F5"),
    texto2: v("--marca-gris", "#A4A9B3"),
    texto3: v("--marca-gris-oscuro", "#7B818C"),
    evidencia: v("--marca-senal", "#FF5B2E"),
    accion: v("--marca-blanco", "#F2F3F5"),
  };
}

export function marcador(texto: string, clase: string): HTMLElement {
  const el = document.createElement("div");
  el.className = clase;
  el.textContent = texto;
  return el;
}
