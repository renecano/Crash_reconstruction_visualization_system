import { metadatos } from "@/components/sitio/documento";
import VisorPagina from "@/paginas/visor";

export const metadata = metadatos("es", "visor", "/visor");

export default function Page() {
  return <VisorPagina lang="es" />;
}
