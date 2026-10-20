"use client";
/**
 * Lecturas de telemetría sobre la escena (PLAN §11.4): por vehículo, la rapidez en el instante que
 * se ve y su cambio de velocidad (ΔV) con el intervalo de Monte Carlo cuando ya está calculado.
 * Se suscriben al reloj aquí y no en el visor, para no redibujar los paneles 15 veces por segundo.
 */
import type { Resultado } from "@croquis/scene-schema";
import type { TimelineState, ViewerClock } from "@croquis/viewer";
import { useSyncExternalStore } from "react";
import { textos } from "@/i18n";
import { useTextos } from "@/i18n/cliente";
import { fmtNumber } from "@/lib/format-number";
import { velocidadEn } from "@/lib/telemetria";

const T = textos(
  {
    etiqueta: "Lecturas de cada vehículo",
    vehiculo: (rol: string) => `Vehículo ${rol}`,
    rapidez: "rapidez",
    dv: "ΔV",
    intervalo: (a: string, b: string) => `80 %: ${a}–${b}`,
  },
  {
    etiqueta: "Readouts for each vehicle",
    vehiculo: (rol: string) => `Vehicle ${rol}`,
    rapidez: "speed",
    dv: "ΔV",
    intervalo: (a: string, b: string) => `80%: ${a}–${b}`,
  },
);

const nullSnapshot = (): null => null;
const noopSubscribe = () => () => undefined;

export function useClockState(clock: ViewerClock | null): TimelineState | null {
  return useSyncExternalStore(
    clock ? clock.subscribe : noopSubscribe,
    clock ? clock.get : nullSnapshot,
    nullSnapshot,
  );
}

export function Lecturas({ clock, resultado }: { clock: ViewerClock; resultado: Resultado }) {
  const t = useTextos(T);
  const state = useClockState(clock);
  if (!state) return null;
  const inc = new Map((resultado.incertidumbre?.vehiculos ?? []).map((v) => [v.id, v]));
  const vehiculos = resultado.vehiculos.filter((v) => v.involucrado);
  return (
    <section
      aria-label={t.etiqueta}
      data-testid="lecturas"
      className="vidrio pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-6 gap-y-2 px-4 py-3"
    >
      {vehiculos.map((v) => {
        const r = inc.get(v.id)?.delta_v_kmh;
        return (
          <div key={v.id} className="flex flex-col" data-testid={`lectura-${v.id}`}>
            <span className="t-nota text-texto">{t.vehiculo(v.rol)}</span>
            <span className="t-cota text-2xl leading-tight text-texto">
              {fmtNumber(velocidadEn(v.trayectoria, state.t), 0)}
              <span className="t-nota ml-1">km/h</span>
            </span>
            <span className="t-nota cifras">
              {t.dv} {fmtNumber(v.delta_v_kmh, 0)} km/h
              {r ? ` · ${t.intervalo(fmtNumber(r.p10, 0), fmtNumber(r.p90, 0))}` : ""}
            </span>
          </div>
        );
      })}
    </section>
  );
}
