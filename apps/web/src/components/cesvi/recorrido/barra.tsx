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
  "Reporte",
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
  abierto = () => true,
}: {
  pasos: readonly string[];
  pasosCortos: readonly string[];
  paso: number;
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
}) {
  return (
    <>
      <header className="vidrio barra relative z-30 flex h-16 shrink-0 items-center gap-3 px-4 md:px-6">
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
          <span className="hidden max-w-[16rem] truncate text-[0.8125rem] text-texto-3 2xl:inline">
            {resumen}
          </span>
        ) : null}
        <nav
          aria-label="Pasos del recorrido"
          className="flex min-w-0 flex-1 items-center justify-center-safe gap-0.5 overflow-x-auto"
        >
          {pasos.map((nombre, i) => {
            const actual = paso === i;
            const hecho = i < paso;
            const puede = actual || abierto(i);
            return (
              <button
                key={nombre}
                type="button"
                aria-label={`Paso ${i + 1}: ${nombre}${puede ? "" : " (completa los pasos anteriores)"}`}
                aria-current={actual ? "step" : undefined}
                disabled={!puede}
                onClick={() => irA(i)}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-full text-[0.8125rem] transition-colors ${
                  actual
                    ? "bg-accion pr-3.5 pl-2 font-semibold text-accion-texto"
                    : `px-2.5 font-medium ${puede ? "hover:bg-superficie-alta" : "cursor-not-allowed"} ${hecho ? "text-texto-2" : puede ? "text-texto-3" : "text-texto-3 opacity-50"}`
                }`}
                data-testid={`paso-${i + 1}`}
              >
                {actual ? (
                  <span
                    className="grid h-5 w-5 place-items-center rounded-full bg-fondo text-[0.6875rem] text-texto"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                ) : null}
                <span>
                  {actual ? "" : hecho ? "✓ " : `${i + 1} `}
                  {pasosCortos[i]}
                </span>
              </button>
            );
          })}
        </nav>
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
          className="boton-secundario boton-compacto h-9 min-h-9 shrink-0"
          onClick={onExportar}
        >
          Exportar
        </button>
      </header>
      <div className="h-[3px] shrink-0 bg-superficie" aria-hidden="true">
        <div
          className="h-full bg-texto transition-[width]"
          style={{ width: `${((paso + 1) / pasos.length) * 100}%` }}
          data-testid="barra-avance"
        />
      </div>
    </>
  );
}
