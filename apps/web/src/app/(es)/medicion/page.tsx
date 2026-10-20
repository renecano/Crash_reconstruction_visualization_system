import { metadatos } from "@/components/sitio/documento";
import MedicionPagina from "@/paginas/medicion";

export const metadata = metadatos("es", "medicion", "/medicion");

export default function Page() {
  return <MedicionPagina lang="es" />;
}
