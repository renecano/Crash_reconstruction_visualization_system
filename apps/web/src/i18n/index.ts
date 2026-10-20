/**
 * Idiomas del sitio (PLAN §11.5, ADR 0045): español de México por omisión, en la raíz, e inglés
 * completo bajo `/en`. Los textos viven en diccionarios con las mismas claves; el tipo `Dict`
 * obliga a que el inglés tenga exactamente lo que tiene el español.
 */
import { en } from "./en";
import { es } from "./es";

export type Lang = "es" | "en";
export const LANGS: readonly Lang[] = ["es", "en"];
export const HTML_LANG: Record<Lang, string> = { es: "es-MX", en: "en" };

/** El diccionario del español con sus hojas como `string` (o funciones que devuelven texto). */
export type Dict = Widen<typeof es>;
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { readonly [K in keyof T]: Widen<T[K]> };

const DICTS: Record<Lang, Dict> = { es, en };

export function dict(lang: Lang): Dict {
  return DICTS[lang];
}

/** Ruta de una página en un idioma: `/cuenta` en español, `/en/cuenta` en inglés. */
export function ruta(lang: Lang, path: string): string {
  if (lang === "es") return path;
  return path === "/" ? "/en" : `/en${path}`;
}

/** La misma página en el otro idioma (para el cambio de idioma y `hreflang`). */
export function rutaEn(lang: Lang, pathname: string): string {
  const base =
    pathname === "/en" ? "/" : pathname.startsWith("/en/") ? pathname.slice(3) : pathname;
  return ruta(lang, base);
}

export function isLang(x: unknown): x is Lang {
  return x === "es" || x === "en";
}
