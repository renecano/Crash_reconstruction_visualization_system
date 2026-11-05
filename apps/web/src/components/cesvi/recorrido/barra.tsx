"use client";
/**
 * La barra del recorrido, la misma para todo caso de /cesvi (ADR 0079), con el diseño «Laboratorio»
 * (prompt §4): 72 px, la marca y el caso en mono a la izquierda; al centro los actos en una rejilla
 * con una línea de 2 px que se llena hasta el acto actual y remata en un punto naranja; a la derecha
 * Presentar / Trabajar, las acciones del caso, el tema, «Transiciones» y «Exportar».
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Logotipo } from "@/components/sitio/logo";
import { RUTAS } from "@/lib/casos";
import type { ActoDelCaso } from "@/lib/actos";
import { guardarTema, guardarTransiciones, type Modo } from "@/lib/preferencias-cesvi";

/** Los pasos del recorrido, los mismos para todo caso (ADR 0052 y 0079). */
export const PASOS = [
  "El caso",
  "El hecho",
  "El lugar",
  "La reconstrucción",
  "Los daños",
  "Los números",
  "Croquis contra el reporte de CESVI",
  "El dictamen",
] as const;

/** Los nombres de la barra de pasos, cortos para que quepan en una fila (maquetas). */
export const PASOS_CORTOS = [
  "Caso",
  "Hecho",
  "Lugar",
  "Reconstrucción",
  "Daños",
  "Números",
  "Reporte",
  "Dictamen",
] as const;

export function BarraRecorrido({
  pasos,
  paso,
  actos,
  irA,
  modo,
  onModo,
  tema,
  resumen,
  acciones,
  onExportar,
  abierto = () => true,
  transiciones = true,
}: {
  pasos: readonly string[];
  paso: number;
  /** Los actos del caso (prompt §4): agrupan los pasos. */
  actos: readonly ActoDelCaso[];
  irA: (i: number) => void;
  modo: Modo;
  onModo: (m: Modo) => void;
  tema: "claro" | "oscuro";
  /** Una línea sobre el caso, al trabajar (en pantallas anchas). */
  resumen?: string;
  /** Lo que el caso agrega a la barra (estado de la IA, llenar a mano, deshacer…). */
  acciones?: ReactNode;
  onExportar: () => void;
  /** Si un paso se puede abrir (V2): los futuros esperan a que se complete lo obligatorio. */
  abierto?: (i: number) => boolean;
  /** «Transiciones» entre actos (prompt §5), que el perito puede apagar. */
  transiciones?: boolean;
}) {
  const actual = Math.max(
    0,
    actos.findIndex((a) => a.pasos.includes(paso)),
  );
  /** Hasta dónde se llena la línea: el centro de la columna del acto actual. */
  const lleno = actos.length ? ((actual + 0.5) / actos.length) * 100 : 0;
  return (
    <>
      <header className="vidrio barra relative z-30 flex h-[72px] shrink-0 items-center gap-3 px-4 md:px-6">
        <Link
          href={RUTAS.lista}
          aria-label="Todos los casos"
          className="shrink-0"
          data-testid="ir-a-casos"
        >
          <Logotipo ancho={104} variante={tema === "claro" ? "logotipo-sobre-claro" : "logotipo"} />
        </Link>
        <Link
          href={RUTAS.lista}
          className="hidden shrink-0 text-[0.8125rem] font-medium text-texto-2 hover:text-texto md:inline"
          data-testid="volver-a-casos"
        >
          ← Casos
        </Link>
        {resumen ? (
          <span
            className="cifras hidden max-w-[16rem] truncate text-[0.75rem] text-texto-3 2xl:inline"
            data-testid="resumen-caso"
          >
            {resumen}
          </span>
        ) : null}
        <nav aria-label="Actos del recorrido" className="relative min-w-0 flex-1 self-stretch">
          <ol
            className="grid h-full items-center"
            style={{ gridTemplateColumns: `repeat(${actos.length}, minmax(0, 1fr))` }}
          >
            {actos.map((a, k) => {
              const primero = a.pasos[0]!;
              const esActual = k === actual;
              const hecho = k < actual;
              const puede = esActual || abierto(primero);
              return (
                <li key={a.clave} className="flex justify-center">
                  <button
                    type="button"
                    aria-label={`Acto ${k + 1}: ${a.nombre}${puede ? "" : " (completa los anteriores)"}`}
                    aria-current={esActual ? "step" : undefined}
                    disabled={!puede}
                    onClick={() => irA(primero)}
                    className={`flex h-10 min-w-0 items-center gap-1.5 rounded-control px-2 text-[0.8125rem] transition-colors ${
                      esActual
                        ? "font-semibold text-texto"
                        : `font-medium ${puede ? "hover:text-texto" : "cursor-not-allowed opacity-50"} ${hecho ? "text-texto-2" : "text-texto-3"}`
                    }`}
                    data-testid={`paso-${primero + 1}`}
                    data-acto={a.clave}
                  >
                    <span className="cifras text-[0.6875rem] text-texto-3" aria-hidden="true">
                      {String(k + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate">{a.nombre}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {/* La línea del avance: se llena hasta el acto actual y remata en el punto naranja. */}
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-linea-suave" aria-hidden="true">
            <div
              className="absolute inset-y-0 left-0 origin-left bg-texto transition-transform duration-500"
              style={{ width: "100%", transform: `scaleX(${lleno / 100})` }}
              data-testid="barra-avance"
            />
            <span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-senal transition-[left] duration-500"
              style={{ left: `${lleno}%` }}
            />
          </div>
        </nav>
        {/* Para lectores de pantalla: en qué paso de cuál acto se está. */}
        <span className="sr-only" aria-live="polite">
          Paso {paso + 1} de {pasos.length}: {pasos[paso]}
        </span>
        <div className="segmentado shrink-0" role="tablist" aria-label="Modo">
          {(["presentar", "trabajar"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              className="px-4"
              onClick={() => onModo(m)}
              data-testid={`modo-${m}`}
            >
              {m === "presentar" ? "Presentar" : "Trabajar"}
            </button>
          ))}
        </div>
        {acciones}
        <button
          type="button"
          className="boton-secundario boton-compacto grid h-9 min-h-9 w-9 shrink-0 place-items-center px-0"
          onClick={() => guardarTema(modo, tema === "claro" ? "oscuro" : "claro")}
          aria-label={tema === "claro" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
          data-testid="tema"
        >
          ◐
        </button>
        <button
          type="button"
          className="boton-secundario boton-compacto grid h-9 min-h-9 w-9 shrink-0 place-items-center px-0"
          onClick={() => guardarTransiciones(!transiciones)}
          aria-pressed={transiciones}
          aria-label={
            transiciones
              ? "Apagar las transiciones entre actos"
              : "Encender las transiciones entre actos"
          }
          title="Transiciones"
          data-testid="transiciones"
        >
          {transiciones ? "✦" : "✧"}
        </button>
        <button
          type="button"
          className="boton-secundario boton-compacto h-9 min-h-9 shrink-0"
          onClick={onExportar}
        >
          Exportar
        </button>
      </header>
    </>
  );
}
