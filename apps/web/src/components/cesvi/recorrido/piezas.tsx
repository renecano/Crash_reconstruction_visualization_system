"use client";
/**
 * Piezas del recorrido del perito (ADR 0052 y 0054): números que se cuentan al aparecer, la silueta de un
 * vehículo vista desde arriba con sus zonas de daño, y el panel lateral de «Ver detalle».
 */
import { NOMBRE_ZONA, type Zona } from "@croquis/cesvi";
import { useEffect, useRef, useState, type ReactNode } from "react";

const reducido = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Un número que sube desde cero hasta su valor al aparecer (o aparece directo con movimiento reducido). */
export function NumeroAnimado({
  valor,
  decimales,
  duracionMs = 1200,
  testid,
}: {
  valor: number;
  decimales: number;
  duracionMs?: number;
  testid?: string;
}) {
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    if (reducido()) {
      const id = requestAnimationFrame(() => setMostrado(valor));
      return () => cancelAnimationFrame(id);
    }
    let id = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const f = Math.min(1, (ahora - inicio) / duracionMs);
      setMostrado(valor * (1 - (1 - f) ** 3));
      if (f < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [valor, duracionMs]);
  return (
    <span className="cifras" data-testid={testid} data-valor={valor.toFixed(decimales)}>
      {mostrado.toFixed(decimales)}
    </span>
  );
}

/** Rectángulos de cada zona en la silueta (viewBox 100 × 200, frente hacia arriba). */
const ZONAS_SVG: Record<Zona, [number, number, number, number]> = {
  frontal_izquierda: [10, 8, 27, 34],
  frontal_centro: [37, 8, 26, 34],
  frontal_derecha: [63, 8, 27, 34],
  lateral_izquierdo: [6, 46, 16, 108],
  lateral_derecho: [78, 46, 16, 108],
  posterior_izquierda: [10, 158, 27, 34],
  posterior_centro: [37, 158, 26, 34],
  posterior_derecha: [63, 158, 27, 34],
};

/**
 * Un vehículo visto desde arriba, frente hacia arriba, con sus zonas de daño iluminadas. Si es
 * editable, el perito prende y apaga zonas (con clic o teclado).
 */
export function Silueta({
  zonas,
  etiqueta,
  letra,
  onCambio,
  testid,
}: {
  zonas: readonly Zona[];
  etiqueta: string;
  /** El vehículo: su contorno y sus daños van en su color (ADR 0053 y 0054). */
  letra?: "A" | "B";
  onCambio?: (z: Zona[]) => void;
  testid?: string;
}) {
  const trazo =
    letra === "A" ? "stroke-vehiculo-a" : letra === "B" ? "stroke-vehiculo-b" : "stroke-texto-3";
  const relleno =
    letra === "A" ? "fill-vehiculo-a" : letra === "B" ? "fill-vehiculo-b" : "fill-senal";
  return (
    <svg
      viewBox="0 0 100 200"
      className="h-full max-h-[52vh] w-auto"
      role="group"
      aria-label={`${etiqueta}: ${zonas.length ? zonas.map((z) => NOMBRE_ZONA[z]).join(", ") : "sin zonas de daño"}`}
      data-testid={testid}
    >
      <rect
        x="8"
        y="6"
        width="84"
        height="188"
        rx="20"
        className={`fill-superficie-alta ${trazo}`}
        strokeWidth={letra ? 3 : 1.5}
      />
      <rect x="20" y="48" width="60" height="30" rx="6" className="fill-fondo" opacity="0.55" />
      <rect x="20" y="120" width="60" height="22" rx="6" className="fill-fondo" opacity="0.35" />
      {(Object.keys(ZONAS_SVG) as Zona[]).map((z) => {
        const [x, y, w, h] = ZONAS_SVG[z];
        const activa = zonas.includes(z);
        const alternar = () => onCambio?.(activa ? zonas.filter((q) => q !== z) : [...zonas, z]);
        return (
          <rect
            key={z}
            x={x}
            y={y}
            width={w}
            height={h}
            rx="4"
            className={`transition-[fill-opacity] duration-500 ${activa ? relleno : "fill-transparent"} ${onCambio ? "cursor-pointer hover:stroke-texto-2" : ""}`}
            fillOpacity={activa ? 0.9 : 0}
            stroke="transparent"
            strokeWidth="1.5"
            role={onCambio ? "checkbox" : undefined}
            aria-checked={onCambio ? activa : undefined}
            aria-label={onCambio ? NOMBRE_ZONA[z] : undefined}
            tabIndex={onCambio ? 0 : undefined}
            onClick={alternar}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                alternar();
              }
            }}
            data-zona={z}
          />
        );
      })}
    </svg>
  );
}

/** Panel lateral de detalle: datos completos, fórmulas y tablas; se cierra con Esc. */
export function PanelDetalle({
  titulo,
  abierto,
  onCerrar,
  children,
}: {
  titulo: string;
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return undefined;
    ref.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, onCerrar]);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={titulo}
      aria-hidden={!abierto}
      inert={!abierto}
      className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-3xl flex-col gap-6 overflow-y-auto border-l border-linea-suave bg-superficie p-6 shadow-2xl outline-none transition-transform duration-500 md:p-10 ${abierto ? "translate-x-0" : "translate-x-full"}`}
      data-testid="panel-detalle"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="t-panel">{titulo}</h2>
        <button
          type="button"
          className="boton-secundario boton-compacto h-10 w-10 shrink-0 px-0"
          onClick={onCerrar}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
      {/* Siempre montado: lo que calcula el panel (p. ej. los cálculos) lo usan los demás pasos. */}
      {children}
    </aside>
  );
}
