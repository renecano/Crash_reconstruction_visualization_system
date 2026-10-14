"use client";

import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { compareHypotheses } from "@croquis/viewer";
import { useState } from "react";
import { API_URL } from "@/lib/relato-api";

const fmt = (v: number, d = 0) =>
  v.toLocaleString("es-MX", { maximumFractionDigits: d, minimumFractionDigits: d });

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
  hipotesis: Resultado | null;
  onHipotesis: (r: Resultado | null) => void;
  fetcher?: typeof fetch;
}

/**
 * Comparar hipótesis (PLAN §7): "¿y si iba a 60 en vez de 40?". El servidor reconstruye la escena
 * con la otra velocidad y el visor la sobrepone como fantasmas; aquí se muestra la diferencia.
 */
export function HypothesisPanel({
  spec,
  resultado,
  hipotesis,
  onHipotesis,
  fetcher = fetch,
}: HypothesisPanelProps) {
  const moving = spec.vehiculos.filter(
    (v) => !["detenido", "estacionado"].includes(v.maniobra.valor),
  );
  const [vehicleId, setVehicleId] = useState(moving[0]?.id ?? "");
  const [kmh, setKmh] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (moving.length === 0) return null;

  const compare = async () => {
    const value = Number(kmh.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 200) {
      setError("Escribe una velocidad entre 0 y 200 km/h.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetcher(`${API_URL}/reconstruir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: withSpeed(spec, vehicleId, value) }),
      });
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}.`);
      onHipotesis((await res.json()) as Resultado);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? `No se pudo conectar con el servidor de Croquis en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(false);
    }
  };

  const diffs = hipotesis ? compareHypotheses(resultado, hipotesis) : [];
  return (
    <section
      aria-label="Comparar hipótesis"
      data-testid="hipotesis"
      className="flex flex-col gap-3 text-sm"
    >
      <h3 className="font-semibold">Comparar otra hipótesis</h3>
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
          disabled={busy || !kmh}
          onClick={() => void compare()}
          className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {busy ? "Reconstruyendo…" : "Comparar"}
        </button>
        {hipotesis ? (
          <button
            type="button"
            className="rounded border border-neutral-400 px-3 py-1"
            onClick={() => onHipotesis(null)}
          >
            Quitar hipótesis
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {diffs.length > 0 ? (
        <table data-testid="hipotesis-diferencias" className="w-full border-collapse text-left">
          <caption className="mb-1 text-left text-xs text-neutral-600 dark:text-neutral-400">
            La hipótesis se ve como vehículos azules translúcidos sobre la escena.
          </caption>
          <thead>
            <tr className="border-b border-neutral-300 dark:border-neutral-700">
              <th className="py-1 pr-3">Vehículo</th>
              <th className="py-1 pr-3">Velocidad al impacto</th>
              <th className="py-1 pr-3">ΔV</th>
              <th className="py-1">Posición final</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.id} className="border-b border-neutral-200 dark:border-neutral-800">
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
        </table>
      ) : null}
    </section>
  );
}
