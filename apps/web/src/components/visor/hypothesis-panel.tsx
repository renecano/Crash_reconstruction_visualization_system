"use client";

import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { compareHypotheses, GHOST_COLORS, MAX_HYPOTHESES } from "@croquis/viewer";
import { useState } from "react";
import { textos } from "@/i18n";
import { useTextos } from "@/i18n/cliente";
import { reconstruirEnNavegador } from "@/lib/reconstruct-client";
import { fmtNumber } from "@/lib/format-number";

const fmt = fmtNumber;

const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

const T = textos(
  {
    titulo: "Comparar hipótesis",
    vehiculo: "Vehículo",
    yaSi: "¿Y si iba a…? (km/h)",
    agregar: "Agregar hipótesis",
    reconstruyendo: "Reconstruyendo…",
    lleno: (max: number) =>
      `Se comparan hasta ${max} hipótesis a la vez; quita una para agregar otra.`,
    rango: "Escribe una velocidad entre 0 y 200 km/h.",
    fallo: (detalle: string) => `No se pudo reconstruir la hipótesis: ${detalle}`,
    etiqueta: (rol: string, kmh: string) => `${rol} a ${kmh} km/h`,
    leyenda:
      "Cada hipótesis se ve como vehículos translúcidos de su color sobre la escena. A la izquierda de cada flecha, la reconstrucción principal.",
    hipotesis: "Hipótesis",
    velocidadImpacto: "Velocidad al impacto",
    deltaV: "ΔV",
    posicionFinal: "Posición final",
    fantasma: (color: string) => ` (fantasma ${color})`,
    colores: ["azul", "naranja", "violeta"],
    quitar: "Quitar",
    queda: (m: string) => `queda a ${m} m`,
  },
  {
    titulo: "Compare hypotheses",
    vehiculo: "Vehicle",
    yaSi: "What if it was going…? (km/h)",
    agregar: "Add hypothesis",
    reconstruyendo: "Reconstructing…",
    lleno: (max: number) =>
      `Up to ${max} hypotheses are compared at a time; remove one to add another.`,
    rango: "Enter a speed between 0 and 200 km/h.",
    fallo: (detalle: string) => `The hypothesis could not be reconstructed: ${detalle}`,
    etiqueta: (rol: string, kmh: string) => `${rol} at ${kmh} km/h`,
    leyenda:
      "Each hypothesis shows as translucent vehicles in its color over the scene. Left of each arrow, the main reconstruction.",
    hipotesis: "Hypothesis",
    velocidadImpacto: "Impact speed",
    deltaV: "ΔV",
    posicionFinal: "Final position",
    fantasma: (color: string) => ` (${color} ghost)`,
    colores: ["blue", "orange", "violet"],
    quitar: "Remove",
    queda: (m: string) => `ends up ${m} m away`,
  },
);

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

const TH = "t-nota py-2 pr-3 align-bottom font-normal";
const TD = "py-2 pr-3 align-top";

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
  const t = useTextos(T);
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
      setError(t.rango);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resultadoH = await reconstructor(withSpeed(spec, vehicleId, value));
      const rol = spec.vehiculos.find((v) => v.id === vehicleId)?.rol ?? vehicleId;
      onChange([...hipotesis, { etiqueta: t.etiqueta(rol, fmt(value)), resultado: resultadoH }]);
      setKmh("");
    } catch (e) {
      setError(t.fallo(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={t.titulo}
      data-testid="hipotesis"
      className="t-interfaz flex flex-col gap-4"
    >
      <h3 className="t-subtitulo">{t.titulo}</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="t-nota">{t.vehiculo}</span>
          <select
            className="campo w-auto"
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
          <span className="t-nota">{t.yaSi}</span>
          <input
            data-testid="hipotesis-velocidad"
            inputMode="decimal"
            className="campo cifras w-28"
            value={kmh}
            onChange={(e) => setKmh(e.target.value)}
          />
        </label>
        <button
          type="button"
          data-testid="hipotesis-comparar"
          disabled={busy || !kmh || full}
          onClick={() => void add()}
          className="boton-secundario"
        >
          {busy ? t.reconstruyendo : t.agregar}
        </button>
      </div>
      {full ? <p className="t-nota">{t.lleno(MAX_HYPOTHESES)}</p> : null}
      {error ? (
        <p role="alert" className="border-l-2 border-texto pl-3 text-texto">
          {error}
        </p>
      ) : null}
      {hipotesis.length > 0 ? (
        <div className="overflow-x-auto">
          <table data-testid="hipotesis-diferencias" className="w-full border-collapse text-left">
            <caption className="t-nota mb-2 text-left">{t.leyenda}</caption>
            <thead>
              <tr className="border-b border-linea">
                <th className={TH}>{t.hipotesis}</th>
                <th className={TH}>{t.vehiculo}</th>
                <th className={TH}>{t.velocidadImpacto}</th>
                <th className={TH}>{t.deltaV}</th>
                <th className={TH}>{t.posicionFinal}</th>
              </tr>
            </thead>
            {hipotesis.map((h, i) => {
              const color = GHOST_COLORS[i % GHOST_COLORS.length]!;
              const diffs = compareHypotheses(resultado, h.resultado);
              return (
                <tbody key={`${h.etiqueta}-${i}`} data-testid={`hipotesis-${i}`}>
                  {diffs.map((d, j) => (
                    <tr key={d.id} className="border-b border-linea">
                      {j === 0 ? (
                        <th scope="rowgroup" rowSpan={diffs.length} className={`${TD} font-normal`}>
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="inline-block h-3 w-3 rounded-control"
                              style={{ backgroundColor: css(color) }}
                            />
                            <span className="cifras">
                              {h.etiqueta}
                              <span className="sr-only">{t.fantasma(t.colores[i] ?? "")}</span>
                            </span>
                          </span>
                          <button
                            type="button"
                            className="t-nota mt-1 underline hover:text-texto"
                            onClick={() => onChange(hipotesis.filter((_, k) => k !== i))}
                          >
                            {t.quitar}
                          </button>
                        </th>
                      ) : null}
                      <td className={TD}>{d.rol}</td>
                      <td className={`${TD} cifras`}>
                        {fmt(d.v_impacto_kmh[0])} → {fmt(d.v_impacto_kmh[1])} km/h
                      </td>
                      <td className={`${TD} cifras`}>
                        {fmt(d.delta_v_kmh[0])} → {fmt(d.delta_v_kmh[1])} km/h
                      </td>
                      <td className={`${TD} cifras`}>{t.queda(fmt(d.separacion_reposo_m, 1))}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      ) : null}
    </section>
  );
}
