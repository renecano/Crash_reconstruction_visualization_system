import { metadatos } from "@/components/sitio/documento";
import PortadaCesviPagina from "@/paginas/portada-cesvi";

export const metadata = metadatos("es", "inicio", "/");

export default function Page() {
  return <PortadaCesviPagina lang="es" />;
}
