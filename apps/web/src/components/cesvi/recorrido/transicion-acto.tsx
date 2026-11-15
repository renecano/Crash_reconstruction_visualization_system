"use client";
/**
 * La firma de Croquis al entrar a un acto (prompt §5, con los cambios de René del 2026-11-04):
 *
 * 1. una cortina del color de fondo cubre el recorrido;
 * 2. la C del símbolo aparece trazándose (de izquierda a derecha, con `clip-path`). El símbolo es el
 *    de `assets/brand/marca.json`, la única fuente del logo: aquí se dibuja en línea porque se anima;
 * 3. el número del acto en mono y su nombre en Instrument Serif suben desde una máscara;
 * 4. la mira naranja golpea (escala 0 → 1.25 → 1) y suelta un anillo;
 * 5. la cortina sube (`clip-path`) y deja ver el acto, que ya estaba montado debajo.
 *
 * Completa (≈ 1.4 s) al entrar al caso y al presentar; corta (≤ 500 ms) entre actos al trabajar. Solo
 * anima `transform`, `opacity` y `clip-path`: nada de tareas largas ni de relayout. Con
 * `prefers-reduced-motion` o con «Transiciones» apagado no se monta.
 */
import { useEffect } from "react";
import MARCA from "../../../../../../assets/brand/marca.json";

const SIMBOLO = MARCA.simbolo;
const [MX, MY] = MARCA.mira as [number, number];
type Raya = [number, number, number, number];

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
        <svg
          viewBox={`0 0 ${MARCA.lienzo} ${MARCA.lienzo}`}
          className="h-24 w-24 overflow-visible"
          data-marca="marca.json"
        >
          <g className="ta-trazo" fill="none" stroke="currentColor">
            <path d={MARCA.arco} strokeWidth={SIMBOLO.arco_grosor} />
            <path
              d={SIMBOLO.interior.d}
              strokeWidth={SIMBOLO.interior.grosor}
              opacity={SIMBOLO.interior.opacidad}
              strokeDasharray={SIMBOLO.interior.guiones}
            />
          </g>
          <circle
            className="ta-anillo"
            cx={MX}
            cy={MY}
            r={SIMBOLO.mira.radio + 2.4}
            fill="none"
            stroke="var(--senal)"
            strokeWidth="1"
          />
          <g className="ta-mira" fill="none" stroke="var(--senal)">
            <circle cx={MX} cy={MY} r={SIMBOLO.mira.radio} strokeWidth={SIMBOLO.mira.grosor} />
            {(SIMBOLO.mira.rayas as Raya[]).map(([x1, y1, x2, y2]) => (
              <line
                key={`${x1}-${y1}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={SIMBOLO.mira.rayas_grosor}
              />
            ))}
            <circle cx={MX} cy={MY} r={SIMBOLO.mira.punto} fill="var(--senal)" stroke="none" />
          </g>
        </svg>
        <div className="flex flex-col items-center gap-1 overflow-hidden">
          <span className="ta-titulo t-rotulo cifras">Acto {numero}</span>
          <span className="ta-titulo ta-nombre">{nombre}</span>
        </div>
      </div>
    </div>
  );
}
