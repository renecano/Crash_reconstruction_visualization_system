/**
 * Las calles reales en el 3D de un caso (R10, ADR 0081): las de OpenStreetMap alrededor del punto
 * de impacto, en metros del marco de la escena (origen en el impacto, x al oriente, y al norte; sin
 * girar). Se guardan en `lugar.red_vial` para que la escena sea determinista y funcione sin red, y
 * el visor las dibuja en lugar de la plantilla (ADR 0023). La física no las usa: se reconstruye sin
 * esperarlas y se agregan al 3D cuando llegan (la primera consulta de un lugar a Overpass puede
 * tardar más de 40 s; después queda en caché).
 */
import { redVialFrom, type OverpassResponse } from "@croquis/croquis-2d";

/** Radio de la consulta de calles alrededor del impacto (m). */
export const RADIO_CALLES_M = 150;
/**
 * Lo que se espera a OpenStreetMap (ms): el límite de la ruta `/api/osm`. Se pide en cuanto el
 * perito marca el impacto; el 3D se actualiza cuando llegan.
 */
export const ESPERA_CALLES_MS = 60_000;

type Json = Record<string, unknown>;

/** La escena con las calles del mapa; igual si la respuesta no trae calles cerca. */
export function conCallesDelMapa(
  spec: Json,
  origen: readonly [number, number],
  resp: OverpassResponse,
  radioM = RADIO_CALLES_M,
): Json {
  const [lon, lat] = origen;
  const red = redVialFrom(resp, { lat, lon, radioM, rotacionDeg: 0 });
  if (!red.vias.length) return spec;
  const out = structuredClone(spec);
  const lugar = out.lugar as Json;
  lugar.ubicacion_real = {
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    radio_m: radioM,
    rotacion_deg: 0,
    procedencia: {
      fuente: "usuario",
      confianza: 1,
      nota: "El punto de impacto que marcó el perito; las calles alrededor salen de OpenStreetMap.",
    },
  };
  lugar.red_vial = red;
  return out;
}

/**
 * Una consulta por lugar (redondeado a ~110 m, dentro del radio de la consulta): la que se pidió al
 * marcar el impacto sirve al reconstruir, aunque el origen de la escena quede a unos metros. Si no
 * llegó, se vuelve a pedir la próxima vez.
 */
const pedidas = new Map<string, Promise<OverpassResponse | null>>();
export function callesCerca(origen: readonly [number, number]): Promise<OverpassResponse | null> {
  const clave = `${origen[0].toFixed(3)},${origen[1].toFixed(3)}`;
  let p = pedidas.get(clave);
  if (!p) {
    p = callesDelMapa(origen).then((r) => {
      if (!r) pedidas.delete(clave);
      return r;
    });
    pedidas.set(clave, p);
  }
  return p;
}

/** Las calles de OpenStreetMap alrededor del impacto (`/api/osm`), o null si no llegan a tiempo. */
export async function callesDelMapa(
  origen: readonly [number, number],
): Promise<OverpassResponse | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ESPERA_CALLES_MS);
  try {
    const [lon, lat] = origen;
    const r = await fetch(
      `/api/osm?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&radio=${RADIO_CALLES_M}`,
      { signal: ac.signal },
    );
    if (!r.ok) return null;
    return (await r.json()) as OverpassResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
