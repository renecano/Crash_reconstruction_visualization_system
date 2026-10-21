import { metadatos } from "@/components/sitio/documento";
import MedicionPagina from "@/paginas/medicion";

export const metadata = metadatos("en", "medicion", "/medicion");

export default function Page() {
  return <MedicionPagina lang="en" />;
}
