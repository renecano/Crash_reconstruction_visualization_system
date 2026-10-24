import { PortadaCesvi } from "@/components/portada-cesvi/portada-cesvi";
import type { Lang } from "@/i18n";
import { datosPortadaCesvi } from "@/lib/portada-cesvi";

/** La portada para los peritos de CESVI (punto 4 de René): las cifras se calculan al compilar. */
export default function PortadaCesviPagina({ lang }: { lang: Lang }) {
  return <PortadaCesvi lang={lang} datos={datosPortadaCesvi()} />;
}
