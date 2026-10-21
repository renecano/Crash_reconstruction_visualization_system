"use client";

import type { EscenaSpec, LegendInfo, Resultado } from "@croquis/scene-schema";
import {
  framePng,
  renderVideo,
  type VideoFormat,
  type ViewerClock,
  type ViewerExportApi,
} from "@croquis/viewer";
import { useRef, useState } from "react";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { downloadBytes, safeName } from "@/lib/download";
import { informePdf } from "@/lib/informe";
import { leyendaIdioma } from "@/lib/textos-resultado";

/** Resoluciones de los cuadros: la del visor o un tamaño fijo (16:9). */
const RESOLUCIONES = [
  { value: "pantalla", label: null },
  { value: "1280x720", label: "1280 × 720" },
  { value: "1920x1080", label: "1920 × 1080" },
  { value: "3840x2160", label: "3840 × 2160" },
] as const;
type Resolucion = (typeof RESOLUCIONES)[number]["value"];

function tamaño(r: Resolucion): { width?: number; height?: number } {
  if (r === "pantalla") return {};
  const [w, h] = r.split("x").map(Number);
  return { width: w, height: h };
}

/** Tamaños del video (16:9; H.264 pide lados pares). */
const TAMAÑOS_VIDEO = [
  { value: "1280x720", label: "1280 × 720" },
  { value: "1920x1080", label: "1920 × 1080" },
  { value: "3840x2160", label: "3840 × 2160" },
] as const;
type TamañoVideo = (typeof TAMAÑOS_VIDEO)[number]["value"];
const FPS = [24, 30, 60] as const;

const T = textos(
  {
    titulo: "Exportar",
    ayuda:
      "Se genera en este dispositivo y lleva la marca de reconstrucción ilustrativa, la semilla y el hash de entradas.",
    tamanoCuadro: "Tamaño del cuadro",
    delVisor: "La del visor",
    png: "Cuadro PNG del instante actual",
    glb: "Escena glTF con animación",
    informe: "Informe PDF",
    esperaResultado: "Espera el resultado completo",
    video: "Video",
    tamano: "Tamaño",
    fps: "Cuadros por segundo",
    videoCompleto: "Video de toda la reconstrucción",
    cancelar: "Cancelar",
    avance: "Avance del video",
    generandoCuadro: "Generando el cuadro",
    generandoGlb: "Generando la escena glTF",
    generandoVideo: "Generando el video",
    generandoInforme: "Generando el informe",
    noListo: "El visor aún no está listo.",
    resultadoNoListo: "El resultado completo aún no está listo.",
    listo: (archivo: string) => `Listo: ${archivo}`,
    listoVideo: (archivo: string, cuadros: number, codec: string, perdidos: number) =>
      `Listo: ${archivo} (${cuadros} cuadros, ${codec}${perdidos ? `; el navegador no grabó ${perdidos}` : ""})`,
    cancelado: "Video cancelado.",
  },
  {
    titulo: "Export",
    ayuda:
      "It is generated on this device and carries the illustrative reconstruction notice, the seed and the input hash.",
    tamanoCuadro: "Frame size",
    delVisor: "Same as the viewer",
    png: "PNG frame of the current instant",
    glb: "glTF scene with animation",
    informe: "PDF report",
    esperaResultado: "Wait for the full result",
    video: "Video",
    tamano: "Size",
    fps: "Frames per second",
    videoCompleto: "Video of the whole reconstruction",
    cancelar: "Cancel",
    avance: "Video progress",
    generandoCuadro: "Generating the frame",
    generandoGlb: "Generating the glTF scene",
    generandoVideo: "Generating the video",
    generandoInforme: "Generating the report",
    noListo: "The viewer is not ready yet.",
    resultadoNoListo: "The full result is not ready yet.",
    listo: (archivo: string) => `Done: ${archivo}`,
    listoVideo: (archivo: string, cuadros: number, codec: string, perdidos: number) =>
      `Done: ${archivo} (${cuadros} frames, ${codec}${perdidos ? `; the browser did not record ${perdidos}` : ""})`,
    cancelado: "Video canceled.",
  },
);

export interface ExportPanelProps {
  api: ViewerExportApi | null;
  clock: ViewerClock | null;
  legend: LegendInfo;
  /** Base del nombre de los archivos (la escena). */
  nombre: string;
  /** Datos del informe PDF; `completo` es false mientras llega el resultado completo. */
  informe?: {
    spec: EscenaSpec;
    resultado: Resultado | null;
    supuestosEntorno: string[];
    completo: boolean;
  };
}

/**
 * Exportaciones del visor (F9, PLAN §7.9): cuadro PNG, video (MP4 o WebM) y escena glTF, generados
 * en el navegador y siempre con la marca de reconstrucción ilustrativa (PLAN §10).
 */
export function ExportPanel({ api, clock, legend: legendEs, nombre, informe }: ExportPanelProps) {
  const { lang } = useIdioma();
  const t = useTextos(T);
  // La marca de los archivos va en el idioma de la página (en español, la de siempre).
  const legend = leyendaIdioma(legendEs, lang);
  const [resolucion, setResolucion] = useState<Resolucion>("pantalla");
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [formato, setFormato] = useState<VideoFormat>("mp4");
  const [tamañoVideo, setTamañoVideo] = useState<TamañoVideo>("1920x1080");
  const [fps, setFps] = useState<(typeof FPS)[number]>(30);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const cancelar = useRef<AbortController | null>(null);
  const base = safeName(nombre);

  const run = async (label: string, work: () => Promise<string>) => {
    setOcupado(true);
    setError(null);
    setEstado(`${label}…`);
    try {
      setEstado(await work());
    } catch (e) {
      setEstado(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const png = () =>
    run(t.generandoCuadro, async () => {
      if (!api) throw new Error(t.noListo);
      const instante = clock?.get().t ?? api.tStart;
      const frame = api.captureFrame({ t: instante, ...tamaño(resolucion) });
      const bytes = await framePng(frame, legend);
      const file = `croquis-${base}-t${instante.toFixed(2)}s-${frame.width}x${frame.height}.png`;
      downloadBytes(bytes, file, "image/png");
      return t.listo(file);
    });

  const glb = () =>
    run(t.generandoGlb, async () => {
      if (!api) throw new Error(t.noListo);
      const bytes = await api.exportGlb(legend);
      const file = `croquis-${base}.glb`;
      downloadBytes(bytes, file, "model/gltf-binary");
      return t.listo(file);
    });

  const video = () =>
    run(t.generandoVideo, async () => {
      if (!api) throw new Error(t.noListo);
      const [width, height] = tamañoVideo.split("x").map(Number) as [number, number];
      const ctrl = new AbortController();
      cancelar.current = ctrl;
      try {
        const r = await renderVideo(api, {
          format: formato,
          width,
          height,
          fps,
          legend,
          signal: ctrl.signal,
          onProgress: (hechos, total) => setProgreso({ hechos, total }),
        });
        const ext = formato === "mp4" ? "mp4" : "webm";
        const file = `croquis-${base}-${width}x${height}-${fps}fps.${ext}`;
        downloadBytes(r.bytes, file, r.mimeType.split(";")[0]!);
        return t.listoVideo(file, r.frames, r.codec, r.dropped ?? 0);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return t.cancelado;
        throw e;
      } finally {
        cancelar.current = null;
        setProgreso(null);
      }
    });

  const reporte = () =>
    run(t.generandoInforme, async () => {
      if (!informe?.resultado || !informe.completo) {
        throw new Error(t.resultadoNoListo);
      }
      const bytes = await informePdf(
        informe.spec,
        informe.resultado,
        informe.supuestosEntorno,
        lang,
      );
      const file = `informe-${base}.pdf`;
      downloadBytes(bytes, file, "application/pdf");
      return t.listo(file);
    });

  const disabled = !api || ocupado;
  const informeListo = !!informe?.resultado && informe.completo;
  return (
    <section
      aria-label={t.titulo}
      data-testid="exportar"
      className="t-interfaz flex flex-col gap-4"
    >
      <h2 className="t-subtitulo">{t.titulo}</h2>
      <p className="t-nota">{t.ayuda}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="t-nota">{t.tamanoCuadro}</span>
          <select
            value={resolucion}
            onChange={(e) => setResolucion(e.target.value as Resolucion)}
            className="campo cifras w-auto"
            data-testid="export-resolucion"
          >
            {RESOLUCIONES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label ?? t.delVisor}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="export-png"
          disabled={disabled}
          onClick={() => void png()}
          className="boton-secundario"
        >
          {t.png}
        </button>
        <button
          type="button"
          data-testid="export-glb"
          disabled={disabled}
          onClick={() => void glb()}
          className="boton-secundario"
        >
          {t.glb}
        </button>
        {informe ? (
          <button
            type="button"
            data-testid="export-informe"
            disabled={ocupado || !informeListo}
            title={informeListo ? undefined : t.esperaResultado}
            onClick={() => void reporte()}
            className="boton-secundario"
          >
            {t.informe}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-linea pt-4">
        <label className="flex flex-col gap-1">
          <span className="t-nota">{t.video}</span>
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value as VideoFormat)}
            className="campo w-auto max-w-full"
            data-testid="export-video-formato"
          >
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-nota">{t.tamano}</span>
          <select
            value={tamañoVideo}
            onChange={(e) => setTamañoVideo(e.target.value as TamañoVideo)}
            className="campo cifras w-auto"
            data-testid="export-video-tamano"
          >
            {TAMAÑOS_VIDEO.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-nota">{t.fps}</span>
          <select
            value={fps}
            onChange={(e) => setFps(Number(e.target.value) as (typeof FPS)[number])}
            className="campo cifras w-auto"
            data-testid="export-video-fps"
          >
            {FPS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="export-video"
          disabled={disabled}
          onClick={() => void video()}
          className="boton-secundario"
        >
          {t.videoCompleto}
        </button>
        {progreso ? (
          <button
            type="button"
            data-testid="export-video-cancelar"
            onClick={() => cancelar.current?.abort()}
            className="boton-secundario"
          >
            {t.cancelar}
          </button>
        ) : null}
      </div>
      {progreso ? (
        <progress
          data-testid="export-progreso"
          aria-label={t.avance}
          max={progreso.total}
          value={progreso.hechos}
          className="w-full accent-texto"
        />
      ) : null}
      {estado ? (
        <p role="status" data-testid="export-estado" className="t-nota cifras text-texto">
          {estado}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          data-testid="export-error"
          className="border-l-2 border-texto pl-3 text-texto"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
