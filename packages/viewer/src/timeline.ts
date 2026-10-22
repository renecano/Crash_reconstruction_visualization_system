/**
 * Estado de reproducción de la línea de tiempo (puro y determinista).
 *
 * El tiempo de la escena corre de `t_inicio` a `t_fin` del resultado; t = 0 es el impacto. La
 * velocidad de reproducción admite cámara lenta; avanzar cuadro por cuadro usa el dt del solver.
 */
export const PLAYBACK_SPEEDS = [0.1, 0.25, 0.5, 1] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface TimelineState {
  t: number;
  tStart: number;
  tEnd: number;
  dt: number;
  playing: boolean;
  speed: PlaybackSpeed;
  loop: boolean;
}

export interface EventMarker {
  id: string;
  tipo: string;
  t: number;
  etiqueta: string;
  /** En una carambola (más de un impacto), el número del impacto en orden: 1, 2… (ADR 0066). */
  numero?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function createTimeline(
  tStart: number,
  tEnd: number,
  dt: number,
  opts: Partial<Pick<TimelineState, "t" | "playing" | "speed" | "loop">> = {},
): TimelineState {
  if (!(tEnd > tStart) || !(dt > 0)) throw new Error("Intervalo o dt inválidos");
  return {
    tStart,
    tEnd,
    dt,
    t: clamp(opts.t ?? tStart, tStart, tEnd),
    playing: opts.playing ?? false,
    speed: opts.speed ?? 1,
    loop: opts.loop ?? false,
  };
}

/** Avanza con el tiempo real transcurrido (s); se detiene al final salvo que haya bucle. */
export function advance(s: TimelineState, wallSeconds: number): TimelineState {
  if (!s.playing || wallSeconds <= 0) return s;
  const next = s.t + wallSeconds * s.speed;
  if (next < s.tEnd) return { ...s, t: next };
  if (s.loop) {
    const span = s.tEnd - s.tStart;
    return { ...s, t: s.tStart + ((next - s.tStart) % span) };
  }
  return { ...s, t: s.tEnd, playing: false };
}

export function seek(s: TimelineState, t: number): TimelineState {
  return { ...s, t: clamp(t, s.tStart, s.tEnd) };
}

/** Avanza o retrocede `frames` cuadros del solver y pausa. */
export function step(s: TimelineState, frames: number): TimelineState {
  const k = Math.round((s.t - s.tStart) / s.dt) + frames;
  return { ...s, playing: false, t: clamp(s.tStart + k * s.dt, s.tStart, s.tEnd) };
}

export function togglePlay(s: TimelineState): TimelineState {
  if (s.playing) return { ...s, playing: false };
  const restart = s.t >= s.tEnd - 1e-9 ? s.tStart : s.t;
  return { ...s, t: restart, playing: true };
}

export function setSpeed(s: TimelineState, speed: PlaybackSpeed): TimelineState {
  return { ...s, speed };
}

const LABELS: Record<string, string> = {
  inicio_frenado: "Inicio de frenado",
  impacto_vehiculo_vehiculo: "Impacto",
  impacto_vehiculo_objeto: "Impacto",
  impacto_vehiculo_persona: "Impacto",
  reposo: "Reposo",
};

/**
 * Marcadores de eventos para la barra de tiempo, ordenados y dentro del intervalo. Si hay más de un
 * impacto (carambola, ADR 0066), van numerados en orden: «Impacto 1», «Impacto 2»…
 */
export function eventMarkers(
  eventos: readonly { id: string; tipo: string; t: number; actores: readonly string[] }[],
  tStart: number,
  tEnd: number,
  rolDe: (id: string) => string | undefined = () => undefined,
): EventMarker[] {
  const markers: EventMarker[] = eventos
    .filter((e) => e.t >= tStart - 1e-9 && e.t <= tEnd + 1e-9)
    .map((e) => {
      const base = LABELS[e.tipo] ?? e.tipo;
      const named = e.tipo === "inicio_frenado" || e.tipo === "reposo";
      const who = named ? rolDe(e.actores[0] ?? "") : undefined;
      return { id: e.id, tipo: e.tipo, t: e.t, etiqueta: who ? `${base} (${who})` : base };
    })
    .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const impactos = markers.filter((m) => m.tipo.startsWith("impacto_"));
  if (impactos.length > 1) {
    impactos.forEach((m, k) => {
      m.numero = k + 1;
      m.etiqueta = `${m.etiqueta} ${k + 1}`;
    });
  }
  return markers;
}

/** Tiempo relativo al impacto, p. ej. "−1.24 s", "0.00 s" o "+0.50 s". */
export function formatTime(t: number): string {
  const v = Math.abs(t) < 0.005 ? 0 : t;
  const sign = v < 0 ? "−" : v > 0 ? "+" : "";
  return `${sign}${Math.abs(v).toFixed(2)} s`;
}
