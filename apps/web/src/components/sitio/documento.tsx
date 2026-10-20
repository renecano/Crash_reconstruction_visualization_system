/**
 * Documento raíz de cada idioma (los layouts raíz de `app/(es)` y `app/(en)`): `<html lang>`,
 * la marca en los metadatos, el idioma para los componentes de cliente y el service worker.
 */
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { HTML_LANG, dict, ruta, type Lang } from "@/i18n";
import { IdiomaProvider } from "@/i18n/cliente";

const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? "https://croquis-sage.vercel.app";

export const viewport: Viewport = {
  themeColor: "#0B0D0F",
  colorScheme: "dark",
};

/** Metadatos de una página: título, descripción, idiomas alternos, íconos e imagen para redes. */
export function metadatos(
  lang: Lang,
  pagina: keyof ReturnType<typeof dict>["meta"],
  path: string,
  extra: Metadata = {},
): Metadata {
  const m = dict(lang).meta[pagina];
  return {
    metadataBase: new URL(SITIO),
    title: m.titulo,
    description: m.descripcion,
    alternates: {
      canonical: ruta(lang, path),
      languages: { "es-MX": ruta("es", path), en: ruta("en", path) },
    },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/marca/favicon.svg", type: "image/svg+xml" },
        { url: "/iconos/icono-32.png", sizes: "32x32", type: "image/png" },
        { url: "/iconos/icono-16.png", sizes: "16x16", type: "image/png" },
      ],
      apple: [{ url: "/iconos/icono-180.png", sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      siteName: "Croquis",
      locale: lang === "es" ? "es_MX" : "en_US",
      title: m.titulo,
      description: m.descripcion,
      images: [{ url: "/redes.png", width: 1200, height: 630, alt: m.titulo }],
    },
    twitter: {
      card: "summary_large_image",
      title: m.titulo,
      description: m.descripcion,
      images: ["/redes.png"],
    },
    ...extra,
  };
}

export function Documento({ lang, children }: { lang: Lang; children: ReactNode }) {
  // La fuente se pide junto con el HTML: si llega después del primer pintado, el texto se vuelve a
  // acomodar y la página salta (CLS, PLAN §11.6).
  preload("/fuente/anybody-latin-croquis.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  return (
    <html lang={HTML_LANG[lang]} className="h-full">
      <body className="flex min-h-full flex-col">
        <IdiomaProvider lang={lang}>{children}</IdiomaProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
