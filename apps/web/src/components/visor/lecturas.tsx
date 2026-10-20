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
    ahora: "ahora",
    intervalo: (a: string, b: string) => `(${a}–${b}, 80 %)`,
  },
  {
    etiqueta: "Readouts for each vehicle",
    vehiculo: (rol: string) => `Vehicle ${rol}`,
    rapidez: "speed",
    dv: "ΔV",
    ahora: "now",
    intervalo: (a: string, b: string) => `(${a}–${b}, 80%)`,
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

export function Lecturas({
  clock,
  resultado,
  lado = "izquierda",
}: {
  clock: ViewerClock;
  resultado: Resultado;
  /** Esquina donde va el panel (en la portada, a la derecha: el texto ocupa la izquierda). */
  lado?: "izquierda" | "derecha";
}) {
  const t = useTextos(T);
  const state = useClockState(clock);
  if (!state) return null;
  const inc = new Map((resultado.incertidumbre?.vehiculos ?? []).map((v) => [v.id, v]));
  const vehiculos = resultado.vehiculos.filter((v) => v.involucrado);
  return (
    <section
      aria-label={t.etiqueta}
      data-testid="lecturas"
      className={`vidrio pointer-events-none absolute top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-x-5 gap-y-1 px-3 py-2 md:top-3 md:gap-x-6 md:gap-y-2 md:px-4 md:py-3 ${
        lado === "derecha" ? "right-2 md:right-3" : "left-2 md:left-3"
      }`}
    >
      {vehiculos.map((v) => {
        const r = inc.get(v.id)?.delta_v_kmh;
        return (
          <div key={v.id} className="flex flex-col" data-testid={`lectura-${v.id}`}>
            <span className="t-nota text-texto">{t.vehiculo(v.rol)}</span>
            <span className="t-cota text-xl leading-tight text-texto md:text-2xl">
              {fmtNumber(velocidadEn(v.trayectoria, state.t), 0)}
              <span className="t-nota ml-1">km/h {t.ahora}</span>
            </span>
            <span className="t-nota cifras">
              {t.dv} {fmtNumber(v.delta_v_kmh, 0)} km/h
              {r ? ` ${t.intervalo(fmtNumber(r.p10, 0), fmtNumber(r.p90, 0))}` : ""}
            </span>
          </div>
        );
      })}
    </section>
  );
}
