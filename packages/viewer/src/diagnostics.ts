/**
 * Diagnóstico del visor en pantalla (`?diag=1`; René, 2026-11-04): backend y GPU, nivel de
 * calidad, memoria de texturas estimada, fps, el último error y el motivo de la pérdida del
 * dispositivo. Vive fuera de React (un almacén con suscriptores) para que lo escriban el renderer,
 * el ciclo de dibujo y los límites de error, y lo lean el panel y las evaluaciones
 * (`window.__croquisDiagnostico`).
 */
import type { Material, Object3D, Texture } from "three";
import type { QualityLevel } from "./quality";

export interface DiagError {
  mensaje: string;
  pila?: string;
  /** `performance.now()` del error. */
  cuando: number;
  /** De dónde salió: `dibujo` (ciclo de dibujo), `react` (límite de error), `renderer`, `gpu`. */
  origen: "dibujo" | "react" | "renderer" | "gpu" | "ventana";
}

export interface DiagPerdida {
  api: string;
  mensaje: string;
  motivo: string | null;
  cuando: number;
}

export interface Diagnostico {
  backend: "webgpu" | "webgl2" | null;
  preferencia: string;
  /** Adaptador que reporta WebGPU (`adapter.info`) o la cadena de WebGL (`UNMASKED_RENDERER`). */
  adaptador: string | null;
  calidad: QualityLevel | null;
  /** Factor de resolución efectivo del render. */
  dpr: number;
  /** Tamaño del lienzo en píxeles de dispositivo. */
  lienzo: [number, number] | null;
  /** Memoria de texturas estimada (MB) y conteos del renderer. */
  memoria: MemoriaEstimada | null;
  fps: number | null;
  ultimoError: DiagError | null;
  /** Últimos errores, el más reciente al final (hasta `MAX_ERRORES`). */
  errores: DiagError[];
  perdida: DiagPerdida | null;
  /** Cuántas veces se perdió el dispositivo y cuántas se volvió a crear el visor. */
  perdidas: number;
  recuperaciones: number;
  /** Generación del renderer en pantalla (sube con cada recuperación). */
  generacion: number;
}

export interface MemoriaEstimada {
  /** Texturas de la escena (mapas de materiales y nodos), MB. */
  texturasMB: number;
  /** Cuántas texturas distintas se contaron y cuántas reporta el renderer. */
  texturas: number;
  texturasRenderer: number | null;
  geometriasRenderer: number | null;
  /** Búferes de pantalla: color (con MSAA), profundidad y los pasos de postproceso, MB. */
  pantallaMB: number;
  /** Mapas de sombra (sol/luna y focos), MB. */
  sombrasMB: number;
  totalMB: number;
}

const MAX_ERRORES = 8;

const inicial = (): Diagnostico => ({
  backend: null,
  preferencia: "auto",
  adaptador: null,
  calidad: null,
  dpr: 1,
  lienzo: null,
  memoria: null,
  fps: null,
  ultimoError: null,
  errores: [],
  perdida: null,
  perdidas: 0,
  recuperaciones: 0,
  generacion: 0,
});

let estado: Diagnostico = inicial();
const oyentes = new Set<() => void>();

declare global {
  interface Window {
    __croquisDiagnostico?: Diagnostico;
  }
}

function publicar(): void {
  if (typeof window !== "undefined") window.__croquisDiagnostico = estado;
  for (const fn of oyentes) fn();
}

export function getDiagnostico(): Diagnostico {
  return estado;
}

export function subscribeDiagnostico(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export function updateDiagnostico(cambio: Partial<Diagnostico>): void {
  estado = { ...estado, ...cambio };
  publicar();
}

export function registrarError(origen: DiagError["origen"], err: unknown): DiagError {
  const e: DiagError = {
    mensaje: err instanceof Error ? err.message : String(err),
    ...(err instanceof Error && err.stack ? { pila: err.stack } : {}),
    cuando: typeof performance !== "undefined" ? performance.now() : 0,
    origen,
  };
  const errores = [...estado.errores, e].slice(-MAX_ERRORES);
  updateDiagnostico({ ultimoError: e, errores });
  return e;
}

export function registrarPerdida(info: {
  api: string;
  message?: string;
  reason?: string | null;
}): DiagPerdida {
  const p: DiagPerdida = {
    api: info.api,
    mensaje: info.message ?? "sin mensaje",
    motivo: info.reason ?? null,
    cuando: typeof performance !== "undefined" ? performance.now() : 0,
  };
  updateDiagnostico({ perdida: p, perdidas: estado.perdidas + 1 });
  return p;
}

/** Para las pruebas y al cambiar de escena: vuelve al estado inicial (conserva las pérdidas). */
export function reiniciarDiagnostico(conservar: Partial<Diagnostico> = {}): void {
  estado = { ...inicial(), ...conservar };
  publicar();
}

// ---- memoria estimada -----------------------------------------------------------------------

/** Bytes por texel según el tipo de dato de la textura (three: UnsignedByte, HalfFloat, Float…). */
function bytesPorTexel(t: Texture): number {
  const tipo = (t as { type?: number }).type ?? 1009;
  // UnsignedByteType 1009, HalfFloatType 1016, FloatType 1015 (constantes de three).
  const porCanal = tipo === 1015 ? 4 : tipo === 1016 ? 2 : 1;
  const comprimida = (t as { isCompressedTexture?: boolean }).isCompressedTexture === true;
  // KTX2/BC7/ETC2: ~1 byte por texel (4 bpp) con mipmaps.
  return comprimida ? 1 : 4 * porCanal;
}

function dimensiones(t: Texture): [number, number] | null {
  const img = (t as { image?: unknown }).image as
    { width?: number; height?: number } | { width?: number; height?: number }[] | null | undefined;
  if (!img) return null;
  const uno = Array.isArray(img) ? img[0] : img;
  if (!uno || typeof uno.width !== "number" || typeof uno.height !== "number") return null;
  const caras = Array.isArray(img) ? img.length : 1;
  return [uno.width, uno.height * caras];
}

/** Bytes de una textura con sus mipmaps (×4/3). */
export function bytesDeTextura(t: Texture): number {
  const d = dimensiones(t);
  if (!d) return 0;
  const mip = (t as { generateMipmaps?: boolean }).generateMipmaps === false ? 1 : 4 / 3;
  return Math.round(d[0] * d[1] * bytesPorTexel(t) * mip);
}

function esTextura(v: unknown): v is Texture {
  return typeof v === "object" && v !== null && (v as { isTexture?: boolean }).isTexture === true;
}

/** Texturas distintas alcanzables desde los materiales de la escena (propiedades y nodos TSL). */
export function texturasDe(root: Object3D): Set<Texture> {
  const out = new Set<Texture>();
  const materiales = new Set<Material>();
  root.traverse((o) => {
    const m = (o as { material?: Material | Material[] }).material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) materiales.add(x);
  });
  for (const m of materiales) {
    for (const v of Object.values(m as unknown as Record<string, unknown>)) {
      if (esTextura(v)) out.add(v);
      else if (
        typeof v === "object" &&
        v !== null &&
        (v as { isNode?: boolean }).isNode === true &&
        typeof (v as { traverse?: unknown }).traverse === "function"
      ) {
        (v as { traverse(cb: (n: unknown) => void): void }).traverse((n) => {
          const tn = n as { isTextureNode?: boolean; value?: unknown };
          if (tn.isTextureNode === true && esTextura(tn.value)) out.add(tn.value);
        });
      }
    }
  }
  return out;
}

export interface PantallaParams {
  ancho: number;
  alto: number;
  dpr: number;
  msaaSamples: number;
  /** Pasos de postproceso a resolución completa (bloom, AO, TRAA, DOF, motion blur, SSR). */
  pasosPost: number;
  shadowMapSize: number;
  spotShadowMapSize: number;
  spotShadows: number;
}

/**
 * Memoria de pantalla y sombras (MB), estimada: color RGBA16F (8 B) por muestra de MSAA más la
 * resolución, profundidad 32 bits, cada paso de postproceso otro RGBA16F, sombras en 32 bits.
 */
export function memoriaPantallaMB(p: PantallaParams): { pantallaMB: number; sombrasMB: number } {
  const px = p.ancho * p.dpr * (p.alto * p.dpr);
  const color = px * 8 * Math.max(1, p.msaaSamples) + px * 8;
  const prof = px * 4 * Math.max(1, p.msaaSamples);
  const post = px * 8 * p.pasosPost;
  const sombras = p.shadowMapSize ** 2 * 4 + p.spotShadows * p.spotShadowMapSize ** 2 * 4;
  return { pantallaMB: (color + prof + post) / 1048576, sombrasMB: sombras / 1048576 };
}

export function estimarMemoria(
  root: Object3D,
  pantalla: PantallaParams,
  renderer: { info?: { memory?: { textures?: number; geometries?: number } } } | null,
): MemoriaEstimada {
  const texturas = texturasDe(root);
  let bytes = 0;
  for (const t of texturas) bytes += bytesDeTextura(t);
  const { pantallaMB, sombrasMB } = memoriaPantallaMB(pantalla);
  const texturasMB = bytes / 1048576;
  return {
    texturasMB: Math.round(texturasMB * 10) / 10,
    texturas: texturas.size,
    texturasRenderer: renderer?.info?.memory?.textures ?? null,
    geometriasRenderer: renderer?.info?.memory?.geometries ?? null,
    pantallaMB: Math.round(pantallaMB * 10) / 10,
    sombrasMB: Math.round(sombrasMB * 10) / 10,
    totalMB: Math.round((texturasMB + pantallaMB + sombrasMB) * 10) / 10,
  };
}
