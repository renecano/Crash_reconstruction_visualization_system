/**
 * El modo «mapa real» del 3D (ronda 4, punto 9; René, 2026-11-18; ADR 0124): el lugar como piso de
 * Unity, en vez del entorno procedural (que se queda como el modo de siempre).
 *
 * - **El mapa** de OpenStreetMap (OpenFreeMap, el mismo estilo de La escena) siempre: sirve sin
 *   internet si sus teselas están en caché, en las fotos del dictamen y en el video, con atribución.
 *   Es lo único que va en el paquete 3D que se descarga (y en el visor de escritorio).
 * - **La foto satelital de Esri** (World Imagery) encima, solo en vivo y con internet: se apaga sola
 *   y lo dice si no hay red, si no hay llave o si sus teselas no cargan. El perito la puede correr
 *   (Esri declara de 5 a 8.5 m de error). No va en el video: su licencia no lo menciona.
 *
 * La llave es `NEXT_PUBLIC_ESRI_API_KEY` (René: ArcGIS Location Platform, solo Basemaps, con los
 * referrers del sitio y de localhost:3000). Nunca se imprime ni se guarda en el paquete.
 */
import { desdeMetros, formato, type LonLat } from "@croquis/cesvi";
import type { StyleSpecification } from "maplibre-gl";

/** Lado de la imagen que recibe Unity (px): 2 048 para unos 600 m da unos 0.3 m por pixel. */
export const LADO_PX = 2048;
/** El contenedor fuera de pantalla (px de CSS); con `pixelRatio` 2 da `LADO_PX`. */
const LADO_CSS = LADO_PX / 2;
/** Lo que cubre el piso: la escena con margen, entre estos dos lados (m). */
export const LADO_MIN_M = 200;
export const LADO_MAX_M = 800;
const MARGEN_M = 60;

export const ATRIBUCION_MAPA = "© OpenStreetMap · OpenFreeMap · OpenMapTiles";
/** El crédito de la foto, como lo pide Esri: «Powered by Esri» y el de su servicio. */
export const atribucionEsri = (creditos: string) => `Powered by Esri · ${creditos}`;
const CREDITOS_ESRI = "Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const SERVICIO_ESRI =
  "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer";
/** La llave, inlinada en el build (`next.config.ts` la toma también del `.env.local` de la raíz). */
export const LLAVE_ESRI = process.env.NEXT_PUBLIC_ESRI_API_KEY ?? "";

/** Dónde va el piso en la escena: su centro (m, X al este, Y al norte), su lado y el origen. */
export interface PisoCaso {
  centroX: number;
  centroY: number;
  ladoM: number;
  origen: LonLat;
}

type Trayectorias = { vehiculos?: { trayectoria?: { x: number[]; y: number[] } }[] };

/** El piso de un caso: centrado en lo que se mueve, con margen, entre 200 y 800 m de lado. */
export function pisoDelCaso(resultado: unknown, origen: LonLat): PisoCaso {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const v of (resultado as Trayectorias).vehiculos ?? []) {
    xs.push(...(v.trayectoria?.x ?? []));
    ys.push(...(v.trayectoria?.y ?? []));
  }
  if (!xs.length) return { centroX: 0, centroY: 0, ladoM: LADO_MIN_M, origen };
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const lado = Math.max(x1 - x0, y1 - y0) + 2 * MARGEN_M;
  return {
    centroX: Math.round(((x0 + x1) / 2) * 10) / 10,
    centroY: Math.round(((y0 + y1) / 2) * 10) / 10,
    ladoM: Math.min(LADO_MAX_M, Math.max(LADO_MIN_M, Math.ceil(lado / 10) * 10)),
    origen,
  };
}

/** El zoom de MapLibre (teselas de 512) con el que `ladoM` cabe justo en `px` de CSS. */
export function zoomParaLado(ladoM: number, latDeg: number, px = LADO_CSS): number {
  const metrosPorPx = ladoM / px;
  return Math.log2((40075016.686 * Math.cos((latDeg * Math.PI) / 180)) / (512 * metrosPorPx));
}

/** El ajuste de la foto, en metros (este, norte). */
export interface AjusteFoto {
  esteM: number;
  norteM: number;
}
export const SIN_AJUSTE: AjusteFoto = { esteM: 0, norteM: 0 };
/** Cuánto se mueve la foto con cada flecha (m) y hasta dónde (Esri declara hasta 8.5 m de error). */
export const PASO_AJUSTE_M = 0.5;
export const AJUSTE_MAX_M = 15;

/** Un ajuste más una flecha, dentro de ±15 m. */
export function ajustar(a: AjusteFoto, dEste: number, dNorte: number): AjusteFoto {
  const k = (x: number) => Math.round(Math.max(-AJUSTE_MAX_M, Math.min(AJUSTE_MAX_M, x)) * 10) / 10;
  return { esteM: k(a.esteM + dEste), norteM: k(a.norteM + dNorte) };
}

/** Cuántos pixeles de la imagen final se mueve la foto (y crece hacia abajo). */
export function desplazamientoPx(
  a: AjusteFoto,
  ladoM: number,
  px = LADO_PX,
): { dx: number; dy: number } {
  return { dx: (a.esteM / ladoM) * px, dy: (-a.norteM / ladoM) * px };
}

/** El ajuste en palabras: «1.5 m al este y 2.0 m al sur». */
export function ajusteEnPalabras(a: AjusteFoto): string {
  if (!a.esteM && !a.norteM) return "Sin ajuste";
  const parte = (m: number, pos: string, neg: string) =>
    m ? `${formato.fijo(Math.abs(m), 1)} m al ${m > 0 ? pos : neg}` : null;
  return [parte(a.esteM, "este", "oeste"), parte(a.norteM, "norte", "sur")]
    .filter(Boolean)
    .join(" y ");
}

/** Por qué no hay foto satelital, en palabras del perito (null si la puede haber). */
export function motivoSinFoto(o: {
  enLinea: boolean;
  llave: string;
  fallo?: boolean;
}): string | null {
  if (!o.llave) return "Este sitio no tiene la llave de la foto satelital: el piso es el mapa.";
  if (!o.enLinea) return "Sin internet: la foto satelital se apagó y el piso es el mapa.";
  if (o.fallo) return "La foto satelital no cargó: el piso es el mapa.";
  return null;
}

// --- Dibujo (solo en el navegador) ------------------------------------------------------------

/** Una vista de MapLibre fuera de pantalla, norte arriba, con el piso justo en su cuadro. */
async function dibujarVista(
  piso: PisoCaso,
  estilo: StyleSpecification,
  alError?: () => void,
): Promise<HTMLCanvasElement | null> {
  const { Map, getVersion, setWorkerUrl } = await import("maplibre-gl");
  setWorkerUrl(`/maplibre/worker-${getVersion()}.mjs`);
  const caja = document.createElement("div");
  caja.setAttribute("aria-hidden", "true");
  caja.style.cssText = `position:fixed;left:-20000px;top:0;width:${LADO_CSS}px;height:${LADO_CSS}px;pointer-events:none`;
  document.body.appendChild(caja);
  const [lon, lat] = desdeMetros(piso.centroX, piso.centroY, piso.origen);
  const m = new Map({
    container: caja,
    style: estilo,
    center: [lon, lat],
    zoom: zoomParaLado(piso.ladoM, lat),
    bearing: 0,
    pitch: 0,
    interactive: false,
    attributionControl: false,
    pixelRatio: LADO_PX / LADO_CSS,
    fadeDuration: 0,
  });
  if (alError) m.on("error", alError);
  try {
    await new Promise<void>((listo) => {
      const t = setTimeout(listo, 20_000);
      m.once("idle", () => {
        clearTimeout(t);
        listo();
      });
    });
    const fuente = m.getCanvas();
    const salida = document.createElement("canvas");
    salida.width = LADO_PX;
    salida.height = LADO_PX;
    const g = salida.getContext("2d");
    if (!g) return null;
    // El cuadro se copia en el instante en que se dibuja (el búfer se borra después).
    await new Promise<void>((listo) => {
      const t = setTimeout(listo, 3000);
      m.once("render", () => {
        g.drawImage(fuente, 0, 0, LADO_PX, LADO_PX);
        clearTimeout(t);
        listo();
      });
      m.triggerRepaint();
    });
    return salida;
  } finally {
    m.remove();
    caja.remove();
  }
}

/** El estilo de la foto: solo las teselas de World Imagery (más allá de z19 se amplía la última). */
function estiloFoto(llave: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      foto: {
        type: "raster",
        tiles: [`${SERVICIO_ESRI}/tile/{z}/{y}/{x}?token=${llave}`],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": "#20242B" } },
      { id: "foto", type: "raster", source: "foto" },
    ],
  };
}

/** El crédito del servicio de Esri (como en su ejemplo para MapLibre); si no responde, el de siempre. */
async function creditosEsri(llave: string): Promise<string> {
  try {
    const r = await fetch(`${SERVICIO_ESRI}?f=json&token=${llave}`, {
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as { copyrightText?: string; error?: unknown };
    if (j.error) throw new Error("sin crédito");
    return j.copyrightText || CREDITOS_ESRI;
  } catch {
    return CREDITOS_ESRI;
  }
}

/** Las dos capas del piso, ya dibujadas: el mapa siempre; la foto, si se pudo. */
export interface CapasPiso {
  mapa: HTMLCanvasElement;
  foto: HTMLCanvasElement | null;
  creditosFoto: string | null;
  /** Por qué no hay foto (null si la hay o no se pidió). */
  sinFoto: string | null;
}

export async function dibujarCapas(
  piso: PisoCaso,
  estiloMapa: StyleSpecification,
  conFoto: boolean,
): Promise<CapasPiso | null> {
  const mapa = await dibujarVista(piso, estiloMapa);
  if (!mapa) return null;
  if (!conFoto) return { mapa, foto: null, creditosFoto: null, sinFoto: null };
  const antes = motivoSinFoto({
    enLinea: typeof navigator === "undefined" || navigator.onLine,
    llave: LLAVE_ESRI,
  });
  if (antes) return { mapa, foto: null, creditosFoto: null, sinFoto: antes };
  let fallas = 0;
  const [foto, creditos] = await Promise.all([
    dibujarVista(piso, estiloFoto(LLAVE_ESRI), () => fallas++),
    creditosEsri(LLAVE_ESRI),
  ]);
  // Con teselas que no cargan (sin red, o una llave que no acepta este sitio), sin foto.
  if (!foto || fallas > 2)
    return {
      mapa,
      foto: null,
      creditosFoto: null,
      sinFoto: motivoSinFoto({ enLinea: navigator.onLine, llave: LLAVE_ESRI, fallo: true }),
    };
  return { mapa, foto, creditosFoto: creditos, sinFoto: null };
}

/** La imagen que recibe Unity: el mapa y, si la hay, la foto encima con su ajuste. JPEG. */
export function componer(
  c: CapasPiso,
  piso: PisoCaso,
  ajuste: AjusteFoto,
  conFoto: boolean,
): Promise<string> {
  const salida = document.createElement("canvas");
  salida.width = LADO_PX;
  salida.height = LADO_PX;
  const g = salida.getContext("2d")!;
  g.drawImage(c.mapa, 0, 0);
  if (conFoto && c.foto) {
    const { dx, dy } = desplazamientoPx(ajuste, piso.ladoM);
    g.drawImage(c.foto, dx, dy);
  }
  // `toBlob` codifica fuera del hilo principal (un `toDataURL` de 2 048 px lo trabaría).
  return new Promise<string>((listo, falla) => {
    salida.toBlob(
      (b) => {
        if (!b) return falla(new Error("No se pudo codificar el piso."));
        const lector = new FileReader();
        lector.onload = () => listo(String(lector.result));
        lector.onerror = () => falla(new Error("No se pudo leer el piso."));
        lector.readAsDataURL(b);
      },
      "image/jpeg",
      0.86,
    );
  });
}

/** El crédito de lo que se ve en el piso. */
export function atribucionDelPiso(c: CapasPiso | null, conFoto: boolean): string {
  return conFoto && c?.foto && c.creditosFoto
    ? `${ATRIBUCION_MAPA} · ${atribucionEsri(c.creditosFoto)}`
    : ATRIBUCION_MAPA;
}

/** Lo que el visor le manda a Unity: el mapa solo (para el paquete) y lo que se ve en vivo. */
export interface PisoUnity {
  centro_x: number;
  centro_y: number;
  lado_m: number;
  /** Solo el mapa: va en el paquete 3D (y al visor de escritorio) y en el video. */
  imagenMapa: string;
  /** Lo que se ve en vivo: el mapa con la foto encima, si la hay. */
  imagenVivo: string;
  atribucionMapa: string;
  atribucionVivo: string;
}
