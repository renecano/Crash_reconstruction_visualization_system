/**
 * Calles reales en una escena del usuario (ADR 0040): el navegador pide a `/api/osm` las calles
 * alrededor de unas coordenadas y las pone en la escena con `applyMap` (la misma conversión que
 * las escenas canónicas). Necesita red; la escena resultante ya no.
 */
import { applyMap, type OverpassResponse } from "@croquis/croquis-2d";
import { validateEscena, type EscenaSpec } from "@croquis/scene-schema";

/** Lee «19.2789, -99.6539» (o con espacios, o separados por punto y coma). null si no es válido. */
export function parseCoordenadas(text: string): { lat: number; lon: number } | null {
  const nums = text.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length !== 2) return null;
  const lat = Number(nums[0]);
  const lon = Number(nums[1]);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return null;
  return { lat, lon };
}

export class MapaError extends Error {}

export async function traerCalles(
  spec: EscenaSpec,
  coords: { lat: number; lon: number },
  radioM: number,
  fetcher: typeof fetch = fetch,
): Promise<{ spec: EscenaSpec; vias: number }> {
  const q = new URLSearchParams({
    lat: String(coords.lat),
    lon: String(coords.lon),
    radio: String(radioM),
  });
  const res = await fetcher(`/api/osm?${q.toString()}`);
  if (!res.ok) {
    let msg = "No se pudo consultar OpenStreetMap.";
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      // cuerpo sin JSON: queda el mensaje genérico
    }
    throw new MapaError(msg);
  }
  const resp = (await res.json()) as OverpassResponse;
  let applied;
  try {
    applied = applyMap(spec, resp, { ...coords, radioM });
  } catch (e) {
    throw new MapaError(e instanceof Error ? e.message : String(e));
  }
  const v = validateEscena(applied.spec);
  if (!v.ok) throw new MapaError("La escena con las calles no cumple el contrato.");
  return { spec: v.spec, vias: applied.vias };
}
