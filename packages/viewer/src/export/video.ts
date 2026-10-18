/**
 * Video de la reconstrucción (F9, PLAN §7.9, ADR 0031): MP4 o WebM dibujado cuadro por cuadro con la
 * marca de reconstrucción ilustrativa (PLAN §10) en cada cuadro y en los metadatos del archivo.
 *
 * Con WebCodecs se usa Mediabunny (MPL-2.0): cada cuadro se dibuja en su instante exacto, así que el
 * video no pierde cuadros aunque la máquina no llegue a esos fps. Sin un codificador disponible, el
 * respaldo es MediaRecorder (WebM); su grabación se vuelve a fechar cuadro por cuadro.
 */
import { legendLines, legendString, type LegendInfo } from "@croquis/scene-schema";
import type { ViewerExportApi } from "./capture";
import { drawLegendBand } from "./legend-band";

export type VideoFormat = "mp4" | "webm";

export interface VideoOptions {
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
  legend: LegendInfo;
  /** Intervalo (s); por omisión, toda la reconstrucción. */
  tStart?: number;
  tEnd?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface VideoResult {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
  /** Códec usado ("avc", "vp9"…) o "mediarecorder". */
  codec: string;
  frames: number;
  /** Cuadros que el navegador no grabó (solo con MediaRecorder; WebCodecs no pierde cuadros). */
  dropped?: number;
}

/** Códecs a probar, en orden de preferencia, para cada contenedor. */
export const CODECS: Record<VideoFormat, readonly ("avc" | "hevc" | "vp9" | "av1" | "vp8")[]> = {
  // H.264 primero: es el que abre cualquier reproductor.
  mp4: ["avc", "hevc", "vp9", "av1"],
  webm: ["vp9", "vp8", "av1"],
};

/** Instantes de cada cuadro: de t0 a t1 a `fps` (sin pasar de t1). */
export function frameTimes(t0: number, t1: number, fps: number): number[] {
  const n = Math.floor((t1 - t0) * fps + 1e-9) + 1;
  return Array.from({ length: n }, (_, i) => t0 + i / fps);
}

/** Lienzo donde se compone cada cuadro con la franja de la marca. */
function compositor(width: number, height: number, legend: LegendInfo) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No hay contexto 2D para componer el video");
  const lines = legendLines(legend);
  return {
    canvas,
    draw(frame: HTMLCanvasElement) {
      ctx.drawImage(frame, 0, 0, width, height);
      drawLegendBand(ctx, width, height, lines);
    },
  };
}

/** ¿Puede este navegador codificar video con WebCodecs? */
export function hasWebCodecs(): boolean {
  return typeof globalThis.VideoEncoder === "function";
}

/** Video con WebCodecs y Mediabunny. Devuelve null si no hay códec para ese contenedor. */
export async function encodeWithWebCodecs(
  api: ViewerExportApi,
  opts: VideoOptions,
): Promise<VideoResult | null> {
  if (!hasWebCodecs()) return null;
  const mb = await import("mediabunny");
  const codec = await mb.getFirstEncodableVideoCodec([...CODECS[opts.format]], {
    width: opts.width,
    height: opts.height,
    bitrate: mb.QUALITY_HIGH,
  });
  if (!codec) return null;
  const times = frameTimes(opts.tStart ?? api.tStart, opts.tEnd ?? api.tEnd, opts.fps);
  const comp = compositor(opts.width, opts.height, opts.legend);
  const format =
    opts.format === "mp4"
      ? new mb.Mp4OutputFormat({ fastStart: "in-memory" })
      : new mb.WebMOutputFormat();
  const output = new mb.Output({ format, target: new mb.BufferTarget() });
  const source = new mb.CanvasSource(comp.canvas, {
    codec,
    bitrate: mb.QUALITY_HIGH,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: opts.fps });
  output.setMetadataTags({
    title: "Croquis — reconstrucción ilustrativa",
    description: legendString(opts.legend),
    comment: legendString(opts.legend),
  });
  await output.start();
  try {
    await api.captureSequence(
      times,
      { width: opts.width, height: opts.height },
      async (frame, i) => {
        comp.draw(frame); // antes del primer await: el lienzo del visor aún tiene el cuadro
        await source.add(i / opts.fps, 1 / opts.fps);
        opts.onProgress?.(i + 1, times.length);
      },
      opts.signal,
    );
    await output.finalize();
  } catch (e) {
    await output.cancel();
    throw e;
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("El video quedó vacío");
  return {
    bytes: new Uint8Array(buffer),
    mimeType: await output.getMimeType(),
    codec,
    frames: times.length,
  };
}

/**
 * Vuelve a fechar un WebM de MediaRecorder: copia sus paquetes (sin recodificar) a un WebM nuevo con
 * el cuadro k en k/fps y agrega la marca en los metadatos. MediaRecorder fecha con el reloj de la
 * pared; si la máquina dibujó más lento que `fps`, el video original duraría de más.
 */
export async function retimeWebm(
  webm: Uint8Array,
  fps: number,
  legend: LegendInfo,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; packets: number }> {
  const mb = await import("mediabunny");
  const input = new mb.Input({
    formats: mb.ALL_FORMATS,
    source: new mb.BufferSource(webm.slice().buffer),
  });
  const track = await input.getPrimaryVideoTrack();
  const codec = track?.codec;
  if (!track || !codec) throw new Error("La grabación no tiene video.");
  const decoderConfig = await track.getDecoderConfig();
  if (!decoderConfig) throw new Error("No se reconoce el códec de la grabación.");
  const output = new mb.Output({
    format: new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });
  const source = new mb.EncodedVideoPacketSource(codec);
  output.addVideoTrack(source, { frameRate: fps });
  output.setMetadataTags({
    title: "Croquis — reconstrucción ilustrativa",
    description: legendString(legend),
    comment: legendString(legend),
  });
  await output.start();
  let k = 0;
  // VP8/VP9 no reordenan cuadros: el orden de decodificación es el de presentación.
  for await (const packet of new mb.EncodedPacketSink(track).packets()) {
    await source.add(
      packet.clone({ timestamp: k / fps, duration: 1 / fps }),
      k === 0 ? { decoderConfig } : undefined,
    );
    k++;
  }
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("El video quedó vacío");
  return { bytes: new Uint8Array(buffer), packets: k };
}

/**
 * Respaldo sin WebCodecs: MediaRecorder graba el lienzo compuesto (WebM), un cuadro por periodo de
 * 1/fps como mínimo, y después se vuelve a fechar cuadro por cuadro (`retimeWebm`).
 */
export async function recordWithMediaRecorder(
  api: ViewerExportApi,
  opts: VideoOptions,
): Promise<VideoResult> {
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  if (!mimeType) throw new Error("Este navegador no puede grabar video.");
  const times = frameTimes(opts.tStart ?? api.tStart, opts.tEnd ?? api.tEnd, opts.fps);
  const comp = compositor(opts.width, opts.height, opts.legend);
  const stream = comp.canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  if (!track) throw new Error("No se pudo capturar el lienzo.");
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: Math.round(opts.width * opts.height * opts.fps * 0.1),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  const period = 1000 / opts.fps;
  try {
    await api.captureSequence(
      times,
      { width: opts.width, height: opts.height },
      async (frame, i) => {
        comp.draw(frame);
        track.requestFrame();
        opts.onProgress?.(i + 1, times.length);
        // Un periodo completo después de cada cuadro, aunque dibujarlo haya tardado: MediaRecorder
        // codifica en tiempo real y, con la CPU ocupada, puede soltar un cuadro si el siguiente
        // llega antes de que termine.
        await new Promise((r) => setTimeout(r, period));
      },
      opts.signal,
    );
  } finally {
    // Margen para que el último cuadro llegue al codificador antes de detener la grabación.
    await new Promise((r) => setTimeout(r, 2 * period));
    recorder.stop();
    await stopped;
    track.stop();
  }
  const recorded = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
  const { bytes, packets } = await retimeWebm(recorded, opts.fps, opts.legend);
  return {
    bytes,
    mimeType: "video/webm",
    codec: "mediarecorder",
    frames: packets,
    dropped: times.length - packets,
  };
}

/**
 * Video de la reconstrucción: WebCodecs si el navegador codifica ese contenedor; si no, WebM con
 * MediaRecorder (un MP4 sin WebCodecs no es posible: se avisa).
 */
export async function renderVideo(api: ViewerExportApi, opts: VideoOptions): Promise<VideoResult> {
  const encoded = await encodeWithWebCodecs(api, opts);
  if (encoded) return encoded;
  if (opts.format === "mp4") {
    throw new Error("Este navegador no puede codificar MP4. Elige WebM.");
  }
  return recordWithMediaRecorder(api, opts);
}
