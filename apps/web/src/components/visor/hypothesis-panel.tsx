"use client";

import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { compareHypotheses, GHOST_COLORS, MAX_HYPOTHESES } from "@croquis/viewer";
import { useState } from "react";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import { fmtNumber } from "@/lib/format-number";

const fmt = fmtNumber;

const COLOR_NAMES = ["azul", "naranja", "violeta"] as const;
const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Una hipótesis: la escena con otra velocidad previa para un vehículo, ya reconstruida. */
export interface Hipotesis {
  etiqueta: string;
  resultado: Resultado;
}

/** Escena con otra velocidad previa para un vehículo (lo demás igual). */
export function withSpeed(spec: EscenaSpec, vehicleId: string, kmh: number): EscenaSpec {
  const next = structuredClone(spec);
  const v = next.vehiculos.find((x) => x.id === vehicleId);
  if (v) {
    v.velocidad_previa = { valor: kmh, unidad: "km/h", fuente: "usuario", confianza: 0.9 };
  }
  return next;
}

export interface HypothesisPanelProps {
  spec: EscenaSpec;
  resultado: Resultado;
  hipotesis: readonly Hipotesis[];
  onChange: (h: Hipotesis[]) => void;
  /** Reconstruye una escena (por omisión, el solver TS en un Web Worker). */
  reconstructor?: (spec: EscenaSpec) => Promise<Resultado>;
}

/**
 * Comparar hipótesis (PLAN §7.6): "¿y si iba a 60 en vez de 40?". El solver TS reconstruye la
 * escena con la otra velocidad en el navegador (Web Worker, sin servidor) y el visor la sobrepone
 * como fantasmas de color; aquí se muestra la diferencia contra la reconstrucción principal. Hasta
 * `MAX_HYPOTHESES` a la vez.
 */
export function HypothesisPanel({
  spec,
  resultado,
  hipotesis,
  onChange,
  reconstructor = reconstruirEnNavegador,
}: HypothesisPanelProps) {
  const moving = spec.vehiculos.filter(
    (v) => !["detenido", "estacionado"].includes(v.maniobra.valor),
  );
  const [vehicleId, setVehicleId] = useState(moving[0]?.id ?? "");
  const [kmh, setKmh] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (moving.length === 0) return null;
  const full = hipotesis.length >= MAX_HYPOTHESES;

  const add = async () => {
    const value = Number(kmh.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 200) {
      setError("Escribe una velocidad entre 0 y 200 km/h.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resultadoH = await reconstructor(withSpeed(spec, vehicleId, value));
      const rol = spec.vehiculos.find((v) => v.id === vehicleId)?.rol ?? vehicleId;
      onChange([...hipotesis, { etiqueta: `${rol} a ${fmt(value)} km/h`, resultado: resultadoH }]);
      setKmh("");
    } catch (e) {
      setError(
        `No se pudo reconstruir la hipótesis: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Comparar hipótesis"
      data-testid="hipotesis"
      className="flex flex-col gap-3 text-sm"
    >
      <h3 className="font-semibold">Comparar hipótesis</h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span>Vehículo</span>
          <select
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-neutral-900"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          >
            {moving.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rol}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>¿Y si iba a…? (km/h)</span>
          <input
            data-testid="hipotesis-velocidad"
            inputMode="decimal"
            className="w-24 rounded border border-neutral-300 bg-white px-2 py-1 text-neutral-900"
            value={kmh}
            onChange={(e) => setKmh(e.target.value)}
          />
        </label>
        <button
          type="button"
          data-testid="hipotesis-comparar"
          disabled={busy || !kmh || full}
          onClick={() => void add()}
          className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {busy ? "Reconstruyendo…" : "Agregar hipótesis"}
        </button>
      </div>
      {full ? (
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Se comparan hasta {MAX_HYPOTHESES} hipótesis a la vez; quita una para agregar otra.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {hipotesis.length > 0 ? (
        <table data-testid="hipotesis-diferencias" className="w-full border-collapse text-left">
          <caption className="mb-1 text-left text-xs text-neutral-600 dark:text-neutral-400">
            Cada hipótesis se ve como vehículos translúcidos de su color sobre la escena. A la
            izquierda de cada flecha, la reconstrucción principal.
          </caption>
          <thead>
            <tr className="border-b border-neutral-300 dark:border-neutral-700">
              <th className="py-1 pr-3">Hipótesis</th>
              <th className="py-1 pr-3">Vehículo</th>
              <th className="py-1 pr-3">Velocidad al impacto</th>
              <th className="py-1 pr-3">ΔV</th>
              <th className="py-1">Posición final</th>
            </tr>
          </thead>
          {hipotesis.map((h, i) => {
            const color = GHOST_COLORS[i % GHOST_COLORS.length]!;
            const diffs = compareHypotheses(resultado, h.resultado);
            return (
              <tbody key={`${h.etiqueta}-${i}`} data-testid={`hipotesis-${i}`}>
                {diffs.map((d, j) => (
                  <tr key={d.id} className="border-b border-neutral-200 dark:border-neutral-800">
                    {j === 0 ? (
                      <th scope="rowgroup" rowSpan={diffs.length} className="py-1 pr-3 align-top">
                        <span className="flex items-center gap-2 font-normal">
                          <span
                            aria-hidden
                            className="inline-block h-3 w-3 rounded-sm"
                            style={{ backgroundColor: css(color) }}
                          />
                          <span>
                            {h.etiqueta}
                            <span className="sr-only"> (fantasma {COLOR_NAMES[i]})</span>
                          </span>
                        </span>
                        <button
                          type="button"
                          className="mt-1 text-xs underline"
                          onClick={() => onChange(hipotesis.filter((_, k) => k !== i))}
                        >
                          Quitar
                        </button>
                      </th>
                    ) : null}
                    <td className="py-1 pr-3">{d.rol}</td>
                    <td className="py-1 pr-3">
                      {fmt(d.v_impacto_kmh[0])} → {fmt(d.v_impacto_kmh[1])} km/h
                    </td>
                    <td className="py-1 pr-3">
                      {fmt(d.delta_v_kmh[0])} → {fmt(d.delta_v_kmh[1])} km/h
                    </td>
                    <td className="py-1">queda a {fmt(d.separacion_reposo_m, 1)} m</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      ) : null}
    </section>
  );
}
