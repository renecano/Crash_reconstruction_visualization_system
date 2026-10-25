import type { TomaPortada } from "@/components/portada-v3/comportamiento";
import { PortadaV3 } from "@/components/portada-v3/portada-v3";
import { textosPortadaV3 } from "@/components/portada-v3/textos";
import type { Lang } from "@/i18n";
import { datosPortadaCesvi } from "@/lib/portada-cesvi";
import tomas from "../../public/portada/tomas.json";

/**
 * Las tomas de fondo: la reconstrucción de Croquis grabada con `demo/portada/grabar-tomas.mjs`. Si
 * falta el manifiesto, el build falla.
 */
export const TOMAS_PORTADA: TomaPortada[] = [...tomas]
  .sort((a, b) => a.toma - b.toma)
  .map((t) => ({
    mp4: `/portada/toma-${t.toma}.mp4`,
    movil: `/portada/toma-${t.toma}-movil.mp4`,
    poster: `/portada/toma-${t.toma}.jpg`,
  }));

/** La portada v3 para los peritos de CESVI: las cifras se calculan al compilar. */
export default function PortadaCesviPagina({ lang }: { lang: Lang }) {
  return <PortadaV3 t={textosPortadaV3(lang, datosPortadaCesvi())} tomas={TOMAS_PORTADA} />;
}
