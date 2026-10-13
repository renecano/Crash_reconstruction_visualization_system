"use client";

import {
  formatTime,
  PLAYBACK_SPEEDS,
  type EventMarker,
  type PlaybackSpeed,
  type TimelineState,
} from "@croquis/viewer";

export interface TimelineBarProps {
  state: TimelineState;
  markers: EventMarker[];
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onStep: (frames: number) => void;
  onSpeed: (s: PlaybackSpeed) => void;
}

const SPEED_LABEL: Record<PlaybackSpeed, string> = {
  0.1: "0.1×",
  0.25: "0.25×",
  0.5: "0.5×",
  1: "1×",
};

/** Barra de tiempo: reproducir, cámara lenta, cuadro por cuadro y marcadores de eventos. */
export function TimelineBar({
  state,
  markers,
  onTogglePlay,
  onSeek,
  onStep,
  onSpeed,
}: TimelineBarProps) {
  const span = state.tEnd - state.tStart;
  const pct = (t: number) => `${(((t - state.tStart) / span) * 100).toFixed(3)}%`;
  return (
    <div className="flex flex-col gap-2" aria-label="Línea de tiempo">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="rounded border border-neutral-400 px-2 py-1 text-sm"
          aria-label="Cuadro anterior"
        >
          ◀︎|
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          className="rounded bg-neutral-900 px-3 py-1 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          aria-label={state.playing ? "Pausar" : "Reproducir"}
        >
          {state.playing ? "Pausar" : "Reproducir"}
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          className="rounded border border-neutral-400 px-2 py-1 text-sm"
          aria-label="Cuadro siguiente"
        >
          |▶︎
        </button>
        <label className="ml-2 flex items-center gap-1 text-sm">
          Velocidad
          <select
            value={state.speed}
            onChange={(e) => onSpeed(Number(e.target.value) as PlaybackSpeed)}
            className="rounded border border-neutral-400 bg-transparent px-1 py-0.5"
          >
            {PLAYBACK_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {SPEED_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <output className="ml-auto font-mono text-sm" data-testid="tiempo" aria-live="off">
          {formatTime(state.t)}
        </output>
      </div>
      <div className="relative pt-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-5">
          {markers.map((m) => (
            <span
              key={m.id}
              title={`${m.etiqueta} · ${formatTime(m.t)}`}
              className={`absolute top-0 h-4 w-0.5 -translate-x-1/2 ${
                m.tipo.startsWith("impacto") ? "bg-amber-500" : "bg-neutral-500"
              }`}
              style={{ left: pct(m.t) }}
            />
          ))}
        </div>
        <input
          type="range"
          min={state.tStart}
          max={state.tEnd}
          step={state.dt}
          value={state.t}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Tiempo de la escena (0 es el impacto)"
          className="w-full"
        />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        {markers.map((m) => (
          <li key={m.id}>
            <button type="button" className="underline" onClick={() => onSeek(m.t)}>
              {m.etiqueta} ({formatTime(m.t)})
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
