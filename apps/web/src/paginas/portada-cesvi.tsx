import type { Viewport } from "next";
import { PortadaV3 } from "@/components/portada-v3/portada-v3";
import { textosPortadaV3 } from "@/components/portada-v3/textos";
import type { Lang } from "@/i18n";
import { datosPortadaCesvi } from "@/lib/portada-cesvi";

/** La barra del navegador, del color del fondo de la portada (los de `tokens.css`, de día y de noche). */
export const viewportPortada: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F5F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1120" },
  ],
  colorScheme: "light dark",
};

/** La portada pública: las cifras salen del índice al compilar. */
export default function PortadaCesviPagina({ lang }: { lang: Lang }) {
  return <PortadaV3 t={textosPortadaV3(lang, datosPortadaCesvi())} />;
}
