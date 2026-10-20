import { metadatos } from "@/components/sitio/documento";
import CroquisPagina from "@/paginas/croquis";

export const metadata = metadatos("es", "croquis", "/croquis");

export default function Page() {
  return <CroquisPagina lang="es" />;
}
