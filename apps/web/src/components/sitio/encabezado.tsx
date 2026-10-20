"use client";
/**
 * Encabezado del sitio (docs/design/plan.md §3): logotipo a la izquierda, navegación corta y
 * cambio de idioma a la derecha. Sobre la escena 3D de la portada es transparente y se vuelve
 * vidrio oscuro al hacer scroll. En celular, el símbolo y un menú desplegable.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useIdioma } from "@/i18n/cliente";
import { rutaEn } from "@/i18n";
import { Logotipo, Simbolo } from "./logo";

export function Encabezado({ sobreEscena = false }: { sobreEscena?: boolean }) {
  const { lang, t, ruta } = useIdioma();
  const pathname = usePathname() ?? "/";
  // El menú recuerda en qué página se abrió: al navegar queda cerrado, sin un efecto.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const [desplazado, setDesplazado] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!sobreEscena) return;
    const leer = () => setDesplazado(window.scrollY > 24);
    leer();
    window.addEventListener("scroll", leer, { passive: true });
    return () => window.removeEventListener("scroll", leer);
  }, [sobreEscena]);

  const abierto = abiertoEn === pathname;
  const otro = lang === "es" ? "en" : "es";
  const enlaces = [
    { href: ruta("/cuenta"), texto: t.sitio.nav.cuenta },
    { href: ruta("/demo"), texto: t.sitio.nav.ejemplo },
    { href: ruta("/recorrido"), texto: t.sitio.nav.mide },
    { href: ruta("/historia"), texto: t.sitio.nav.historia },
  ];
  const transparente = sobreEscena && !desplazado && !abierto;

  return (
    <header
      data-testid="encabezado"
      className={`${sobreEscena ? "fixed" : "sticky"} inset-x-0 top-0 z-40 ${
        transparente ? "bg-transparent" : "vidrio barra"
      }`}
    >
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
      >
        {t.sitio.saltar}
      </a>
      <div className="pagina flex h-16 items-center justify-between gap-6">
        <Link href={ruta("/")} aria-label={t.sitio.inicio} className="flex items-center">
          <span className="hidden sm:inline-flex">
            <Logotipo ancho={148} alt="" prioridad />
          </span>
          <span className="inline-flex sm:hidden">
            <Simbolo lado={32} alt="" />
          </span>
          <span className="sr-only">{t.sitio.nombre}</span>
        </Link>
        <nav aria-label={t.sitio.navegacion} className="hidden items-center gap-6 md:flex">
          {enlaces.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              aria-current={pathname === e.href ? "page" : undefined}
              className="t-interfaz text-texto-2 no-underline hover:text-texto aria-[current=page]:text-texto"
            >
              {e.texto}
            </Link>
          ))}
          <a
            href={rutaEn(otro, pathname)}
            hrefLang={otro === "es" ? "es-MX" : "en"}
            lang={otro === "es" ? "es-MX" : "en"}
            title={t.sitio.idiomaEtiqueta}
            className="t-interfaz text-texto-2 no-underline hover:text-texto"
          >
            {t.sitio.idioma}
          </a>
        </nav>
        <button
          type="button"
          className="boton-secundario min-h-11 px-4 md:hidden"
          aria-expanded={abierto}
          aria-controls={menuId}
          onClick={() => setAbiertoEn(abierto ? null : pathname)}
        >
          {abierto ? t.sitio.cerrar : t.sitio.menu}
        </button>
      </div>
      {abierto ? (
        <nav id={menuId} aria-label={t.sitio.navegacion} className="pagina pb-6 md:hidden">
          <ul className="carril flex flex-col gap-1">
            {enlaces.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className="t-subtitulo block py-2 no-underline">
                  {e.texto}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={rutaEn(otro, pathname)}
                hrefLang={otro === "es" ? "es-MX" : "en"}
                lang={otro === "es" ? "es-MX" : "en"}
                className="t-interfaz block py-2 text-texto-2"
              >
                {t.sitio.idioma}
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
