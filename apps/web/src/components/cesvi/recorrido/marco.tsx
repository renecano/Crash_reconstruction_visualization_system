"use client";
/**
 * El marco común de las pantallas del recorrido (rediseño, ADR 0054; maquetas en
 * docs/cesvi/rediseno/): el rótulo «PASO N DE 8», el avance (Anterior · Siguiente), el botón de
 * «Ver detalle», las dos composiciones (página sobre grafito y panel de vidrio sobre el mapa), la
 * etiqueta de cada vehículo y las insignias de fuente.
 */
import { createContext, useContext, type ReactNode } from "react";

export interface NavRecorrido {
  paso: number;
  total: number;
  irA: (n: number) => void;
  abrirDetalle: () => void;
  /** «Ver detalle» o «Ver cálculo», según el paso. */
  tituloDetalle: string;
}

const Contexto = createContext<NavRecorrido | null>(null);
export const ProveedorRecorrido = Contexto.Provider;

export function useRecorrido(): NavRecorrido {
  const nav = useContext(Contexto);
  if (!nav) throw new Error("useRecorrido fuera del recorrido");
  return nav;
}

/** «PASO 4 DE 8», con un punto de señal si el paso lo pide (la sugerencia). */
export function Rotulo({ extra, senal }: { extra?: string; senal?: boolean }) {
  const { paso, total } = useRecorrido();
  return (
    <p className="t-rotulo flex items-center gap-2.5">
      {senal ? <span className="h-2 w-2 rounded-full bg-senal" aria-hidden="true" /> : null}
      Paso {paso + 1} de {total}
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}

/** La frase del paso: una sola, corta (máximo ~25 palabras). */
export function Frase({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`t-cuerpo text-texto-2 ${className}`} aria-live="polite" data-testid="frase">
      {children}
    </p>
  );
}

export function BotonDetalle({ className = "" }: { className?: string }) {
  const { abrirDetalle, tituloDetalle } = useRecorrido();
  return (
    <button
      type="button"
      className={`boton-secundario boton-compacto ${className}`}
      onClick={abrirDetalle}
      data-testid="ver-detalle"
    >
      {tituloDetalle}
    </button>
  );
}

/** Anterior · Siguiente (el siguiente es la acción principal: blanco). */
export function Navegacion({
  siguiente = "Siguiente",
  ancho = false,
  className = "",
}: {
  siguiente?: string;
  /** Los dos botones ocupan el ancho del panel (composición sobre el mapa). */
  ancho?: boolean;
  className?: string;
}) {
  const { paso, total, irA } = useRecorrido();
  return (
    <div className={`flex gap-3 ${className}`}>
      {paso > 0 ? (
        <button
          type="button"
          className={`boton-secundario ${ancho ? "flex-1" : ""}`}
          onClick={() => irA(paso - 1)}
          aria-label="Paso anterior"
        >
          ← Anterior
        </button>
      ) : null}
      {paso < total - 1 ? (
        <button
          type="button"
          className={`boton-principal ${ancho ? "flex-[1.4]" : ""}`}
          onClick={() => irA(paso + 1)}
          data-testid="siguiente"
        >
          {siguiente} →
        </button>
      ) : null}
    </div>
  );
}

/** Pantalla de página: contenido sobre grafito, centrado y con desplazamiento propio. */
export function Pagina({
  children,
  ancho = "max-w-[1240px]",
}: {
  children: ReactNode;
  ancho?: string;
}) {
  return (
    <div className="h-full overflow-y-auto bg-fondo">
      <div className={`mx-auto flex flex-col gap-8 px-6 pt-10 pb-16 md:pt-14 ${ancho}`}>
        {children}
      </div>
    </div>
  );
}

/** Panel de vidrio a la izquierda, sobre el mapa (maqueta del paso 4). */
export function PanelMapa({ children }: { children: ReactNode }) {
  return (
    <section className="vidrio pointer-events-auto flex max-h-full w-[min(360px,calc(100vw-2rem))] flex-col gap-4 self-start overflow-y-auto p-6">
      {children}
    </section>
  );
}

const CLASE_VEHICULO = { A: "etiqueta-vehiculo-a", B: "etiqueta-vehiculo-b" } as const;
export const TEXTO_VEHICULO = { A: "text-vehiculo-a", B: "text-vehiculo-b" } as const;
export const FONDO_VEHICULO = { A: "bg-vehiculo-a", B: "bg-vehiculo-b" } as const;

/** «A · Silverado» en el color del vehículo. */
export function EtiquetaVehiculo({
  letra,
  nombre,
  testid,
}: {
  letra: "A" | "B";
  nombre: string;
  testid?: string;
}) {
  return (
    <span className={`etiqueta-vehiculo ${CLASE_VEHICULO[letra]}`} data-testid={testid}>
      {nombre}
    </span>
  );
}

/** La fuente de un dato: DECLARACIÓN, EXPEDIENTE, PERITO o SUPUESTO (punteada). */
export function Insignia({
  children,
  tipo = "normal",
}: {
  children: ReactNode;
  tipo?: "normal" | "supuesto" | "senal";
}) {
  return (
    <span
      className={`insignia ${tipo === "supuesto" ? "insignia-supuesto" : tipo === "senal" ? "insignia-senal" : ""}`}
    >
      {children}
    </span>
  );
}
