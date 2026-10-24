"use client";
/**
 * El marco de las pantallas de Croquis para CESVI fuera del recorrido (R9, ADR 0073): la barra del
 * recorrido con la marca, la navegación entre las pantallas, Presentar / Trabajar y el tema
 * recordado por modo (`preferencias-cesvi`, ADR 0057), y la leyenda de reconstrucción de apoyo.
 *
 * Trabajar muestra todo lo que se edita; Presentar oculta lo que lleva `solo-trabajar` (los
 * controles de edición) y deja la narración y los resultados, para enseñarlos.
 */
import { LEGEND_TEXT_CESVI } from "@croquis/scene-schema";
import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Logotipo } from "@/components/sitio/logo";
import { guardarTema, useTema, type Modo, type Tema } from "@/lib/preferencias-cesvi";

export type SeccionCesvi = "casos" | "reproduccion";

/** Las pantallas, en el orden de la barra. */
export const SECCIONES: readonly { clave: SeccionCesvi; ruta: string; nombre: string }[] = [
  { clave: "casos", ruta: "/cesvi", nombre: "Casos" },
  { clave: "reproduccion", ruta: "/cesvi/reproduccion", nombre: "Reproducción de reportes" },
];

const ModoContexto = createContext<{ modo: Modo; tema: Tema }>({ modo: "trabajar", tema: "claro" });

/** El modo de la pantalla (Presentar o Trabajar) y su tema. */
export function useModoCesvi(): { modo: Modo; tema: Tema } {
  return useContext(ModoContexto);
}

export function MarcoCesvi({
  seccion,
  modoInicial = "trabajar",
  conModos = true,
  children,
}: {
  seccion: SeccionCesvi;
  /** El modo al abrir: Trabajar en las herramientas, Presentar en lo que solo se consulta. */
  modoInicial?: Modo;
  /** Sin modos (una pantalla que solo se consulta), queda solo el tema. */
  conModos?: boolean;
  children: ReactNode;
}) {
  const [modo, setModo] = useState<Modo>(modoInicial);
  const tema = useTema(modo);
  return (
    <ModoContexto.Provider value={{ modo, tema }}>
      <div
        className="min-h-screen bg-fondo text-texto"
        data-tema={tema}
        data-modo={modo}
        data-testid="marco-cesvi"
      >
        <header className="vidrio barra sticky top-0 z-30 flex h-16 items-center gap-3 px-4 md:px-6">
          <Link href="/cesvi" aria-label="Croquis para CESVI" className="shrink-0">
            <Logotipo
              ancho={112}
              variante={tema === "claro" ? "logotipo-sobre-claro" : "logotipo"}
            />
          </Link>
          <nav
            aria-label="Pantallas"
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            {SECCIONES.map((s) => (
              <Link
                key={s.clave}
                href={s.ruta}
                aria-current={s.clave === seccion ? "page" : undefined}
                className={`inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[0.8125rem] ${
                  s.clave === seccion
                    ? "bg-texto font-semibold text-fondo"
                    : "text-texto-2 hover:text-texto"
                }`}
                data-testid={`seccion-${s.clave}`}
              >
                {s.nombre}
              </Link>
            ))}
          </nav>
          {conModos ? (
            <div className="segmentado shrink-0" role="tablist" aria-label="Modo">
              {(["presentar", "trabajar"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={modo === m}
                  className="px-4"
                  onClick={() => setModo(m)}
                  data-testid={`modo-${m}`}
                >
                  {m === "presentar" ? "Presentar" : "Trabajar"}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="boton-secundario boton-compacto grid h-9 min-h-9 w-9 shrink-0 place-items-center px-0"
            onClick={() => guardarTema(modo, tema === "claro" ? "oscuro" : "claro")}
            aria-label={tema === "claro" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
            data-testid="tema"
          >
            ◐
          </button>
        </header>
        {children}
        <footer className="t-nota px-4 pb-6 text-texto-3 md:px-8">
          <div className="mx-auto max-w-[1200px]">{LEGEND_TEXT_CESVI}</div>
        </footer>
      </div>
    </ModoContexto.Provider>
  );
}
