/**
 * El relieve real del lugar (C3 y O4, W5): `/api/relieve` arma la malla de alturas alrededor del
 * punto de impacto, con la forma de `caso3d.relieve`. Fuentes verificadas el 2026-11-10
 * (`data/SOURCES.md`, ADR 0131, `eval/results/w5_relieve.json`), en este orden:
 *
 * 1. **INEGI, modelo de terreno LiDAR de 5 m**, donde lo hay. El Continuo de Elevaciones Mexicano
 *    solo se descarga a mano desde la página del INEGI (no hay un servicio para pedir un recorte),
 *    pero los Terrain Tiles de AWS (Mapzen) llevan el relieve continental del INEGI en México, y
 *    cada mosaico dice de qué archivos salió (`x-amz-meta-x-imagery-sources`: `mx_lidar/…`). Es un
 *    modelo de **terreno**: sin edificios ni árboles.
 * 2. **Copernicus GLO-30** (COG abierto en AWS), donde el INEGI no tiene LiDAR. Es un modelo de
 *    **superficie** de 30 m: en ciudad incluye edificios y árboles.
 * 3. **SRTM de 30 m**, el que traen los Terrain Tiles fuera del LiDAR, si Copernicus no responde.
 *
 * Lo que hay que decir con honestidad, y la interfaz lo dice: la malla da la pendiente general de
 * la vía. No ve una rampa de 2 m, el bombeo ni un tope; esos los declara el perito.
 */
import { inflateSync } from "node:zlib";
import { z } from "zod";

/** Metros entre nodos de la malla desde los Terrain Tiles (zoom 14: unos 9 m por pixel en México). */
export const RESOLUCION_M = 10;
/** Metros entre nodos de la malla de Copernicus GLO-30 (1 segundo de arco). */
export const RESOLUCION_COPERNICUS_M = 30;
export const ZOOM = 14;
const LADO_TESELA = 256;
export const BASE_TESELAS = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
export const BASE_COG = "https://copernicus-dem-30m.s3.amazonaws.com";
const RADIO_TIERRA_M = 6_371_008.8;

export const FUENTE_INEGI =
  "INEGI, modelo digital de elevación LiDAR de terreno (5 m), por Terrain Tiles";
export const FUENTE_SRTM = "SRTM (30 m), U.S. Geological Survey, por Terrain Tiles";
export const FUENTE_COPERNICUS = "Copernicus DEM GLO-30 (modelo de superficie, 30 m)";
/** Los términos de libre uso del INEGI piden citar la fuente, decir que se transformó y no sugerir su aval. */
export const LICENCIA_INEGI =
  "Fuente: INEGI, Relieve continental, 2016 (por Terrain Tiles de Mapzen en AWS). Términos de " +
  "libre uso de la información del INEGI. Croquis remuestreó los datos; no es una postura del " +
  "INEGI ni cuenta con su aval.";
export const LICENCIA_SRTM =
  "SRTM data courtesy of the U.S. Geological Survey (dominio público), por Terrain Tiles de " +
  "Mapzen en AWS.";
/** El aviso que la licencia de Copernicus pide mostrar cuando los datos se adaptan (artículo 6 b). */
export const LICENCIA_COPERNICUS =
  "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space " +
  "GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved";
/** La frase de no responsabilidad que la licencia de Copernicus pide incluir (artículo 6 c), traducida. */
export const SIN_RESPONSABILIDAD_COPERNICUS =
  "Las organizaciones a cargo del programa Copernicus, por ley o por delegación, no asumen " +
  "ninguna responsabilidad por el uso del Copernicus WorldDEM-30.";

export const RelieveIn = z.object({
  lat: z.coerce.number().min(-84).max(84),
  lon: z.coerce.number().min(-180).max(180),
  /** Lado de la malla, en metros, centrada en el punto. */
  lado_m: z.coerce.number().min(120).max(1500).default(600),
});
export type RelieveConsulta = z.infer<typeof RelieveIn>;

/** La malla, con la forma de `caso3d.relieve` (packages/scene-schema/caso3d.schema.json). */
export interface Relieve {
  id: string;
  origen: { lat: number; lon: number; x: number; y: number };
  resolucion_m: number;
  ancho: number;
  alto: number;
  alturas_m: number[];
  fuente: string;
  licencia: string;
  resolucion_nativa_m: number;
}

export class RelieveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Un mosaico de los Terrain Tiles ya decodificado: 256 × 256 alturas por filas desde el norte. */
export interface Tesela {
  alturas: ArrayLike<number>;
  /** De qué archivos salió, como lo dice su encabezado («mx_lidar/…», «srtm/…»). */
  fuentes: string[];
}

/** Un mosaico de Copernicus GLO-30: su geometría y cómo leer una ventana de pixeles. */
export interface Mosaico {
  /** Longitud y latitud de la esquina superior izquierda del pixel (0, 0). */
  origen: [number, number];
  /** Grados por pixel: (hacia el este, hacia el norte); el segundo es negativo. */
  resolucion: [number, number];
  ancho: number;
  alto: number;
  /** Alturas de la ventana [x0, y0, x1, y1) en pixeles, por filas desde arriba. */
  leer(ventana: [number, number, number, number]): Promise<ArrayLike<number>>;
}

export interface RelieveDeps {
  /** El mosaico (x, y) de los Terrain Tiles en `ZOOM`; null si no existe. */
  tesela(x: number, y: number): Promise<Tesela | null>;
  /**
   * Abre el mosaico de Copernicus de 1° × 1° cuya esquina suroeste es (latSur, lonOeste); null si
   * no existe. Sin esta función, Copernicus no se intenta.
   */
  abrir?(latSur: number, lonOeste: number): Promise<Mosaico | null>;
  /** Cuánto se espera a Copernicus antes de quedarse con el SRTM (ms). */
  esperaCopernicusMs?: number;
}

const rad = (g: number) => (g * Math.PI) / 180;

/** El punto a `este` y `norte` metros de (lat, lon): la misma aproximación local que `@croquis/cesvi`. */
export function desplazar(lat: number, lon: number, este: number, norte: number): [number, number] {
  const k = rad(1) * RADIO_TIERRA_M;
  return [lat + norte / k, lon + este / (k * Math.cos(rad(lat)))];
}

/** Los puntos de la malla (lat, lon), por filas de sur a norte y de oeste a este, y su medio lado en nodos. */
function nodos(c: RelieveConsulta, paso: number): { puntos: [number, number][]; mitad: number } {
  // Un número impar de nodos: el punto de impacto cae en un nodo.
  const mitad = Math.max(2, Math.round(c.lado_m / 2 / paso));
  const puntos: [number, number][] = [];
  for (let j = -mitad; j <= mitad; j++)
    for (let i = -mitad; i <= mitad; i++) puntos.push(desplazar(c.lat, c.lon, i * paso, j * paso));
  return { puntos, mitad };
}

function malla(
  c: RelieveConsulta,
  paso: number,
  mitad: number,
  alturas: number[],
  prefijo: string,
  datos: Pick<Relieve, "fuente" | "licencia" | "resolucion_nativa_m">,
): Relieve {
  if (alturas.some((v) => !Number.isFinite(v)))
    throw new RelieveError("El modelo de elevación no tiene datos en ese lugar.", 404);
  const n = 2 * mitad + 1;
  const centro = alturas[(n * n - 1) / 2]!;
  const [latSO, lonSO] = desplazar(c.lat, c.lon, -mitad * paso, -mitad * paso);
  return {
    id: `${prefijo}-${c.lat.toFixed(5)}-${c.lon.toFixed(5)}-${n}`.replace(/\./g, "_"),
    origen: {
      lat: Math.round(latSO * 1e6) / 1e6,
      lon: Math.round(lonSO * 1e6) / 1e6,
      x: -mitad * paso,
      y: -mitad * paso,
    },
    resolucion_m: paso,
    ancho: n,
    alto: n,
    // Relativas al centro (ahí vale 0), al centímetro.
    alturas_m: alturas.map((v) => Math.round((v - centro) * 100) / 100),
    ...datos,
  };
}

// ---- Terrain Tiles (INEGI LiDAR en México; SRTM donde no hay) ------------------------------------

/** La posición de (lat, lon) en pixeles globales de Web Mercator en `ZOOM`. */
export function pixelGlobal(lat: number, lon: number): [number, number] {
  const n = 2 ** ZOOM * LADO_TESELA;
  return [((lon + 180) / 360) * n, ((1 - Math.asinh(Math.tan(rad(lat))) / Math.PI) / 2) * n];
}

export const urlTesela = (x: number, y: number) => `${BASE_TESELAS}/${ZOOM}/${x}/${y}.png`;

const teselaDe = (ix: number, iy: number) =>
  `${Math.floor(ix / LADO_TESELA)}/${Math.floor(iy / LADO_TESELA)}`;

/** La malla desde los Terrain Tiles, con las fuentes que dicen sus mosaicos. null si falta alguno. */
export async function relieveDeTeselas(
  c: RelieveConsulta,
  deps: Pick<RelieveDeps, "tesela">,
): Promise<{ relieve: Relieve; fuentes: string[] } | null> {
  const { puntos, mitad } = nodos(c, RESOLUCION_M);
  // El valor de un pixel está en su centro: se interpola entre centros.
  const px = puntos.map(([lat, lon]) => {
    const [gx, gy] = pixelGlobal(lat, lon);
    return [gx - 0.5, gy - 0.5] as const;
  });
  const llaves = new Set<string>();
  for (const [gx, gy] of px)
    for (const dx of [0, 1])
      for (const dy of [0, 1]) llaves.add(teselaDe(Math.floor(gx) + dx, Math.floor(gy) + dy));
  const leidas = await Promise.all(
    [...llaves].map(async (k) => {
      const [x, y] = k.split("/").map(Number) as [number, number];
      return [k, await deps.tesela(x, y)] as const;
    }),
  );
  const teselas = new Map<string, Tesela>();
  for (const [k, t] of leidas) {
    if (!t) return null;
    teselas.set(k, t);
  }
  const en = (ix: number, iy: number) => {
    const t = teselas.get(teselaDe(ix, iy))!;
    const col = ix - Math.floor(ix / LADO_TESELA) * LADO_TESELA;
    const fila = iy - Math.floor(iy / LADO_TESELA) * LADO_TESELA;
    return Number(t.alturas[fila * LADO_TESELA + col]);
  };
  const alturas = px.map(([gx, gy]) => {
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const tx = gx - ix;
    const ty = gy - iy;
    return (
      (en(ix, iy) + (en(ix + 1, iy) - en(ix, iy)) * tx) * (1 - ty) +
      (en(ix, iy + 1) + (en(ix + 1, iy + 1) - en(ix, iy + 1)) * tx) * ty
    );
  });
  const fuentes = [...new Set([...teselas.values()].flatMap((t) => t.fuentes))].sort();
  const inegi = fuentes.some((f) => f.startsWith("mx_"));
  const soloInegi = inegi && fuentes.every((f) => f.startsWith("mx_"));
  return {
    fuentes,
    relieve: malla(c, RESOLUCION_M, mitad, alturas, inegi ? "inegi" : "srtm", {
      fuente: soloInegi
        ? FUENTE_INEGI
        : inegi
          ? `${FUENTE_INEGI}; fuera de su cobertura, SRTM (30 m)`
          : FUENTE_SRTM,
      licencia: soloInegi
        ? LICENCIA_INEGI
        : inegi
          ? `${LICENCIA_INEGI} ${LICENCIA_SRTM}`
          : LICENCIA_SRTM,
      resolucion_nativa_m: soloInegi ? 5 : 30,
    }),
  };
}

// ---- Copernicus GLO-30 --------------------------------------------------------------------------

/** El nombre del mosaico de GLO-30 cuya esquina suroeste es (latSur, lonOeste), en grados enteros. */
export function nombreMosaico(latSur: number, lonOeste: number): string {
  const ns = latSur >= 0 ? "N" : "S";
  const ew = lonOeste >= 0 ? "E" : "W";
  const la = String(Math.abs(latSur)).padStart(2, "0");
  const lo = String(Math.abs(lonOeste)).padStart(3, "0");
  return `Copernicus_DSM_COG_10_${ns}${la}_00_${ew}${lo}_00_DEM`;
}

export const urlMosaico = (latSur: number, lonOeste: number) =>
  `${BASE_COG}/${nombreMosaico(latSur, lonOeste)}/${nombreMosaico(latSur, lonOeste)}.tif`;

/** Un lector de alturas por coordenadas que abre cada mosaico una vez y lee la ventana que hace falta. */
async function muestreador(
  abrir: NonNullable<RelieveDeps["abrir"]>,
  puntos: readonly (readonly [number, number])[],
): Promise<((lat: number, lon: number) => number) | null> {
  // Qué mosaicos tocan los puntos y qué ventana de cada uno (con un pixel de margen para interpolar).
  const porMosaico = new Map<
    string,
    { latSur: number; lonOeste: number; pts: [number, number][] }
  >();
  for (const [lat, lon] of puntos) {
    const latSur = Math.floor(lat);
    const lonOeste = Math.floor(lon);
    const llave = `${latSur},${lonOeste}`;
    const m = porMosaico.get(llave) ?? { latSur, lonOeste, pts: [] };
    m.pts.push([lat, lon]);
    porMosaico.set(llave, m);
  }
  const lectores = new Map<string, (lat: number, lon: number) => number>();
  for (const [llave, m] of porMosaico) {
    const mosaico = await abrir(m.latSur, m.lonOeste);
    if (!mosaico) return null;
    const [ox, oy] = mosaico.origen;
    const [rx, ry] = mosaico.resolucion;
    // Centro del pixel (i, j): ox + (i + 0.5)·rx, oy + (j + 0.5)·ry.
    const col = (lon: number) => (lon - ox) / rx - 0.5;
    const fila = (lat: number) => (lat - oy) / ry - 0.5;
    const cols = m.pts.map(([, lon]) => col(lon));
    const filas = m.pts.map(([lat]) => fila(lat));
    const x0 = Math.max(0, Math.floor(Math.min(...cols)));
    const y0 = Math.max(0, Math.floor(Math.min(...filas)));
    const x1 = Math.min(mosaico.ancho, Math.floor(Math.max(...cols)) + 2);
    const y1 = Math.min(mosaico.alto, Math.floor(Math.max(...filas)) + 2);
    const w = x1 - x0;
    const h = y1 - y0;
    const datos = await mosaico.leer([x0, y0, x1, y1]);
    lectores.set(llave, (lat, lon) => {
      // Bilineal dentro de la ventana; en la orilla del mosaico se repite el último pixel.
      const fx = Math.min(Math.max(col(lon) - x0, 0), w - 1);
      const fy = Math.min(Math.max(fila(lat) - y0, 0), h - 1);
      const i = Math.min(Math.floor(fx), Math.max(0, w - 2));
      const j = Math.min(Math.floor(fy), Math.max(0, h - 2));
      const i1 = Math.min(i + 1, w - 1);
      const j1 = Math.min(j + 1, h - 1);
      const tx = fx - i;
      const ty = fy - j;
      const a = Number(datos[j * w + i]);
      const b = Number(datos[j * w + i1]);
      const c = Number(datos[j1 * w + i]);
      const d = Number(datos[j1 * w + i1]);
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    });
  }
  return (lat, lon) => lectores.get(`${Math.floor(lat)},${Math.floor(lon)}`)!(lat, lon);
}

/** La malla desde Copernicus GLO-30, con nodos cada 30 m. null si no hay mosaico para ese lugar. */
export async function relieveDeCopernicus(
  c: RelieveConsulta,
  abrir: NonNullable<RelieveDeps["abrir"]>,
): Promise<Relieve | null> {
  const { puntos, mitad } = nodos(c, RESOLUCION_COPERNICUS_M);
  const altura = await muestreador(abrir, puntos);
  if (!altura) return null;
  return malla(
    c,
    RESOLUCION_COPERNICUS_M,
    mitad,
    puntos.map(([la, lo]) => altura(la, lo)),
    "glo30",
    {
      fuente: FUENTE_COPERNICUS,
      licencia: LICENCIA_COPERNICUS,
      resolucion_nativa_m: RESOLUCION_COPERNICUS_M,
    },
  );
}

// ---- La cadena de fuentes -----------------------------------------------------------------------

/** Entre los dos caben en los 30 s de la función. */
const ESPERA_TESELA_MS = 12_000;
const ESPERA_COPERNICUS_MS = 12_000;

/**
 * La malla de relieve centrada en (lat, lon), por filas de sur a norte y columnas de oeste a este,
 * con alturas relativas al centro. Donde el INEGI tiene LiDAR, de ahí; donde no, de Copernicus
 * GLO-30 y, si no responde, del SRTM de los Terrain Tiles.
 */
export async function armarRelieve(c: RelieveConsulta, deps: RelieveDeps): Promise<Relieve> {
  // Una fuente que falla no tumba a las demás; «sin datos en ese lugar» sí se dice.
  const intentar = async <T>(f: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await f();
    } catch (e) {
      if (e instanceof RelieveError && e.status === 404) throw e;
      return null;
    }
  };
  const teselas = await intentar(() => relieveDeTeselas(c, deps));
  if (teselas?.fuentes.some((f) => f.startsWith("mx_"))) return teselas.relieve;
  const abrir = deps.abrir?.bind(deps);
  const copernicus = abrir
    ? await intentar(() =>
        conLimite(relieveDeCopernicus(c, abrir), deps.esperaCopernicusMs ?? ESPERA_COPERNICUS_MS),
      )
    : null;
  if (copernicus) return copernicus;
  if (teselas) return teselas.relieve;
  throw new RelieveError("No hay modelo de elevación abierto para ese lugar.", 404);
}

/** Cuánto sube el terreno del punto más bajo al más alto de la malla (m). */
export function desnivelM(r: Relieve): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of r.alturas_m) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return Math.round((hi - lo) * 100) / 100;
}

// ---- Lectura real -------------------------------------------------------------------------------

/**
 * Un PNG de 8 bits sin entrelazar, en RGB o RGBA (lo que son los Terrain Tiles): sus pixeles por
 * filas, con `canales` bytes cada uno. Lanza si es de otro tipo.
 */
export function decodificarPng(b: Uint8Array): {
  ancho: number;
  alto: number;
  canales: number;
  datos: Uint8Array;
} {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || firma.some((v, i) => b[i] !== v)) throw new Error("No es un PNG.");
  const vista = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let ancho = 0;
  let alto = 0;
  let canales = 0;
  const partes: Uint8Array[] = [];
  for (let p = 8; p + 12 <= b.length;) {
    const n = vista.getUint32(p);
    const tipo = String.fromCharCode(b[p + 4]!, b[p + 5]!, b[p + 6]!, b[p + 7]!);
    if (tipo === "IHDR") {
      ancho = vista.getUint32(p + 8);
      alto = vista.getUint32(p + 12);
      const profundidad = b[p + 16];
      const color = b[p + 17];
      const entrelazado = b[p + 20];
      if (profundidad !== 8 || (color !== 2 && color !== 6) || entrelazado !== 0)
        throw new Error("PNG de un tipo que no se esperaba.");
      canales = color === 2 ? 3 : 4;
    } else if (tipo === "IDAT") partes.push(b.subarray(p + 8, p + 8 + n));
    else if (tipo === "IEND") break;
    p += 12 + n;
  }
  if (!ancho || !alto || !partes.length) throw new Error("PNG incompleto.");
  const crudo = inflateSync(Buffer.concat(partes));
  const fila = ancho * canales;
  if (crudo.length < (fila + 1) * alto) throw new Error("PNG incompleto.");
  const datos = new Uint8Array(fila * alto);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)]!;
    const o = y * (fila + 1) + 1;
    const d = y * fila;
    for (let x = 0; x < fila; x++) {
      const izq = x >= canales ? datos[d + x - canales]! : 0;
      const arriba = y > 0 ? datos[d - fila + x]! : 0;
      const esquina = y > 0 && x >= canales ? datos[d - fila + x - canales]! : 0;
      let pred = 0;
      if (filtro === 1) pred = izq;
      else if (filtro === 2) pred = arriba;
      else if (filtro === 3) pred = (izq + arriba) >> 1;
      else if (filtro === 4) {
        const pa = Math.abs(arriba - esquina);
        const pb = Math.abs(izq - esquina);
        const pc = Math.abs(izq + arriba - 2 * esquina);
        pred = pa <= pb && pa <= pc ? izq : pb <= pc ? arriba : esquina;
      } else if (filtro !== 0) throw new Error("PNG con un filtro desconocido.");
      datos[d + x] = (crudo[o + x]! + pred) & 255;
    }
  }
  return { ancho, alto, canales, datos };
}

/** Las alturas (m) de un mosaico «terrarium»: (R·256 + G + B/256) − 32768. */
export function alturasTerrarium(png: Uint8Array): Float32Array {
  const { ancho, alto, canales, datos } = decodificarPng(png);
  if (ancho !== LADO_TESELA || alto !== LADO_TESELA)
    throw new Error("El mosaico no mide 256 × 256.");
  const out = new Float32Array(ancho * alto);
  for (let k = 0; k < out.length; k++) {
    const p = k * canales;
    out[k] = datos[p]! * 256 + datos[p + 1]! + datos[p + 2]! / 256 - 32768;
  }
  return out;
}

/** La promesa, o un rechazo si tarda más de `ms`. */
function conLimite<T>(f: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new RelieveError("El modelo de elevación tardó demasiado.", 504)),
      ms,
    );
    f.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e as Error);
      },
    );
  });
}

/** Las fuentes reales: los Terrain Tiles y los COG de Copernicus GLO-30, por HTTP y sin cuenta. */
export function defaultRelieveDeps(pedir: typeof fetch = fetch): RelieveDeps {
  const teselas = new Map<string, Promise<Tesela | null>>();
  const abiertos = new Map<string, Promise<Mosaico | null>>();
  /** Lo guardado se reutiliza; un fallo no se queda guardado. */
  const unaVez = <T>(mapa: Map<string, Promise<T>>, llave: string, f: () => Promise<T>) => {
    let p = mapa.get(llave);
    if (!p) {
      p = f();
      mapa.set(llave, p);
      p.catch(() => mapa.delete(llave));
      // Unos cientos de mosaicos de 260 KB son de sobra para la memoria de una función.
      if (mapa.size > 200) mapa.delete(mapa.keys().next().value!);
    }
    return p;
  };
  return {
    tesela(x, y) {
      const url = urlTesela(x, y);
      return unaVez(teselas, url, async () => {
        const r = await pedir(url, { signal: AbortSignal.timeout(ESPERA_TESELA_MS) });
        // Sin mosaico: S3 contesta 403 o 404.
        if (r.status === 403 || r.status === 404) return null;
        if (!r.ok) throw new RelieveError("El modelo de elevación no respondió.", 502);
        const fuentes = (r.headers.get("x-amz-meta-x-imagery-sources") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return { alturas: alturasTerrarium(new Uint8Array(await r.arrayBuffer())), fuentes };
      });
    },
    abrir(latSur, lonOeste) {
      const url = urlMosaico(latSur, lonOeste);
      return unaVez(abiertos, url, async () => {
        const { fromUrl } = await import("geotiff");
        try {
          const tiff = await fromUrl(url);
          const imagen = await tiff.getImage();
          const [ox, oy] = imagen.getOrigin();
          const [rx, ry] = imagen.getResolution();
          return {
            origen: [ox!, oy!],
            resolucion: [rx!, ry!],
            ancho: imagen.getWidth(),
            alto: imagen.getHeight(),
            async leer(ventana) {
              const [datos] = (await imagen.readRasters({ window: ventana })) as unknown as [
                ArrayLike<number>,
              ];
              return datos;
            },
          } satisfies Mosaico;
        } catch (e) {
          if (e instanceof RelieveError) throw e;
          // Sin mosaico (mar o zona no publicada): S3 contesta 403 o 404.
          if (/40[34]/.test(String((e as Error).message))) return null;
          throw new RelieveError("El modelo de elevación no respondió.", 502);
        }
      });
    },
  };
}
