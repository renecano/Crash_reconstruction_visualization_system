"use client";
/**
 * Línea de tiempo como traza de telemetría (PLAN §11.4): la rapidez de cada vehículo en el tiempo
 * con los marcadores de eventos (inicio de frenado, impacto, reposo), reproducir, cámara lenta y
 * cuadro por cuadro. Hacer clic en la traza lleva a ese instante; el deslizador debajo hace lo
 * mismo con el teclado. La traza sale de la trayectoria del solver (`lib/telemetria.ts`).
 */
import type { Resultado } from "@croquis/scene-schema";
import {
  PLAYBACK_SPEEDS,
  type EventMarker,
  type PlaybackSpeed,
  type TimelineState,
} from "@croquis/viewer";
import { useMemo, useRef } from "react";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { etiquetaEvento, formatTime, trazaVelocidad } from "@/lib/telemetria";

const T = textos(
  {
    etiqueta: "Línea de tiempo",
    anterior: "Cuadro anterior",
    siguiente: "Cuadro siguiente",
    reproducir: "Reproducir",
    pausar: "Pausar",
    velocidad: "Velocidad de reproducción",
    tiempo: "Tiempo de la escena (0 es el impacto)",
    traza: "Rapidez de cada vehículo en el tiempo",
    eje: "km/h",
    vehiculo: (rol: string) => `Vehículo ${rol}`,
    eventos: "Ir a un momento",
  },
  {
    etiqueta: "Timeline",
    anterior: "Previous frame",
    siguiente: "Next frame",
    reproducir: "Play",
    pausar: "Pause",
    velocidad: "Playback speed",
    tiempo: "Scene time (0 is the impact)",
    traza: "Speed of each vehicle over time",
    eje: "km/h",
    vehiculo: (rol: string) => `Vehicle ${rol}`,
    eventos: "Go to a moment",
  },
);

/** Estilo de trazo por vehículo: se distinguen por la forma de la línea, no solo por el color. */
const TRAZOS = [
  { color: "var(--texto)", dash: "" },
  { color: "var(--texto-2)", dash: "10 6" },
  { color: "var(--texto-2)", dash: "3 5" },
  { color: "var(--texto-3)", dash: "14 4 3 4" },
];

const W = 1000;
const H = 120;
const PAD = { l: 44, r: 16, t: 10, b: 22 };

export interface TrazaProps {
  state: TimelineState;
  markers: EventMarker[];
  vehiculos: Resultado["vehiculos"];
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onStep: (frames: number) => void;
  onSpeed: (s: PlaybackSpeed) => void;
}

export function Traza({
  state,
  markers,
  vehiculos,
  onTogglePlay,
  onSeek,
  onStep,
  onSpeed,
}: TrazaProps) {
  const { lang } = useIdioma();
  const t = useTextos(T);
  const svg = useRef<SVGSVGElement>(null);
  const { tStart, tEnd } = state;
  const series = useMemo(
    () =>
      vehiculos.map((v) => ({ rol: v.rol, puntos: trazaVelocidad(v.trayectoria, tStart, tEnd) })),
    [vehiculos, tStart, tEnd],
  );
  const vMax = Math.max(
    10,
    Math.ceil(Math.max(...series.flatMap((s) => s.puntos.map((p) => p.v)), 0) / 10) * 10,
  );
  const x = (tt: number) => PAD.l + ((tt - tStart) / (tEnd - tStart)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / vMax) * (H - PAD.t - PAD.b);
  const ticks: number[] = [];
  for (let k = Math.ceil(tStart); k <= Math.floor(tEnd); k++) ticks.push(k);

  const seekDesdePuntero = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const fx = ((clientX - r.left) / r.width) * W;
    const tt = tStart + ((fx - PAD.l) / (W - PAD.l - PAD.r)) * (tEnd - tStart);
    onSeek(Math.min(tEnd, Math.max(tStart, tt)));
  };

  return (
    <section aria-label={t.etiqueta} className="flex flex-col gap-3" data-testid="traza">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="boton-secundario min-h-11 px-3"
          aria-label={t.anterior}
        >
          <span aria-hidden="true">◀︎|</span>
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          className="boton-secundario min-h-11 px-4"
          aria-label={state.playing ? t.pausar : t.reproducir}
        >
          {state.playing ? t.pausar : t.reproducir}
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          className="boton-secundario min-h-11 px-3"
          aria-label={t.siguiente}
        >
          <span aria-hidden="true">|▶︎</span>
        </button>
        <label className="t-nota ml-2 flex items-center gap-2">
          {t.velocidad}
          <select
            value={state.speed}
            onChange={(e) => onSpeed(Number(e.target.value) as PlaybackSpeed)}
            className="campo min-h-11 w-auto py-1"
          >
            {PLAYBACK_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <output className="t-cota ml-auto text-xl" data-testid="tiempo" aria-live="off">
          {formatTime(state.t)}
        </output>
      </div>

      <figure className="m-0">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-32 w-full cursor-crosshair touch-none"
          role="img"
          aria-label={t.traza}
          onPointerDown={(e) => {
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            seekDesdePuntero(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seekDesdePuntero(e.clientX);
          }}
          preserveAspectRatio="none"
        >
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--linea)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {ticks.map((k) => (
            <g key={k}>
              <line
                x1={x(k)}
                x2={x(k)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="var(--linea)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {markers.map((m) => (
            <line
              key={m.id}
              x1={x(m.t)}
              x2={x(m.t)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke={m.tipo.startsWith("impacto") ? "var(--evidencia)" : "var(--texto-3)"}
              strokeWidth={m.tipo.startsWith("impacto") ? 2 : 1}
              strokeDasharray={m.tipo.startsWith("impacto") ? "" : "4 4"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series.map((s, i) => (
            <polyline
              key={s.rol}
              points={s.puntos.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={TRAZOS[i % TRAZOS.length]!.color}
              strokeDasharray={TRAZOS[i % TRAZOS.length]!.dash}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={x(state.t)}
            x2={x(state.t)}
            y1={0}
            y2={H}
            stroke="var(--texto)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <figcaption className="t-nota mt-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <span className="flex flex-wrap gap-x-5">
            {series.map((s, i) => (
              <span key={s.rol} className="inline-flex items-center gap-2">
                <svg width="28" height="6" aria-hidden="true">
                  <line
                    x1="0"
                    x2="28"
                    y1="3"
                    y2="3"
                    stroke={TRAZOS[i % TRAZOS.length]!.color}
                    strokeWidth="2"
                    strokeDasharray={TRAZOS[i % TRAZOS.length]!.dash}
                  />
                </svg>
                {t.vehiculo(s.rol)}
              </span>
            ))}
          </span>
          <span className="cifras">
            0–{vMax} {t.eje} · {formatTime(tStart)} … {formatTime(tEnd)}
          </span>
        </figcaption>
      </figure>

      <input
        type="range"
        min={state.tStart}
        max={state.tEnd}
        step={state.dt}
        value={state.t}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label={t.tiempo}
        aria-valuetext={formatTime(state.t)}
        className="h-11 w-full cursor-pointer accent-[var(--accion)]"
      />
      <nav aria-label={t.eventos}>
        <ul className="t-nota flex flex-wrap gap-x-4 gap-y-1">
          {markers.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="min-h-11 underline underline-offset-4 hover:text-texto"
                onClick={() => onSeek(m.t)}
              >
                {etiquetaEvento(m, lang)} ({formatTime(m.t)})
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
