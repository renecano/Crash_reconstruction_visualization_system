"use client";
/**
 * La barra del recorrido, la misma para todo caso de /cesvi (ADR 0079): la marca (vuelve a la lista
 * de casos), los pasos al presentar, Presentar / Trabajar, las acciones propias del caso, el tema y
 * «Exportar» (va al dictamen).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Logotipo } from "@/components/sitio/logo";
import { RUTAS } from "@/lib/casos";
import { guardarTema, type Modo } from "@/lib/preferencias-cesvi";

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
  "Contra el reporte",
  "Dictamen",
] as const;

export function BarraRecorrido({
  pasos,
  pasosCortos,
  paso,
  irA,
  modo,
  onModo,
  tema,
  resumen,
  acciones,
  onExportar,
}: {
  pasos: readonly string[];
  pasosCortos: readonly string[];
  paso: number;
  irA: (i: number) => void;
  modo: Modo;
  onModo: (m: Modo) => void;
  tema: "claro" | "oscuro";
  /** Una línea sobre el caso, al trabajar. */
  resumen?: string;
  /** Lo que el caso agrega a la barra (estado de la IA, llenar a mano, deshacer…). */
  acciones?: ReactNode;
  onExportar: () => void;
}) {
  return (
    <header className="vidrio barra relative z-30 flex h-16 shrink-0 items-center gap-3 px-4 md:px-6">
      <Link
        href={RUTAS.lista}
        aria-label="Todos los casos"
        className="shrink-0"
        data-testid="ir-a-casos"
      >
        <Logotipo ancho={112} variante={tema === "claro" ? "logotipo-sobre-claro" : "logotipo"} />
      </Link>
      {modo === "trabajar" && resumen ? (
        <span className="hidden text-[0.8125rem] font-medium text-texto-2 lg:inline">
          {resumen}
        </span>
      ) : null}
      {modo === "presentar" ? (
        <nav
          aria-label="Pasos del recorrido"
          className="flex min-w-0 flex-1 items-center justify-center-safe gap-1 overflow-x-auto"
        >
          {pasos.map((nombre, i) => {
            const actual = paso === i;
            const hecho = i < paso;
            return (
              <button
                key={nombre}
                type="button"
                aria-label={`Paso ${i + 1}: ${nombre}`}
                aria-current={actual ? "step" : undefined}
                onClick={() => irA(i)}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-full text-[0.8125rem] transition-colors ${
                  actual
                    ? "bg-accion pr-3.5 pl-2 font-semibold text-accion-texto"
                    : `px-2.5 font-medium hover:bg-superficie-alta ${hecho ? "text-texto-2" : "text-texto-3"}`
                }`}
                data-testid={`paso-${i + 1}`}
              >
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full text-[0.6875rem] ${
                    actual
                      ? "bg-fondo text-texto"
                      : hecho
                        ? "bg-superficie-alta text-texto-2"
                        : "border border-linea"
                  }`}
                  aria-hidden="true"
                >
                  {hecho ? "✓" : i + 1}
                </span>
                <span className={actual ? "" : "hidden 2xl:inline"}>{pasosCortos[i]}</span>
              </button>
            );
          })}
        </nav>
      ) : (
        <span className="flex-1" />
      )}
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
        className={`${modo === "trabajar" ? "boton-principal" : "boton-secundario"} boton-compacto h-9 min-h-9 shrink-0`}
        onClick={onExportar}
      >
        Exportar
      </button>
    </header>
  );
}
