"use client";
/**
 * La firma de Croquis al entrar a un acto (prompt §5, con los cambios de René del 2026-11-04):
 *
 * 1. una cortina del color de fondo cubre el recorrido;
 * 2. la C del símbolo aparece trazándose (de izquierda a derecha, con `clip-path`);
 * 3. el número del acto en mono y su nombre en Instrument Serif suben desde una máscara;
 * 4. la mira naranja golpea (escala 0 → 1.25 → 1) y suelta un anillo;
 * 5. la cortina sube (`clip-path`) y deja ver el acto, que ya estaba montado debajo.
 *
 * Completa (≈ 1.4 s) al entrar al caso y al presentar; corta (≤ 500 ms) entre actos al trabajar. Solo
 * anima `transform`, `opacity` y `clip-path`: nada de tareas largas ni de relayout. Con
 * `prefers-reduced-motion` o con «Transiciones» apagado no se monta.
 */
import { useEffect } from "react";

/** Duración total de la completa (ms) y factor de la corta (la corta dura ≤ 500 ms). */
export const DURACION_COMPLETA_MS = 1420;
export const FACTOR_CORTA = 0.35;

export function duracionTransicion(larga: boolean): number {
  return Math.round(DURACION_COMPLETA_MS * (larga ? 1 : FACTOR_CORTA));
}

export function TransicionActo({
  numero,
  nombre,
  larga,
  onFin,
}: {
  numero: number;
  nombre: string;
  larga: boolean;
  onFin: () => void;
}) {
  const f = larga ? 1 : FACTOR_CORTA;
  useEffect(() => {
    const t = window.setTimeout(onFin, duracionTransicion(larga));
    return () => window.clearTimeout(t);
  }, [larga, onFin]);
  const ms = (x: number) => `${Math.round(x * f)}ms`;
  return (
    <div
      className="transicion-acto"
      aria-hidden="true"
      data-testid="transicion-acto"
      data-larga={larga ? "si" : "no"}
      style={
        {
          "--ta-trazo-inicio": ms(80),
          "--ta-trazo": ms(620),
          "--ta-titulo-inicio": ms(220),
          "--ta-titulo": ms(600),
          "--ta-golpe-inicio": ms(600),
          "--ta-golpe": ms(420),
          "--ta-anillo": ms(700),
          "--ta-sube-inicio": ms(860),
          "--ta-sube": ms(560),
        } as React.CSSProperties
      }
    >
      <div className="flex flex-col items-center gap-6">
        <svg viewBox="0 0 120 120" className="h-24 w-24 overflow-visible">
          <g className="ta-trazo">
            <path
              d="M91.11 28.89 A44 44 0 1 0 91.11 91.11"
              fill="none"
              stroke="currentColor"
              strokeWidth="13"
              strokeDasharray="52 25.6"
            />
          </g>
          <circle
            className="ta-anillo"
            cx="100"
            cy="60"
            r="12"
            fill="none"
            stroke="var(--senal)"
            strokeWidth="2"
          />
          <path
            className="ta-mira"
            d="M91 51 L109 69 M109 51 L91 69"
            fill="none"
            stroke="var(--senal)"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
        <div className="flex flex-col items-center gap-1 overflow-hidden">
          <span className="ta-titulo t-rotulo cifras">Acto {numero}</span>
          <span className="ta-titulo ta-nombre">{nombre}</span>
        </div>
      </div>
    </div>
  );
}
