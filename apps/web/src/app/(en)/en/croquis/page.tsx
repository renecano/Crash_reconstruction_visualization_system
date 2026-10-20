import { metadatos } from "@/components/sitio/documento";
import CroquisPagina from "@/paginas/croquis";

export const metadata = metadatos("en", "croquis", "/croquis");

export default function Page() {
  return <CroquisPagina lang="en" />;
}
