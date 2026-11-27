import { metadatos } from "@/components/sitio/documento";
import PortadaCesviPagina, { viewportPortada } from "@/paginas/portada-cesvi";

export const metadata = metadatos("es", "inicio", "/");

export const viewport = viewportPortada;

export default function Page() {
  return <PortadaCesviPagina lang="es" />;
}
