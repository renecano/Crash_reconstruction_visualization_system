"use client";
/** Idioma para los componentes de cliente: lo pone el layout raíz de cada idioma. */
import { createContext, useContext, type ReactNode } from "react";
import { dict, ruta, type Dict, type Lang } from "./index";

const Ctx = createContext<Lang>("es");

export function IdiomaProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useIdioma(): { lang: Lang; t: Dict; ruta: (path: string) => string } {
  const lang = useContext(Ctx);
  return { lang, t: dict(lang), ruta: (path: string) => ruta(lang, path) };
}
