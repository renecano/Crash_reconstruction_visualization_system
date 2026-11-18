/**
 * «Descargar video» del 3D de Unity (René, 2026-11-18, B7): la reproducción completa con la cámara
 * elegida, en MP4 (H.264) a 1920×1080, con la leyenda ilustrativa (la dibuja Unity en el lienzo) y el
 * logo de Croquis en la esquina.
 *
 * Cuadro por cuadro, no en tiempo real: para cada instante se lleva Unity a ese tiempo
 * (`fijarTiempo`), se espera a que lo dibuje y se toma el cuadro del lienzo (`captureStream`). Así el
 * video sale fluido aunque la máquina no llegue a 30 fps. Lo codifica WebCodecs con Mediabunny
 * (MPL-2.0, ya en el stack, ADR 0031), como el video del visor three.js. Funciona en Chrome y Edge.
 */

export const ANCHO_VIDEO = 1920;
export const ALTO_VIDEO = 1080;
export const FPS_VIDEO = 30;

/** Los instantes de cada cuadro, de `inicio` a `fin` a `fps` (sin pasar de `fin`). */
export function instantesDelVideo(inicio: number, fin: number, fps = FPS_VIDEO): number[] {
  if (!(fin > inicio)) return [inicio];
  const n = Math.floor((fin - inicio) * fps + 1e-9) + 1;
  return Array.from({ length: n }, (_, i) => inicio + i / fps);
}

/** «Faltan 40 s», «Falta 1 min 5 s», «Casi listo», a partir de lo que llevan los cuadros hechos. */
export function textoFalta(hechos: number, total: number, msTranscurridos: number): string {
  if (hechos <= 0) return "Calculando cuánto falta…";
  const restante = ((total - hechos) * msTranscurridos) / hechos / 1000;
  if (restante < 2) return "Casi listo";
  const s = Math.ceil(restante);
  if (s < 60) return `Faltan ${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m === 1 && r === 0 ? "Falta" : "Faltan"} ${m} min${r ? ` ${r} s` : ""}`;
}

/** «croquis-axa-a2010930-cinematica.mp4»: sin acentos ni espacios. */
export function nombreDelVideo(caso: string, camara: string | null): string {
  const limpio = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  return `croquis-${[limpio(caso) || "caso", camara ? limpio(camara) : ""].filter(Boolean).join("-")}.mp4`;
}

/** ¿Puede este navegador hacer el MP4? (WebCodecs y leer cuadros del lienzo: Chrome y Edge). */
export function puedeGrabarVideo(): boolean {
  const g = globalThis as Record<string, unknown>;
  return (
    typeof g.VideoEncoder === "function" &&
    typeof g.MediaStreamTrackProcessor === "function" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

export class VideoNoDisponible extends Error {}

interface Procesador {
  readable: ReadableStream<VideoFrame>;
}
type ConstructorProcesador = new (o: { track: MediaStreamTrack }) => Procesador;

export interface OpcionesGrabacion {
  /** El lienzo de Unity, ya al tamaño del video. */
  lienzo: HTMLCanvasElement;
  /** Lleva Unity a ese instante (pausado). */
  fijar: (t: number) => void;
  inicio: number;
  fin: number;
  /** El logo (blanco, fondo transparente) para la esquina; null sin logo. */
  logo: HTMLImageElement | null;
  /** Lo que dice la leyenda: va en los metadatos del archivo. */
  leyenda: string;
  /**
   * El crédito de lo que se ve en el piso (ronda 4: el mapa de OpenStreetMap en el modo «mapa
   * real»), abajo a la derecha de cada cuadro. Sin él, nada.
   */
  credito?: string | null;
  alProgreso?: (hechos: number, total: number, ms: number) => void;
  signal?: AbortSignal;
}

/** Espera la siguiente vuelta del navegador. */
const vuelta = () => new Promise<void>((ok) => requestAnimationFrame(() => ok()));

/** Graba el MP4. Rechaza con `VideoNoDisponible` si el navegador no puede codificar H.264. */
export async function grabarVideoUnity(o: OpcionesGrabacion): Promise<Blob> {
  if (!puedeGrabarVideo())
    throw new VideoNoDisponible("Este navegador no puede grabar el video: usa Chrome o Edge.");
  const mb = await import("mediabunny");
  const codec = await mb.getFirstEncodableVideoCodec(["avc"], {
    width: ANCHO_VIDEO,
    height: ALTO_VIDEO,
    bitrate: mb.QUALITY_HIGH,
  });
  if (!codec) throw new VideoNoDisponible("Este navegador no tiene codificador H.264 para el MP4.");

  // El lienzo donde se compone cada cuadro: el de Unity a 1920×1080 y el logo.
  const comp = document.createElement("canvas");
  comp.width = ANCHO_VIDEO;
  comp.height = ALTO_VIDEO;
  const ctx = comp.getContext("2d");
  if (!ctx) throw new VideoNoDisponible("No hay contexto 2D para componer el video.");

  // Los cuadros del lienzo de Unity, según los va dibujando.
  const pista = o.lienzo.captureStream().getVideoTracks()[0];
  if (!pista) throw new VideoNoDisponible("El lienzo del 3D no entrega cuadros.");
  const Proc = (globalThis as unknown as { MediaStreamTrackProcessor: ConstructorProcesador })
    .MediaStreamTrackProcessor;
  const lector = new Proc({ track: pista }).readable.getReader();
  let ultimo: VideoFrame | null = null;
  let llegados = 0;
  let leyendo = true;
  const lectura = (async () => {
    while (leyendo) {
      const { value, done } = await lector.read();
      if (done || !value) break;
      ultimo?.close();
      ultimo = value;
      llegados++;
    }
  })();
  /** Espera `n` cuadros nuevos del lienzo (Unity ya dibujó el instante pedido). */
  const esperarCuadros = async (n: number) => {
    const meta = llegados + n;
    const limite = performance.now() + 3000;
    while (llegados < meta && performance.now() < limite) await vuelta();
  };

  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new mb.BufferTarget(),
  });
  const source = new mb.CanvasSource(comp, {
    codec,
    bitrate: mb.QUALITY_HIGH,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: FPS_VIDEO });
  output.setMetadataTags({
    title: "Croquis — reconstrucción ilustrativa",
    description: o.leyenda,
    comment: o.leyenda,
  });
  const instantes = instantesDelVideo(o.inicio, o.fin);
  const empezo = performance.now();
  await output.start();
  try {
    for (let i = 0; i < instantes.length; i++) {
      if (o.signal?.aborted) throw new DOMException("Grabación cancelada", "AbortError");
      o.fijar(instantes[i]!);
      // Dos cuadros: el primero puede ser del instante anterior.
      await esperarCuadros(i === 0 ? 4 : 2);
      const cuadro = ultimo as VideoFrame | null;
      if (!cuadro) throw new VideoNoDisponible("El 3D no dibujó ningún cuadro.");
      dibujar(ctx, cuadro, o.logo, o.credito ?? null);
      await source.add(i / FPS_VIDEO, 1 / FPS_VIDEO);
      o.alProgreso?.(i + 1, instantes.length, performance.now() - empezo);
    }
    await output.finalize();
  } catch (e) {
    await output.cancel();
    throw e;
  } finally {
    leyendo = false;
    pista.stop();
    await lector.cancel().catch(() => undefined);
    await lectura.catch(() => undefined);
    (ultimo as VideoFrame | null)?.close();
  }
  const bytes = output.target.buffer;
  if (!bytes) throw new VideoNoDisponible("El video quedó vacío.");
  return new Blob([bytes], { type: "video/mp4" });
}

/** El cuadro llenando 1920×1080 (sin deformar) y el logo arriba a la derecha, con su sombra. */
function dibujar(
  ctx: CanvasRenderingContext2D,
  cuadro: VideoFrame,
  logo: HTMLImageElement | null,
  credito: string | null = null,
) {
  const w = cuadro.displayWidth;
  const h = cuadro.displayHeight;
  const k = Math.max(ANCHO_VIDEO / w, ALTO_VIDEO / h);
  const dw = w * k;
  const dh = h * k;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  ctx.drawImage(cuadro, (ANCHO_VIDEO - dw) / 2, (ALTO_VIDEO - dh) / 2, dw, dh);
  if (logo && logo.naturalWidth > 0) {
    const alto = 44;
    const ancho = (logo.naturalWidth / logo.naturalHeight) * alto;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 12;
    ctx.drawImage(logo, ANCHO_VIDEO - ancho - 48, 40, ancho, alto);
    ctx.restore();
  }
  if (credito) {
    ctx.save();
    ctx.font = "500 20px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#fff";
    ctx.fillText(credito, ANCHO_VIDEO - 48, ALTO_VIDEO - 28);
    ctx.restore();
  }
}
