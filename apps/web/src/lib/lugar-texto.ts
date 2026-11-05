/**
 * Qué escribió el perito en «Buscar el lugar» (René, 2026-11-04, A1): coordenadas o un link de
 * mapa van directo al punto, sin buscar; una carretera con kilómetro se busca como carretera dentro
 * del municipio del caso; lo demás, como texto.
 *
 * Formatos de punto:
 * - decimales: «19.2826, -99.6557», «19.2826 -99.6557», «19.2826° N, 99.6557° W»;
 * - grados, minutos y segundos: «19°16'57.4"N 99°39'20.5"W» (también con ’ ” y espacios);
 * - links de Google Maps: `/@19.28,-99.65,17z`, `?q=19.28,-99.65`, `?ll=…`, `!3d19.28!4d-99.65`;
 * - links de OpenStreetMap: `#map=17/19.28/-99.65`, `?mlat=19.28&mlon=-99.65`.
 */

export type LugarInterpretado =
  | { tipo: "punto"; lat: number; lon: number; origen: "coordenadas" | "google" | "osm" }
  | { tipo: "carretera"; ref: string; km: number | null; texto: string }
  | { tipo: "texto"; texto: string };

const valido = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

function punto(
  lat: number,
  lon: number,
  origen: "coordenadas" | "google" | "osm",
): LugarInterpretado | null {
  return valido(lat, lon) ? { tipo: "punto", lat, lon, origen } : null;
}

const NUM = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;

function desdeLink(t: string): LugarInterpretado | null {
  if (!/^https?:\/\//i.test(t) && !/^(www\.)?(google\.|maps\.|goo\.gl|openstreetmap)/i.test(t))
    return null;
  let m: RegExpMatchArray | null;
  if (/openstreetmap\.org/i.test(t)) {
    m = t.match(new RegExp(String.raw`[?&]mlat=(${NUM}).*?[?&]mlon=(${NUM})`));
    if (m) return punto(Number(m[1]), Number(m[2]), "osm");
    m = t.match(new RegExp(String.raw`#map=\d+(?:\.\d+)?/(${NUM})/(${NUM})`));
    if (m) return punto(Number(m[1]), Number(m[2]), "osm");
    return null;
  }
  // Google: el pin (!3d…!4d…) manda sobre el centro de la vista (@lat,lon).
  m = t.match(new RegExp(String.raw`!3d(${NUM})!4d(${NUM})`));
  if (m) return punto(Number(m[1]), Number(m[2]), "google");
  m = t.match(new RegExp(String.raw`[?&](?:q|query|ll|center|destination)=(${NUM}),\s*(${NUM})`));
  if (m) return punto(Number(m[1]), Number(m[2]), "google");
  m = t.match(new RegExp(String.raw`@(${NUM}),(${NUM})`));
  if (m) return punto(Number(m[1]), Number(m[2]), "google");
  return null;
}

/** Grados, minutos y segundos con hemisferio: «19°16'57.4"N». */
function gms(g: string, m: string | undefined, s: string | undefined, h: string): number {
  const v = Number(g) + (m ? Number(m) / 60 : 0) + (s ? Number(s) / 3600 : 0);
  return /[SWO]/i.test(h) ? -v : v;
}

function desdeGms(t: string): LugarInterpretado | null {
  const parte = String.raw`(\d{1,3})\s*[°º]\s*(?:(\d{1,2}(?:\.\d+)?)\s*['’′]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|”|″|''|’’)\s*)?([NSEWO])`;
  const m = t.match(new RegExp(`${parte}[\\s,;]+${parte}`, "i"));
  if (!m) return null;
  const a = gms(m[1]!, m[2], m[3], m[4]!);
  const b = gms(m[5]!, m[6], m[7], m[8]!);
  // El que dice N o S es la latitud.
  const latPrimero = /[NS]/i.test(m[4]!);
  return punto(latPrimero ? a : b, latPrimero ? b : a, "coordenadas");
}

function desdeDecimales(t: string): LugarInterpretado | null {
  const m = t
    .trim()
    .match(
      new RegExp(String.raw`^(${NUM})\s*°?\s*([NS])?\s*[,;\s]\s*(${NUM})\s*°?\s*([EWO])?$`, "i"),
    );
  if (!m) return null;
  let lat = Number(m[1]);
  let lon = Number(m[3]);
  if (m[2] && /S/i.test(m[2])) lat = -Math.abs(lat);
  if (m[4] && /[WO]/i.test(m[4])) lon = -Math.abs(lon);
  // En México la longitud es negativa; si alguien la escribe positiva sin hemisferio, se respeta.
  return punto(lat, lon, "coordenadas");
}

/**
 * Carretera con número y, si lo trae, kilómetro: «MEX-15 km 47+800», «carretera federal 15D km 47»,
 * «Fed. 57 km 12.5». La clave sale como la escribe OSM en México: «MEX 15D».
 */
function desdeCarretera(t: string): LugarInterpretado | null {
  const ref = t.match(
    /\b(?:MEX|carretera(?:\s+federal)?|fed(?:eral)?\.?|autopista|libramiento)\s*[-\s]?\s*(\d{1,3})\s*([A-Z])?\b/i,
  );
  const km = t.match(/\bkm\.?\s*(\d{1,4})(?:\s*\+\s*(\d{1,3})|[.,](\d+))?/i);
  if (!ref) return null;
  let k: number | null = null;
  if (km) {
    k = Number(km[1]);
    if (km[2]) k += Number(km[2]) / 1000;
    else if (km[3]) k += Number(`0.${km[3]}`);
  }
  return {
    tipo: "carretera",
    ref: `MEX ${ref[1]}${ref[2] ? ref[2].toUpperCase() : ""}`,
    km: k,
    texto: t,
  };
}

export function interpretarLugar(texto: string): LugarInterpretado {
  const t = texto.trim();
  return (
    desdeLink(t) ??
    desdeGms(t) ??
    desdeDecimales(t) ??
    desdeCarretera(t) ?? { tipo: "texto", texto: t }
  );
}
