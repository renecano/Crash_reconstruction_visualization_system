"use client";

/**
 * El marco de las vistas 3D y 2D de un caso (René, 2026-11-17): hoy los controles iban encima de la
 * escena (cámaras, «Editar en 3D», «Descargar paquete 3D», la barra de reproducción, el minimapa, la
 * leyenda) y la tapaban.
 *
 * - **Vista normal:** una barra arriba (la vista y las cámaras a la izquierda; las acciones a la
 *   derecha) y la de reproducción abajo, fuera del cuadro. Debajo, «Supuestos y notas del cálculo»,
 *   cerrado.
 * - **Pantalla completa** (botón, o la tecla F; Esc sale): las barras van sobre la escena y se
 *   esconden solas a los 3 s sin mover el mouse; reaparecen al moverlo o con el teclado. Espacio
 *   reproduce o pausa.
 *
 * Los controles no se mudan de componente: cada uno se dibuja en su ranura del marco con un portal
 * (`EnRanura`). Fuera de un marco (Presentar, el dictamen, `/visor`) se dibujan donde siempre.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type NombreRanura = "vista" | "izquierda" | "derecha" | "abajo" | "pie";
type Ranuras = Record<NombreRanura, HTMLElement | null> & { completa: boolean };

const Contexto = createContext<Ranuras | null>(null);

/** Si hay un marco con barras alrededor, y si está a pantalla completa. */
export function useMarco(): { enMarco: boolean; completa: boolean } {
  const r = useContext(Contexto);
  return { enMarco: Boolean(r?.abajo), completa: r?.completa ?? false };
}

/**
 * Dibuja `children` en una ranura del marco; sin marco, `fuera` (o nada). Así un control puede ir en
 * la barra cuando hay marco y encima de la escena cuando no lo hay.
 */
export function EnRanura({
  ranura,
  children,
  fuera = null,
}: {
  ranura: NombreRanura;
  children: ReactNode;
  fuera?: ReactNode;
}) {
  const r = useContext(Contexto);
  const destino = r?.[ranura] ?? null;
  return destino ? createPortal(children, destino) : <>{fuera}</>;
}

/** Segundos sin mover el mouse para esconder los controles a pantalla completa. */
export const OCULTAR_TRAS_MS = 3000;

/** Si una tecla viene de un campo donde se escribe (ahí F y Espacio son del texto). */
function esCampo(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

export function MarcoVista({
  children,
  conBarras,
  notas = null,
  className = "",
  etiqueta = "Vista del caso",
}: {
  children: ReactNode;
  /** Con las barras arriba y abajo (hay reconstrucción a la vista). Sin ellas, solo el lienzo. */
  conBarras: boolean;
  /** «Supuestos y notas del cálculo»: el desplegable de abajo, cerrado al abrir. */
  notas?: ReactNode;
  className?: string;
  etiqueta?: string;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const [ranuras, setRanuras] = useState<Ranuras>({
    vista: null,
    izquierda: null,
    derecha: null,
    abajo: null,
    pie: null,
    completa: false,
  });
  // Una ref con función por ranura: estables, para que React no las vuelva a llamar en cada render.
  const fijar = (n: NombreRanura, el: HTMLElement | null) =>
    setRanuras((r) => (r[n] === el ? r : { ...r, [n]: el }));
  const refVista = useCallback((el: HTMLDivElement | null) => fijar("vista", el), []);
  const refIzquierda = useCallback((el: HTMLDivElement | null) => fijar("izquierda", el), []);
  const refDerecha = useCallback((el: HTMLDivElement | null) => fijar("derecha", el), []);
  const refAbajo = useCallback((el: HTMLDivElement | null) => fijar("abajo", el), []);
  const refPie = useCallback((el: HTMLDivElement | null) => fijar("pie", el), []);
  const completa = ranuras.completa;
  const [visibles, setVisibles] = useState(true);
  const reloj = useRef<number | null>(null);

  // La pantalla completa la lleva el navegador (Esc también sale por su cuenta).
  useEffect(() => {
    const alCambiar = () => {
      const si =
        document.fullscreenElement !== null && document.fullscreenElement === marco.current;
      setRanuras((r) => (r.completa === si ? r : { ...r, completa: si }));
      setVisibles(true);
    };
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  const alternarCompleta = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void marco.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  // A pantalla completa los controles se esconden solos y vuelven con el mouse o el teclado.
  // El reloj que los esconde: se arma al entrar a pantalla completa y con cada movimiento.
  const armarReloj = useCallback(() => {
    if (reloj.current !== null) window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => {
      // Con el foco de teclado en un control, se quedan: quien usa el teclado los está usando. Un clic
      // con el mouse no cuenta (deja el foco, pero no `:focus-visible`).
      const dentro = marco.current?.querySelector("[data-barra] :focus-visible");
      if (!dentro) setVisibles(false);
    }, OCULTAR_TRAS_MS);
  }, []);
  const mostrar = useCallback(() => {
    setVisibles(true);
    armarReloj();
  }, [armarReloj]);
  useEffect(() => {
    if (completa) armarReloj();
    return () => {
      if (reloj.current !== null) window.clearTimeout(reloj.current);
    };
  }, [completa, armarReloj]);

  // F entra y sale; Esc sale; Espacio reproduce o pausa a pantalla completa. Solo con el marco a la
  // vista y fuera de los campos de texto.
  useEffect(() => {
    if (!conBarras) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || esCampo(e)) return;
      const el = marco.current;
      if (!el || el.offsetParent === null) return;
      const enCompleta = document.fullscreenElement === el;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        alternarCompleta();
      } else if (e.key === "Escape" && enCompleta) {
        void document.exitFullscreen().catch(() => undefined);
      } else if (e.key === " " && enCompleta) {
        // Espacio sobre un botón ya lo activa el navegador: no se reproduce dos veces.
        if ((e.target as HTMLElement | null)?.closest?.("button")) return;
        e.preventDefault();
        el.querySelector<HTMLButtonElement>("[data-reproducir]")?.click();
        mostrar();
      } else if (enCompleta) mostrar();
    };
    window.addEventListener("keydown", alTecla, true);
    return () => window.removeEventListener("keydown", alTecla, true);
  }, [conBarras, alternarCompleta, mostrar]);

  const ocultas = completa && !visibles;
  const barra = `flex flex-wrap items-center gap-2 transition-opacity duration-300 ${
    ocultas ? "pointer-events-none opacity-0" : "opacity-100"
  }`;
  return (
    <div
      ref={marco}
      className={`flex flex-col bg-fondo ${completa ? "cursor-default" : ""} ${ocultas ? "cursor-none" : ""} ${className}`}
      data-testid="marco-vista"
      data-completa={completa ? "si" : "no"}
      data-controles={ocultas ? "ocultos" : "visibles"}
      onPointerMove={completa ? mostrar : undefined}
      onPointerDown={completa ? mostrar : undefined}
      role="region"
      aria-label={etiqueta}
    >
      <Contexto.Provider value={conBarras ? ranuras : null}>
        {conBarras ? (
          <div
            className={`${barra} z-20 justify-between px-3 py-2 ${completa ? "absolute inset-x-0 top-0 bg-gradient-to-b from-fondo/90 to-transparent pb-6" : "border-b border-linea-suave"}`}
            data-barra="superior"
            data-testid="marco-barra-superior"
          >
            <div className="flex flex-wrap items-center gap-2">
              {/* Primero la vista (3D o 2D), después las cámaras: dos ranuras, para que el orden no
                  dependa de cuál se dibuja antes. */}
              <div ref={refVista} className="flex flex-wrap items-center gap-2 empty:hidden" />
              <div ref={refIzquierda} className="flex flex-wrap items-center gap-2 empty:hidden" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div ref={refDerecha} className="flex flex-wrap items-center gap-2" />
              <button
                type="button"
                className="boton-secundario boton-compacto"
                aria-pressed={completa}
                aria-keyshortcuts="F"
                onClick={alternarCompleta}
                data-testid="pantalla-completa"
              >
                {completa ? "Salir de pantalla completa · Esc" : "Pantalla completa · F"}
              </button>
            </div>
          </div>
        ) : null}
        <div className="relative min-h-0 flex-1 overflow-hidden" data-testid="marco-lienzo">
          {children}
        </div>
        {conBarras ? (
          <div
            className={`${barra} z-20 flex-col items-stretch px-3 py-2 ${completa ? "absolute inset-x-0 bottom-0 bg-gradient-to-t from-fondo/90 to-transparent pt-6" : "border-t border-linea-suave"}`}
            data-barra="inferior"
            data-testid="marco-barra-inferior"
          >
            <div ref={refAbajo} className="flex flex-col gap-2 empty:hidden" />
            <div ref={refPie} className="flex flex-col gap-1 empty:hidden" />
          </div>
        ) : null}
        {conBarras && notas && !completa ? (
          <details
            className="border-t border-linea-suave px-3 py-2"
            data-testid="supuestos-y-notas"
          >
            <summary className="cursor-pointer text-[0.8125rem] font-medium text-texto">
              Supuestos y notas del cálculo
            </summary>
            <div className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">{notas}</div>
          </details>
        ) : null}
      </Contexto.Provider>
    </div>
  );
}
